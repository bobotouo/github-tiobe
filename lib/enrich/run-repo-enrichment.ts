import pLimit from "p-limit";
import { and, eq, inArray, sql } from "drizzle-orm";

import {
  STAR_TIERS,
  starsSearchQualifier,
  TIER_IDS,
  type TierId,
} from "@/lib/constants";
import { buildRepoEnrichMessages, REPO_ENRICH_PROMPT_VERSION } from "@/lib/enrich/prompt";
import { relinkSummariesToRun } from "@/lib/enrich/relink-enrichments";
import { requireDb } from "@/lib/db/index";
import { collectionRuns, repoEnrichments } from "@/lib/db/schema";
import {
  getEnrichGithubConcurrency,
  getEnrichLlmConcurrency,
  getLlmModel,
  parseEnvInt,
} from "@/lib/env-config";
import { fetchRepoMetadata } from "@/lib/github/repo-metadata";
import { searchRepositories } from "@/lib/github/search";
import {
  chatJsonCompletion,
  parseJsonObjectFromLlmText,
} from "@/lib/llm/openai-compatible";

export type RunRepoEnrichmentOptions = {
  runDate: string;
  /** 只处理某一档；缺省为当天所有成功档 */
  tier?: TierId;
  /** 每档最多处理多少个仓（控制成本） */
  maxReposPerTier: number;
  /** 已有 LLM 归纳时是否覆盖 */
  force: boolean;
  /** 只写元数据，不调 LLM（llm_model=metadata-only） */
  skipLlm: boolean;
};

export type TierEnrichSummary = {
  tier: TierId;
  runId: number;
  attempted: number;
  skipped: number;
  relinked: number;
  failed: number;
  error?: string;
};

