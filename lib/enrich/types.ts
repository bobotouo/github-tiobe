/** 前端展示用：单条仓库 LLM 归纳 */
export type RepoEnrichmentItem = {
  fullName: string;
  htmlUrl: string | null;
  description: string | null;
  topics: string[];
  starCount: number | null;
  primaryLanguage: string | null;
  summary: string | null;
  domains: string[];
  repoKind: string | null;
  enrichedAt: string;
};

/** 词云 / 热点分布用词条 */
export type HotspotTerm = {
  term: string;
  count: number;
};
