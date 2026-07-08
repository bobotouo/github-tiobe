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
import { createSequentialGate, sleep } from "@/lib/github/request-pace";
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
    heatRows?: number;
    heatError?: string;
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
  /** 只采指定档；缺省为全部 STAR_TIERS（保持定义顺序） */
  tiers?: TierId[];
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** 档位之间暂停（非环境变量） */
const TIER_PAUSE_MS = 12_000;
/** Search 结束后再拉 languages，避免 Search 与 REST 叠峰 */
const POST_SEARCH_PAUSE_MS = 2_500;
/** 相邻 `/languages` 请求最小间隔（非环境变量；`COLLECT_CONCURRENCY` 仍控制并行槽位） */
const LANG_REQUEST_GAP_MS = 500;

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

  const tierDefs =
    opts?.tiers != null && opts.tiers.length > 0
      ? STAR_TIERS.filter((t) => opts.tiers!.includes(t.id))
      : [...STAR_TIERS];

  if (tierDefs.length < 1) {
    throw new Error("no tiers to collect (check --tier)");
  }

  console.info("[collect] start", {
    runDate,
    tiers: tierDefs.map((t) => t.id),
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

  for (const [idx, tierDef] of tierDefs.entries()) {
    const { id: tier } = tierDef;
    console.info(`[collect] tier ${idx + 1}/${tierDefs.length} ${tier} preparing`);
    await deleteCollectionRunsForDayTier(runDate, tier);

    try {
      if (idx > 0) {
        console.info(`[collect] pause before tier ${tier} (${TIER_PAUSE_MS}ms)`);
        await sleep(TIER_PAUSE_MS);
      }
      const starQ = starsSearchQualifier(tierDef);
      const q = `${starQ} pushed:>${pushedAfter} sort:stars-desc`;
      console.info(`[collect] tier ${tier} searching repos`);
      const { repos, totalCount } = await searchRepositories(q, {
        maxItems: maxRepos,
      });
      const slice = repos.slice(0, maxRepos);
      console.info(`[collect] tier ${tier} fetched ${slice.length}/${totalCount}, collecting languages`);

      if (POST_SEARCH_PAUSE_MS > 0) {
        await sleep(POST_SEARCH_PAUSE_MS);
      }

      const limit = pLimit(concurrency);
      const langGate = createSequentialGate(LANG_REQUEST_GAP_MS);
      const langMaps = await Promise.all(
        slice.map((r) =>
          limit(() => langGate(() => fetchRepoLanguages(r.full_name))),
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

      let heatRows: number | undefined;
      let heatError: string | undefined;

      if (langRows.length > 0) {
        await db.insert(languageSnapshots).values(langRows);
        try {
          heatRows = await collectLanguageHeatForRun({
            runId: run.id,
            runDate,
            tierDef,
            languages: langRows.map((r) => ({
              language: r.language,
              share: r.share,
            })),
          });
        } catch (heatErr) {
          heatError = heatErr instanceof Error ? heatErr.message : String(heatErr);
          console.warn(
            "[collect] language heat skipped",
            heatError,
          );
        }
      }

      summary.tiers.push({
        tier,
        ok: true,
        repoCount: slice.length,
        searchTotal: totalCount,
        heatRows,
        heatError,
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
