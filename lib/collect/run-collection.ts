import pLimit from "p-limit";

import {
  SEARCH_RESULT_CAP,
  STAR_TIERS,
  starsSearchQualifier,
  type TierId,
} from "@/lib/constants";
import {
  getCollectConcurrency,
  getCollectMaxReposCap,
  getDataRetentionDays,
  getPushedWithinDays,
} from "@/lib/env-config";
import { formatDbError } from "@/lib/db/format-error";
import { requireDb } from "@/lib/db/index";
import {
  deleteCollectionRunsForDayTier,
  pruneCollectionRunsOlderThanRunDate,
} from "@/lib/db/prune-collection-data";
import { collectionRuns, languageSnapshots } from "@/lib/db/schema";
import { fetchRepoLanguages } from "@/lib/github/languages";
import { searchRepositories } from "@/lib/github/search";
import { mergeLanguageBytes, sharesFromBytes } from "@/lib/stats/aggregate";
import { collectLanguageHeatForRun } from "@/lib/collect/collect-language-heat";

function utcTodayString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function subtractDaysFromIsoDate(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export type CollectSummary = {
  runDate: string;
  pushedAfter: string;
  /** 本跑每档截断上限（环境变量或开发 query 覆盖） */
  repoSampleCap: number;
  tiers: Array<{
    tier: TierId;
    ok: boolean;
    repoCount?: number;
    searchTotal?: number;
    error?: string;
  }>;
  pruned: boolean;
};

export type RunCollectOptions = {
  maxReposOverride?: number;
  /**
   * 写入 `collection_runs.run_date` 的 UTC 日历日 `YYYY-MM-DD`。
   * 默认取 `now` 的 UTC 日；用于补采时与「今天」不一致则不会执行保留期裁剪，避免误删库内其它日期数据。
   */
  runDate?: string;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function assertValidRunDate(s: string): void {
  if (!ISO_DAY.test(s)) {
    throw new Error(`invalid runDate (expected YYYY-MM-DD): ${s}`);
  }
  const t = new Date(`${s}T12:00:00.000Z`).getTime();
  if (Number.isNaN(t)) {
    throw new Error(`invalid runDate (not a calendar day): ${s}`);
  }
}

export async function runDailyCollection(
  now = new Date(),
  opts?: RunCollectOptions,
): Promise<CollectSummary> {
  const startedAt = Date.now();
  const db = requireDb();
  let runDate: string;
  if (opts?.runDate?.trim()) {
    const d = opts.runDate.trim();
    assertValidRunDate(d);
    runDate = d;
  } else {
    runDate = utcTodayString(now);
  }
  const calendarTodayUtc = utcTodayString(new Date());
  const pushedWithin = getPushedWithinDays();
  const pushedAfter = subtractDaysFromIsoDate(runDate, pushedWithin);
  const maxRepos = Math.min(
    opts?.maxReposOverride ?? getCollectMaxReposCap(),
    SEARCH_RESULT_CAP,
  );
  const concurrency = getCollectConcurrency();

  console.info("[collect] start", {
    runDate,
    repoSampleCap: maxRepos,
    pushedAfter,
    concurrency,
  });

  const summary: CollectSummary = {
    runDate,
    pushedAfter,
    repoSampleCap: maxRepos,
    tiers: [],
    pruned: false,
  };

  let allOk = true;

  for (const [idx, tierDef] of STAR_TIERS.entries()) {
    const { id: tier } = tierDef;
    console.info(`[collect] tier ${idx + 1}/${STAR_TIERS.length} ${tier} preparing`);
    await deleteCollectionRunsForDayTier(runDate, tier);

    try {
      if (STAR_TIERS[0].id !== tier) {
        await new Promise<void>((r) => setTimeout(r, 500));
      }
      const starQ = starsSearchQualifier(tierDef);
      const q = `${starQ} pushed:>${pushedAfter} sort:stars-desc`;
      console.info(`[collect] tier ${tier} searching repos`);
      const { repos, totalCount } = await searchRepositories(q);
      const slice = repos.slice(0, maxRepos);
      console.info(`[collect] tier ${tier} fetched ${slice.length}/${totalCount}, collecting languages`);

      const limit = pLimit(concurrency);
      const langMaps = await Promise.all(
        slice.map((r) =>
          limit(() => fetchRepoLanguages(r.full_name)),
        ),
      );

      const merged = mergeLanguageBytes(langMaps);
      const { shares } = sharesFromBytes(merged);

      const [run] = await db
        .insert(collectionRuns)
        .values({
          runDate,
          tier,
          pushedAfter,
          repoCount: slice.length,
          status: "success",
          error: null,
          finishedAt: new Date(),
        })
        .returning({ id: collectionRuns.id });

      if (!run) {
        throw new Error("insert collection_runs did not return id");
      }

      const langRows = [...shares.entries()].map(([language, share]) => ({
        runId: run.id,
        language,
        bytes: merged.get(language)!,
        share,
      }));

      if (langRows.length > 0) {
        await db.insert(languageSnapshots).values(langRows);
        try {
          await collectLanguageHeatForRun({
            runId: run.id,
            runDate,
            tierDef,
            languages: langRows.map((r) => ({
              language: r.language,
              share: r.share,
            })),
          });
        } catch (heatErr) {
          console.warn(
            "[collect] language heat skipped",
            heatErr instanceof Error ? heatErr.message : String(heatErr),
          );
        }
      }

      summary.tiers.push({
        tier,
        ok: true,
        repoCount: slice.length,
        searchTotal: totalCount,
      });
      console.info(`[collect] tier ${tier} done (${slice.length} repos)`);
    } catch (e) {
      allOk = false;
      const message = formatDbError(e);
      await db.insert(collectionRuns).values({
        runDate,
        tier,
        pushedAfter,
        repoCount: 0,
        status: "failed",
        error: message,
        finishedAt: new Date(),
      });
      summary.tiers.push({
        tier,
        ok: false,
        error: message,
      });
      console.error(`[collect] tier ${tier} failed`, message);
    }
  }

  if (allOk && runDate === calendarTodayUtc) {
    const oldestKeep = subtractDaysFromIsoDate(runDate, getDataRetentionDays() - 1);
    console.info("[collect] pruning old runs before", oldestKeep);
    await pruneCollectionRunsOlderThanRunDate(oldestKeep);
    summary.pruned = true;
  }

  console.info("[collect] finished", {
    runDate,
    okTiers: summary.tiers.filter((t) => t.ok).length,
    failedTiers: summary.tiers.filter((t) => !t.ok).length,
    elapsedMs: Date.now() - startedAt,
  });

  return summary;
}
