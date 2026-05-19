import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { TIER_IDS, type TierId } from "@/lib/constants";
import { requireDb } from "@/lib/db/index";
import { collectionRuns, repoEnrichments } from "@/lib/db/schema";

/** 将已有 LLM 摘要的归纳记录挂到当前采集 run（不重跑 LLM） */
export async function relinkSummariesToRun(
  fullNames: string[],
  runId: number,
): Promise<number> {
  if (fullNames.length === 0) return 0;

  const db = requireDb();
  const updated = await db
    .update(repoEnrichments)
    .set({ runId, enrichedAt: new Date() })
    .where(
      and(
        inArray(repoEnrichments.fullName, fullNames),
        sql`trim(coalesce(${repoEnrichments.llmSummary}, '')) <> ''`,
        ne(repoEnrichments.runId, runId),
      ),
    )
    .returning({ fullName: repoEnrichments.fullName });

  return updated.length;
}

export type RelinkRunDateSummary = {
  runDate: string;
  tiers: { tier: TierId; runId: number; relinked: number }[];
};

/** 将同档位历史 success run 上的归纳挂到指定采集日（不调 GitHub / LLM） */
export async function relinkEnrichmentsForRunDate(
  runDate: string,
  tier?: TierId,
): Promise<RelinkRunDateSummary> {
  const db = requireDb();
  const successRuns = await db
    .select({ id: collectionRuns.id, tier: collectionRuns.tier })
    .from(collectionRuns)
    .where(
      and(eq(collectionRuns.runDate, runDate), eq(collectionRuns.status, "success")),
    );

  const summary: RelinkRunDateSummary = { runDate, tiers: [] };

  for (const run of successRuns) {
    const tierId = run.tier as TierId;
    if (!TIER_IDS.includes(tierId)) continue;
    if (tier && tierId !== tier) continue;

    const updated = await db
      .update(repoEnrichments)
      .set({ runId: run.id, enrichedAt: new Date() })
      .where(
        and(
          sql`trim(coalesce(${repoEnrichments.llmSummary}, '')) <> ''`,
          ne(repoEnrichments.runId, run.id),
          sql`${repoEnrichments.runId} IN (
            SELECT id FROM ${collectionRuns}
            WHERE ${collectionRuns.tier} = ${tierId}
              AND ${collectionRuns.status} = 'success'
          )`,
        ),
      )
      .returning({ fullName: repoEnrichments.fullName });

    summary.tiers.push({ tier: tierId, runId: run.id, relinked: updated.length });
  }

  return summary;
}