export type EnrichSummary = {
  runDate: string;
  tiers: TierEnrichSummary[];
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertValidRunDate(s: string): void {
  if (!ISO_DAY.test(s)) {
    throw new Error(`invalid runDate (expected YYYY-MM-DD): ${s}`);
  }
  const t = new Date(`${s}T12:00:00.000Z`).getTime();
  if (Number.isNaN(t)) {
    throw new Error(`invalid runDate (not a calendar day): ${s}`);
  }
}

function normalizeLlmPayload(raw: unknown): {
  summary: string;
  domains: string[];
  repoKind: string | null;
  extra: Record<string, unknown>;
} {
  if (!raw || typeof raw !== "object") {
    throw new Error("LLM JSON 非对象");
  }
  const o = raw as Record<string, unknown>;
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  const domains = Array.isArray(o.domains)
    ? o.domains.filter((x): x is string => typeof x === "string").map((s) => s.trim())
    : [];
  const repoKind = typeof o.repo_kind === "string" ? o.repo_kind.trim() : null;
  const extra =
    o.extra && typeof o.extra === "object" && !Array.isArray(o.extra)
      ? (o.extra as Record<string, unknown>)
      : {};
  return { summary, domains, repoKind, extra };
}

function fallbackPayloadFromText(
  rawText: string,
  meta: {
    description: string | null;
    topics: string[] | null;
    language: string | null;
  },
): {
  summary: string;
  domains: string[];
  repoKind: string | null;
  extra: Record<string, unknown>;
} {
  const clean = rawText
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const summaryBase = clean || meta.description || "仓库用途分析失败，已保留元数据。";
  const summary =
    summaryBase.length > 140 ? `${summaryBase.slice(0, 139).trim()}…` : summaryBase;
  const domains = (meta.topics ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 5);
  if (domains.length < 1 && meta.language?.trim()) {
    domains.push(meta.language.trim());
  }
  return {
    summary,
    domains,
    repoKind: null,
    extra: clean ? { fallback: "plain_text", raw_text: clean.slice(0, 2000) } : {},
  };
}

async function upsertEnrichmentRow(
  row: typeof repoEnrichments.$inferInsert,
): Promise<void> {
  const db = requireDb();
  await db
    .insert(repoEnrichments)
    .values(row)
    .onConflictDoUpdate({
      target: [repoEnrichments.fullName],
      set: {
        runId: sql.raw('excluded."run_id"'),
        description: sql.raw('excluded."description"'),
        topics: sql.raw('excluded."topics"'),
        starCount: sql.raw('excluded."star_count"'),
        primaryLanguage: sql.raw('excluded."primary_language"'),
        homepage: sql.raw('excluded."homepage"'),
        htmlUrl: sql.raw('excluded."html_url"'),
        llmSummary: sql.raw('excluded."llm_summary"'),
        llmDomains: sql.raw('excluded."llm_domains"'),
        llmRepoKind: sql.raw('excluded."llm_repo_kind"'),
        llmExtra: sql.raw('excluded."llm_extra"'),
        llmModel: sql.raw('excluded."llm_model"'),
        llmPromptVersion: sql.raw('excluded."llm_prompt_version"'),
        enrichedAt: sql.raw('excluded."enriched_at"'),
      },
    });
}

export async function runRepoEnrichment(
  opts: RunRepoEnrichmentOptions,
): Promise<EnrichSummary> {
  const startedAt = Date.now();
  const db = requireDb();
  assertValidRunDate(opts.runDate);
  const llmModel = getLlmModel();
  const llmConcurrency = getEnrichLlmConcurrency();
  const ghConcurrency = getEnrichGithubConcurrency();
  const llm429CooldownMs = parseEnvInt("ENRICH_LLM_429_COOLDOWN_MS", 180_000, {
    min: 10_000,
    max: 600_000,
  });
  let llm429Until = 0;

  const summary: EnrichSummary = { runDate: opts.runDate, tiers: [] };
  const successRuns = await db
    .select({
      id: collectionRuns.id,
      tier: collectionRuns.tier,
      pushedAfter: collectionRuns.pushedAfter,
      repoCount: collectionRuns.repoCount,
    })
    .from(collectionRuns)
    .where(
      and(
        eq(collectionRuns.runDate, opts.runDate),
        eq(collectionRuns.status, "success"),
      ),
    );

  if (successRuns.length < 1) {
    throw new Error(`no success runs found for ${opts.runDate}`);
  }

  const runByTier = new Map<TierId, (typeof successRuns)[number]>();
  for (const run of successRuns) {
    if (TIER_IDS.includes(run.tier as TierId)) {
      runByTier.set(run.tier as TierId, run);
    }
  }

  const tiers: TierId[] = opts.tier
    ? [opts.tier]
    : TIER_IDS.filter((tier) => runByTier.has(tier));

  if (tiers.length < 1) {
    throw new Error(`no supported tier runs found for ${opts.runDate}`);
  }

  if (opts.tier && !runByTier.has(opts.tier)) {
    throw new Error(`no success run for ${opts.runDate} tier ${opts.tier}`);
  }

  const ghLimit = pLimit(ghConcurrency);
  const llmLimit = pLimit(llmConcurrency);
  const tierPauseMs = parseEnvInt("ENRICH_TIER_PAUSE_MS", 5000, {
    min: 0,
    max: 120000,
  });
  console.info("[enrich] start", {
    runDate: opts.runDate,
    tiers,
    maxReposPerTier: opts.maxReposPerTier,
    skipLlm: opts.skipLlm,
    force: opts.force,
    ghConcurrency,
    llmConcurrency,
  });

  for (const [idx, tier] of tiers.entries()) {
    const tierSummary: TierEnrichSummary = {
      tier,
      runId: 0,
      attempted: 0,
      skipped: 0,
      relinked: 0,
      failed: 0,
    };

    try {
      console.info(`[enrich] tier ${idx + 1}/${tiers.length} ${tier} preparing`);
      const run = runByTier.get(tier);
      if (!run) throw new Error(`no success run for ${opts.runDate} tier ${tier}`);

      tierSummary.runId = run.id;

      const tierDef = STAR_TIERS.find((t) => t.id === tier);
      if (!tierDef) {
        tierSummary.error = `unknown tier ${tier}`;
        summary.tiers.push(tierSummary);
        continue;
      }

      const q = `${starsSearchQualifier(tierDef)} pushed:>${run.pushedAfter} sort:stars-desc`;
      const { repos } = await searchRepositories(q);
      const cap = Math.min(opts.maxReposPerTier, run.repoCount, repos.length);
      const slice = repos.slice(0, cap);
      console.info(`[enrich] tier ${tier} processing ${slice.length}/${repos.length} repos`);
      const fullNames = slice.map((r) => r.full_name);

      const existingRows = await db
        .select({
          fullName: repoEnrichments.fullName,
          llmSummary: repoEnrichments.llmSummary,
        })
        .from(repoEnrichments)
        .where(inArray(repoEnrichments.fullName, fullNames));

      const existingByName = new Map(
        existingRows.map((r) => [r.fullName, r.llmSummary]),
      );

      tierSummary.relinked = await relinkSummariesToRun(fullNames, run.id);
      if (tierSummary.relinked > 0) {
        console.info(
          `[enrich] tier ${tier} relinked ${tierSummary.relinked} summaries to run ${run.id}`,
        );
      }

      type Outcome = "skipped" | "ok" | "failed";
      const processOne = async (fullName: string): Promise<Outcome> => {
        const prev = existingByName.get(fullName);
        if (
          !opts.force &&
          prev != null &&
          String(prev).trim() !== "" &&
          !opts.skipLlm
        ) {
          return "skipped";
        }
        if (!opts.force && opts.skipLlm && existingByName.has(fullName)) {
          return "skipped";
        }

        let meta;
        try {
          meta = await ghLimit(() => fetchRepoMetadata(fullName));
        } catch (e) {
          console.error("[enrich] metadata", fullName, e);
          return "failed";
        }

        const baseRow: typeof repoEnrichments.$inferInsert = {
          runId: run.id,
          fullName: meta.full_name,
          description: meta.description,
          topics: meta.topics,
          starCount: meta.stargazers_count,
          primaryLanguage: meta.language,
          homepage: meta.homepage,
          htmlUrl: meta.html_url,
          llmSummary: null,
          llmDomains: null,
          llmRepoKind: null,
          llmExtra: null,
          llmModel: "metadata-only",
          llmPromptVersion: REPO_ENRICH_PROMPT_VERSION,
          enrichedAt: new Date(),
        };

        if (opts.skipLlm) {
          await upsertEnrichmentRow(baseRow);
          return "ok";
        }

        // 如果上游限流严重（连续 429），短时间内跳过 LLM，避免一直打到 429 窗口里。
        if (Date.now() < llm429Until) {
          const fallback = fallbackPayloadFromText("", {
            description: meta.description ?? null,
            topics: meta.topics ?? null,
            language: meta.language ?? null,
          });
          await upsertEnrichmentRow({
            ...baseRow,
            llmSummary: fallback.summary || null,
            llmDomains: fallback.domains.length > 0 ? fallback.domains : null,
            llmRepoKind: fallback.repoKind,
            llmExtra: Object.keys(fallback.extra).length > 0 ? fallback.extra : null,
            llmModel: `${llmModel}:429-fallback`,
            llmPromptVersion: REPO_ENRICH_PROMPT_VERSION,
            enrichedAt: new Date(),
          });
          return "ok";
        }

        try {
          const { system, user } = buildRepoEnrichMessages(meta);
          const content = await llmLimit(() =>
            chatJsonCompletion([
              { role: "system", content: system },
              { role: "user", content: user },
            ]),
          );
          let parsed: ReturnType<typeof normalizeLlmPayload>;
          try {
            parsed = normalizeLlmPayload(parseJsonObjectFromLlmText(content));
          } catch {
            parsed = fallbackPayloadFromText(content, {
              description: meta.description ?? null,
              topics: meta.topics ?? null,
              language: meta.language ?? null,
            });
            console.warn("[enrich] llm non-json fallback", fullName);
          }
          await upsertEnrichmentRow({
            ...baseRow,
            llmSummary: parsed.summary || null,
            llmDomains: parsed.domains.length > 0 ? parsed.domains : null,
            llmRepoKind: parsed.repoKind,
            llmExtra: Object.keys(parsed.extra).length > 0 ? parsed.extra : null,
            llmModel,
            llmPromptVersion: REPO_ENRICH_PROMPT_VERSION,
            enrichedAt: new Date(),
          });
          return "ok";
        } catch (e) {
          console.error("[enrich] llm", fullName, e);
          const msg = e instanceof Error ? e.message : String(e);
          if (/LLM 429:/.test(msg)) {
            llm429Until = Math.max(llm429Until, Date.now() + llm429CooldownMs);
            console.warn("[enrich] hit LLM 429; enter cooldown", {
              until: new Date(llm429Until).toISOString(),
              cooldownMs: llm429CooldownMs,
            });
          }
          const fallback = fallbackPayloadFromText("", {
            description: meta.description ?? null,
            topics: meta.topics ?? null,
            language: meta.language ?? null,
          });
          try {
            await upsertEnrichmentRow({
              ...baseRow,
              llmSummary: fallback.summary || null,
              llmDomains: fallback.domains.length > 0 ? fallback.domains : null,
              llmRepoKind: fallback.repoKind,
              llmExtra: Object.keys(fallback.extra).length > 0 ? fallback.extra : null,
              llmModel: `${llmModel}:fallback`,
              llmPromptVersion: REPO_ENRICH_PROMPT_VERSION,
              enrichedAt: new Date(),
            });
            return "ok";
          } catch {
            return "failed";
          }
        }
      };

      const outcomes = await Promise.all(
        slice.map((r) => processOne(r.full_name)),
      );
      for (const o of outcomes) {
        if (o === "skipped") tierSummary.skipped += 1;
        else if (o === "failed") tierSummary.failed += 1;
        else tierSummary.attempted += 1;
      }
      console.info(`[enrich] tier ${tier} done`, {
        attempted: tierSummary.attempted,
        skipped: tierSummary.skipped,
        relinked: tierSummary.relinked,
        failed: tierSummary.failed,
      });
    } catch (e) {
      tierSummary.error = e instanceof Error ? e.message : String(e);
      console.error(`[enrich] tier ${tier} failed`, tierSummary.error);
    }

    summary.tiers.push(tierSummary);

    // 处理完一个 tier 后暂停，降低请求密度（尤其是上游限流场景）
    if (tierPauseMs > 0 && idx < tiers.length - 1) {
      console.info(`[enrich] pause after tier ${tier} (${tierPauseMs}ms)`);
      await sleep(tierPauseMs);
    }
  }

  console.info("[enrich] finished", {
    runDate: opts.runDate,
    tiers: summary.tiers.length,
    failedTiers: summary.tiers.filter((t) => t.error).length,
    elapsedMs: Date.now() - startedAt,
  });

  return summary;
}
