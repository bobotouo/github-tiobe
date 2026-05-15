import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import type { TierId } from "@/lib/constants";
import { requireDb } from "@/lib/db/index";
import { collectionRuns, languageHeatSnapshots, languageSnapshots } from "@/lib/db/schema";

export type DayLanguageRow = {
  runDate: string;
  language: string;
  bytes: string;
  share: number;
  /** GitHub Search `total_count`（`COLLECT_HEAT=1` 时写入）；未采集热度时为 null */
  heatRepoTotal: number | null;
};

export async function getSeriesForTier(
  tier: TierId,
  from: string,
  to: string,
): Promise<{
  days: Array<{
    runDate: string;
    repoCount: number;
    pushedAfter: string;
    finishedAt: Date | null;
    languages: DayLanguageRow[];
  }>;
}> {
  const db = requireDb();

  const runs = await db
    .select({
      id: collectionRuns.id,
      runDate: collectionRuns.runDate,
      repoCount: collectionRuns.repoCount,
      pushedAfter: collectionRuns.pushedAfter,
      finishedAt: collectionRuns.finishedAt,
      status: collectionRuns.status,
    })
    .from(collectionRuns)
    .where(
      and(
        eq(collectionRuns.tier, tier),
        eq(collectionRuns.status, "success"),
        gte(collectionRuns.runDate, from),
        lte(collectionRuns.runDate, to),
      ),
    )
    .orderBy(asc(collectionRuns.runDate));

  if (runs.length === 0) {
    return { days: [] };
  }

  const runIds = runs.map((r) => r.id);
  const snapshotRows = await db
    .select({
      runId: languageSnapshots.runId,
      language: languageSnapshots.language,
      bytes: languageSnapshots.bytes,
      share: languageSnapshots.share,
    })
    .from(languageSnapshots)
    .where(inArray(languageSnapshots.runId, runIds))
    .orderBy(asc(languageSnapshots.runId), asc(languageSnapshots.language));

  let heatRows: Array<{
    runId: number;
    language: string;
    repoTotal: number;
  }> = [];
  try {
    heatRows = await db
      .select({
        runId: languageHeatSnapshots.runId,
        language: languageHeatSnapshots.language,
        repoTotal: languageHeatSnapshots.repoTotal,
      })
      .from(languageHeatSnapshots)
      .where(inArray(languageHeatSnapshots.runId, runIds));
  } catch {
    heatRows = [];
  }

  const heatByRunLang = new Map<string, number>();
  for (const h of heatRows) {
    heatByRunLang.set(`${h.runId}\t${h.language}`, h.repoTotal);
  }

  const langsByRunId = new Map<
    number,
    Array<(typeof snapshotRows)[number]>
  >();
  for (const row of snapshotRows) {
    const list = langsByRunId.get(row.runId);
    if (list) {
      list.push(row);
    } else {
      langsByRunId.set(row.runId, [row]);
    }
  }

  const days = runs.map((run) => {
    const langs = langsByRunId.get(run.id) ?? [];
    return {
      runDate: run.runDate,
      repoCount: run.repoCount,
      pushedAfter: run.pushedAfter,
      finishedAt: run.finishedAt,
      languages: langs.map((r) => ({
        runDate: run.runDate,
        language: r.language,
        bytes: r.bytes.toString(),
        share: r.share,
        heatRepoTotal:
          heatByRunLang.get(`${run.id}\t${r.language}`) ?? null,
      })),
    };
  });

  return { days };
}

const fetchSeriesCached = unstable_cache(
  async (tier: TierId, from: string, to: string) => getSeriesForTier(tier, from, to),
  ["github-tiobe-series"],
  { revalidate: 45 },
);

/** 首页同一参数短时重复导航时走 Data Cache，避免重复查库 */
export function getSeriesForTierCached(
  tier: TierId,
  from: string,
  to: string,
) {
  return fetchSeriesCached(tier, from, to);
}
