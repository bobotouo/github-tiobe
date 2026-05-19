import type { HotspotTerm, RepoEnrichmentItem } from "@/lib/enrich/types";

function addTerm(map: Map<string, number>, raw: string, weight: number): void {
  const key = raw.trim();
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + weight);
}

/** 从当日新仓样本的 LLM 领域、Topics、主语言汇总热度词频 */
export function aggregateHotspotTerms(items: RepoEnrichmentItem[]): HotspotTerm[] {
  const m = new Map<string, number>();
  for (const item of items) {
    for (const d of item.domains) addTerm(m, d, 2);
    for (const t of item.topics) addTerm(m, t, 1);
    if (item.primaryLanguage) addTerm(m, item.primaryLanguage, 1);
  }
  return [...m.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count);
}
