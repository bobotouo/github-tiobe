import { and, desc, eq, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import type { TierId } from "@/lib/constants";

import { requireDb } from "@/lib/db/index";
import { collectionRuns, repoEnrichments } from "@/lib/db/schema";
import type { RepoEnrichmentItem } from "@/lib/enrich/types";
const DEFAULT_LIMIT = 24;

const HAS_SUMMARY = sql`trim(coalesce(${repoEnrichments.llmSummary}, '')) <> ''`;

async function loadByRunId(
  runId: number,
  limit: number,
): Promise<RepoEnrichmentItem[]> {
  const db = requireDb();
  const rows = await db
    .select({
      fullName: repoEnrichments.fullName,
      htmlUrl: repoEnrichments.htmlUrl,
      description: repoEnrichments.description,
      topics: repoEnrichments.topics,
      starCount: repoEnrichments.starCount,
      primaryLanguage: repoEnrichments.primaryLanguage,
      llmSummary: repoEnrichments.llmSummary,
      llmDomains: repoEnrichments.llmDomains,
      llmRepoKind: repoEnrichments.llmRepoKind,
      enrichedAt: repoEnrichments.enrichedAt,
    })
    .from(repoEnrichments)
    .where(and(eq(repoEnrichments.runId, runId), HAS_SUMMARY))
    .orderBy(desc(repoEnrichments.starCount))
    .limit(limit);

  return rows.map(mapRow);
}

async function loadRecentByTier(
  tier: TierId,
  limit: number,
): Promise<RepoEnrichmentItem[]> {
  const db = requireDb();
  const rows = await db
    .select({
      fullName: repoEnrichments.fullName,
      htmlUrl: repoEnrichments.htmlUrl,
      description: repoEnrichments.description,
      topics: repoEnrichments.topics,
      starCount: repoEnrichments.starCount,
      primaryLanguage: repoEnrichments.primaryLanguage,
      llmSummary: repoEnrichments.llmSummary,
      llmDomains: repoEnrichments.llmDomains,
      llmRepoKind: repoEnrichments.llmRepoKind,
      enrichedAt: repoEnrichments.enrichedAt,
    })
    .from(repoEnrichments)
    .where(
      and(
        HAS_SUMMARY,
        sql`${repoEnrichments.runId} IN (
          SELECT id FROM ${collectionRuns}
          WHERE ${collectionRuns.tier} = ${tier}
            AND ${collectionRuns.status} = 'success'
        )`,
      ),
    )
    .orderBy(desc(repoEnrichments.enrichedAt), desc(repoEnrichments.starCount))
    .limit(limit);

  return rows.map(mapRow);
}

function mapRow(row: {
  fullName: string;
  htmlUrl: string | null;
  description: string | null;
  topics: string[] | null;
  starCount: number | null;
  primaryLanguage: string | null;
  llmSummary: string | null;
  llmDomains: string[] | null;
  llmRepoKind: string | null;
  enrichedAt: Date;
}): RepoEnrichmentItem {
  return {
    fullName: row.fullName,
    htmlUrl: row.htmlUrl,
    description: row.description,
    topics: row.topics ?? [],
    starCount: row.starCount,
    primaryLanguage: row.primaryLanguage,
    summary: row.llmSummary,
    domains: row.llmDomains ?? [],
    repoKind: row.llmRepoKind,
    enrichedAt: row.enrichedAt.toISOString(),
  };
}

/** 取指定档位、采集日 success run 下的归纳列表（按 stars 降序） */
export async function loadRepoEnrichmentsForTier(
  tier: TierId,
  runDate: string,
  limit = DEFAULT_LIMIT,
): Promise<RepoEnrichmentItem[]> {
  const db = requireDb();
  const run = await db
    .select({
      id: collectionRuns.id,
      pushedAfter: collectionRuns.pushedAfter,
      repoCount: collectionRuns.repoCount,
    })
    .from(collectionRuns)
    .where(
      and(
        eq(collectionRuns.tier, tier),
        eq(collectionRuns.runDate, runDate),
        eq(collectionRuns.status, "success"),
      ),
    )
    .limit(1);

  if (run.length === 0) return [];

  const byRun = await loadByRunId(run[0].id, limit);
  if (byRun.length > 0) return byRun;

  // 页面渲染路径不能调用 GitHub Search：被 secondary rate limit 时会拖慢整个首页。
  // 当日 run 没有关联数据时，仅从数据库里回退到同档最近已有的归纳。
  return loadRecentByTier(tier, limit);
}

const loadRepoEnrichmentsCached = unstable_cache(
  async (tier: TierId, runDate: string, limit: number) =>
    loadRepoEnrichmentsForTier(tier, runDate, limit),
  ["github-tiobe-repo-enrichments"],
  { revalidate: 300 },
);

/** 首页展示用：短时缓存样本热点，避免数据库/Neon 短暂超时时直接变空。 */
export function loadRepoEnrichmentsForTierCached(
  tier: TierId,
  runDate: string,
  limit = DEFAULT_LIMIT,
): Promise<RepoEnrichmentItem[]> {
  return loadRepoEnrichmentsCached(tier, runDate, limit);
}

async function loadRepoEnrichmentsForTiers(
  tiers: TierId[],
  runDate: string,
  limitPerTier: number,
): Promise<RepoEnrichmentItem[]> {
  const batches = await Promise.all(
    tiers.map((tier) => loadRepoEnrichmentsForTier(tier, runDate, limitPerTier)),
  );
  const seen = new Set<string>();
  const merged: RepoEnrichmentItem[] = [];

  for (const item of batches.flat()) {
    if (seen.has(item.fullName)) continue;
    seen.add(item.fullName);
    merged.push(item);
  }

  return merged;
}

const loadRepoEnrichmentsForTiersCachedInner = unstable_cache(
  async (tiers: TierId[], runDate: string, limitPerTier: number) =>
    loadRepoEnrichmentsForTiers(tiers, runDate, limitPerTier),
  ["github-tiobe-repo-enrichments-multi-tier"],
  { revalidate: 300 },
);

/** 首页词云用：可把多个不相交 star 档位合并成更大的热度样本池。 */
export function loadRepoEnrichmentsForTiersCached(
  tiers: TierId[],
  runDate: string,
  limitPerTier = DEFAULT_LIMIT,
): Promise<RepoEnrichmentItem[]> {
  return loadRepoEnrichmentsForTiersCachedInner(tiers, runDate, limitPerTier);
}
