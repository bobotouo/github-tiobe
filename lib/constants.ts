/**
 * 各档位为**不相交**的 star 区间（左闭右开，-star 为整数）：
 * [1k,2k) · [2k,3k) · [3k,5k) · [5k,10k) · [10k,∞)
 */
export const STAR_TIERS = [
  { id: "1k", minStars: 1000, maxExclusive: 2000, label: "1k–2k", pillLabel: "1K" },
  { id: "2k", minStars: 2000, maxExclusive: 3000, label: "2k–3k", pillLabel: "2K" },
  { id: "3k", minStars: 3000, maxExclusive: 5000, label: "3k–5k", pillLabel: "3K" },
  { id: "5k", minStars: 5000, maxExclusive: 10_000, label: "5k–10k", pillLabel: "5K" },
  { id: "10k", minStars: 10_000, maxExclusive: null, label: "≥10k", pillLabel: "10K" },
] as const;

export type TierId = (typeof STAR_TIERS)[number]["id"];

export const TIER_IDS: TierId[] = STAR_TIERS.map((t) => t.id);

export function isTierId(s: string): s is TierId {
  return (TIER_IDS as readonly string[]).includes(s);
}

/** GitHub Search `q` 里用的 stars 条件（与其它 AND 条件空格拼接） */
export function starsSearchQualifier(t: (typeof STAR_TIERS)[number]): string {
  if (t.maxExclusive === null) {
    return `stars:>=${t.minStars}`;
  }
  return `stars:>=${t.minStars} stars:<${t.maxExclusive}`;
}

/** GitHub Search returns at most ~1000 repos per query. */
export const SEARCH_RESULT_CAP = 1000;

export const DEFAULT_TOP_LANGS_CHART = 15;

/** 每日排行首屏条数，与趋势图 Top N 一致；其余点击「展开」再拉取 */
export const RANKINGS_PREVIEW_COUNT = DEFAULT_TOP_LANGS_CHART;

/** 排行表迷你趋势：取最近若干成功快照日 */
export const RANKING_SPARKLINE_DAYS = 7;

/** 趋势快捷：近 7 / 30 日（与 `--DATA_RETENTION_DAYS` 无强制绑定，仅为 UI 预设） */
export const CHART_RANGE_SHORT = 7;
export const CHART_RANGE_LONG = 30;
