import { DEFAULT_TOP_LANGS_CHART } from "@/lib/constants";

export type DayLanguagePoint = {
  language: string;
  share: number;
  heatRepoTotal?: number | null;
};

export type DayInput = {
  runDate: string;
  languages: DayLanguagePoint[];
};

export type LineChartValueMode = "share" | "heat";

function heatPoolByLanguage(day: DayInput): Map<string, number> {
  const m = new Map<string, number>();
  for (const { language, heatRepoTotal } of day.languages) {
    if (language === "Other") continue;
    const h = heatRepoTotal ?? 0;
    if (h > 0) m.set(language, h);
  }
  return m;
}

function heatPercentForLang(day: DayInput, lang: string): number {
  const pool = heatPoolByLanguage(day);
  const sum = [...pool.values()].reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;
  const h = pool.get(lang) ?? 0;
  return Number(((h / sum) * 100).toFixed(2));
}

/** 折线数据点 + 图例用的 Top N 语言（按窗口内累计排序；不绘制 Other 汇总线） */
export function buildLineChartModel(
  days: DayInput[],
  topN = DEFAULT_TOP_LANGS_CHART,
  opts?: { value?: LineChartValueMode },
): { data: Record<string, number | string>[]; lineKeys: string[] } {
  const value = opts?.value ?? "share";
  if (days.length === 0) {
    return { data: [], lineKeys: [] };
  }

  const totals = new Map<string, number>();
  for (const d of days) {
    for (const row of d.languages) {
      if (row.language === "Other") continue;
      const v =
        value === "heat"
          ? (row.heatRepoTotal ?? 0)
          : row.share;
      totals.set(row.language, (totals.get(row.language) ?? 0) + v);
    }
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, topN).map(([k]) => k);

  const data: Record<string, number | string>[] = days.map((d) => {
    const row: Record<string, number | string> = { date: d.runDate };
    const byLang = new Map(
      d.languages.map((x) => [x.language, x] as const),
    );
    for (const key of top) {
      const rec = byLang.get(key);
      if (value === "heat") {
        row[key] = heatPercentForLang(d, key);
      } else {
        const v = rec?.share ?? 0;
        row[key] = Number((v * 100).toFixed(2));
      }
    }
    return row;
  });

  return { data, lineKeys: top };
}

/** 窗口内某一语言按日序列（0–100）；用于不在 TopN 图例内时的单语言视图 */
export function buildSingleLanguageSeries(
  days: DayInput[],
  language: string,
  opts?: { value?: LineChartValueMode },
): { data: Record<string, number | string>[]; lineKeys: string[] } {
  const value = opts?.value ?? "share";
  if (days.length === 0) {
    return { data: [], lineKeys: [] };
  }
  const data: Record<string, number | string>[] = days.map((d) => {
    const rec = d.languages.find((x) => x.language === language);
    const y =
      value === "heat"
        ? heatPercentForLang(d, language)
        : Number(((rec?.share ?? 0) * 100).toFixed(2));
    return {
      date: d.runDate,
      [language]: y,
    };
  });
  return { data, lineKeys: [language] };
}
