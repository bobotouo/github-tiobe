export type RankingRow = {
  rank: number;
  language: string;
  usagePct: number;
  changePctPoints: number | null;
  /** Search `total_count`（近窗口新建仓）；无热度数据时为 null */
  heatRepoTotal: number | null;
};

type LangPoint = {
  language: string;
  share: number;
  heatRepoTotal?: number | null;
};

type DaySnap = {
  runDate: string;
  repoCount: number;
  languages: LangPoint[];
};

/** 取不超过 selectedDate 的最后一条成功快照，并与 7 日前快照算占比差（百分点） */
export function buildRankingRows(
  days: DaySnap[],
  selectedDate: string,
): { rows: RankingRow[]; snapshotDate: string; repoCount: number } {
  const sorted = [...days].sort((a, b) => a.runDate.localeCompare(b.runDate));
  if (sorted.length === 0) {
    return { rows: [], snapshotDate: selectedDate, repoCount: 0 };
  }

  let idx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].runDate <= selectedDate) {
      idx = i;
      break;
    }
  }
  if (idx < 0) {
    idx = sorted.length - 1;
  }

  const snap = sorted[idx];
  const prev = idx >= 7 ? sorted[idx - 7] : null;
  const prevMap = new Map(prev?.languages.map((l) => [l.language, l.share]) ?? []);

  const rows: RankingRow[] = [...snap.languages]
    .filter((l) => l.share * 100 >= 0.01)
    .sort((a, b) => b.share - a.share)
    .map((l, i) => {
      const prevShare = prevMap.get(l.language);
      const changePctPoints =
        prevShare === undefined ? null : (l.share - prevShare) * 100;
      const heat =
        typeof l.heatRepoTotal === "number" && Number.isFinite(l.heatRepoTotal)
          ? l.heatRepoTotal
          : null;
      return {
        rank: i + 1,
        language: l.language,
        usagePct: l.share * 100,
        changePctPoints,
        heatRepoTotal: heat,
      };
    });

  return { rows, snapshotDate: snap.runDate, repoCount: snap.repoCount };
}

/**
 * 每日排行迷你折线：最近 `maxDays` 个成功日里，各语言占比（0–100）按日序排列。
 * 仅对首屏预览语言列表构建，避免为全量语言生成大对象。
 */
export function buildRankingSparklineSeries(
  days: Array<{ runDate: string; languages: LangPoint[] }>,
  languages: string[],
  maxDays: number,
): Record<string, number[]> {
  if (days.length === 0 || languages.length === 0) {
    return {};
  }
  const sorted = [...days].sort((a, b) => a.runDate.localeCompare(b.runDate));
  const window = sorted.slice(-maxDays);
  const out: Record<string, number[]> = {};
  for (const lang of languages) {
    out[lang] = window.map((d) => {
      const row = d.languages.find((x) => x.language === lang);
      return row ? Number((row.share * 100).toFixed(3)) : 0;
    });
  }
  return out;
}

function normalizedHeatPercents(langs: LangPoint[]): Map<string, number> {
  let sum = 0;
  const raw = new Map<string, number>();
  for (const l of langs) {
    const h = l.heatRepoTotal ?? 0;
    if (h > 0) {
      raw.set(l.language, h);
      sum += h;
    }
  }
  const out = new Map<string, number>();
  if (sum <= 0) return out;
  for (const [k, v] of raw) {
    out.set(k, (v / sum) * 100);
  }
  return out;
}

/** 迷你折线：各语言在「当日热度池」中的占比（0–100），更贴趋势图热度模式 */
export function buildRankingHeatSparklineSeries(
  days: Array<{ runDate: string; languages: LangPoint[] }>,
  languages: string[],
  maxDays: number,
): Record<string, number[]> {
  if (days.length === 0 || languages.length === 0) {
    return {};
  }
  const sorted = [...days].sort((a, b) => a.runDate.localeCompare(b.runDate));
  const window = sorted.slice(-maxDays);
  const out: Record<string, number[]> = {};
  for (const lang of languages) {
    out[lang] = window.map((d) => {
      const m = normalizedHeatPercents(d.languages);
      const v = m.get(lang);
      return v != null ? Number(v.toFixed(3)) : 0;
    });
  }
  return out;
}

/** 近两日指定语言占比变化（百分点）；用于单语言聚焦 */
export function velocityIndexForLanguage(
  days: Array<{ runDate: string; languages: LangPoint[] }>,
  language: string,
): number | null {
  if (days.length < 2) return null;
  const sorted = [...days].sort((a, b) => a.runDate.localeCompare(b.runDate));
  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const l = last.languages.find((x) => x.language === language);
  const p = prev.languages.find((x) => x.language === language);
  if (!l || !p) return null;
  return (l.share - p.share) * 100;
}

/** 近两日「第一名语言」占比变化（百分点），用于 Velocity */
export function velocityIndexPercent(
  days: Array<{ runDate: string; languages: LangPoint[] }>,
): number | null {
  if (days.length < 2) return null;
  const sorted = [...days].sort((a, b) => a.runDate.localeCompare(b.runDate));
  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const top = [...last.languages].sort((a, b) => b.share - a.share)[0];
  if (!top) return null;
  const p = prev.languages.find((x) => x.language === top.language);
  if (!p) return null;
  return (top.share - p.share) * 100;
}

/** 近两日：指定语言在「热度池」占比的差（百分点） */
export function velocityIndexForLanguageHeat(
  days: Array<{ runDate: string; languages: LangPoint[] }>,
  language: string,
): number | null {
  if (days.length < 2) return null;
  const sorted = [...days].sort((a, b) => a.runDate.localeCompare(b.runDate));
  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const l = normalizedHeatPercents(last.languages).get(language);
  const p = normalizedHeatPercents(prev.languages).get(language);
  if (l === undefined || p === undefined) return null;
  return Number((l - p).toFixed(2));
}

/** 近两日：当前「热度池」第一名语言占比的差（百分点） */
export function velocityIndexPercentHeat(
  days: Array<{ runDate: string; languages: LangPoint[] }>,
): number | null {
  if (days.length < 2) return null;
  const sorted = [...days].sort((a, b) => a.runDate.localeCompare(b.runDate));
  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const lastM = normalizedHeatPercents(last.languages);
  const prevM = normalizedHeatPercents(prev.languages);
  let topLang = "";
  let topP = -1;
  for (const [lang, p] of lastM) {
    if (p > topP) {
      topP = p;
      topLang = lang;
    }
  }
  if (!topLang || topP < 0) return null;
  const p0 = prevM.get(topLang);
  if (p0 === undefined) return null;
  return Number((topP - p0).toFixed(2));
}
