import { DEFAULT_TOP_LANGS_CHART } from "@/lib/constants";

import {
  buildLineChartModel,
  type DayInput,
  type DayLanguagePoint,
  type LineChartValueMode,
} from "./buildSeries";

/**
 * 折线图只需 TopN（及可选 deep-link 的单一语言）。全量语言列表会膨胀 RSC payload。
 */
export function trimDaysForChartRsc(
  chartDays: Array<{ runDate: string; languages: DayLanguagePoint[] }>,
  topN = DEFAULT_TOP_LANGS_CHART,
  urlLang: string | null,
  chartValue: LineChartValueMode = "share",
): DayInput[] {
  if (chartDays.length === 0) return [];

  const full: DayInput[] = chartDays.map((d) => ({
    runDate: d.runDate,
    languages: d.languages,
  }));

  const { lineKeys: topLangNames } = buildLineChartModel(full, topN, {
    value: chartValue,
  });

  return chartDays.map((d) => {
    const byRow = new Map(d.languages.map((x) => [x.language, x]));
    const languages: DayLanguagePoint[] = [];

    for (const name of topLangNames) {
      const x = byRow.get(name);
      languages.push({
        language: name,
        share: x?.share ?? 0,
        heatRepoTotal: x?.heatRepoTotal ?? null,
      });
    }

    if (urlLang && !topLangNames.includes(urlLang)) {
      const x = byRow.get(urlLang);
      languages.push({
        language: urlLang,
        share: x?.share ?? 0,
        heatRepoTotal: x?.heatRepoTotal ?? null,
      });
    }

    return { runDate: d.runDate, languages };
  });
}
