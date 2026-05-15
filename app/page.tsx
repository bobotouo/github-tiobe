import { LocaleProvider } from "@/components/i18n/locale-provider";
import { RankingsTable } from "@/components/stitch/RankingsTable";
import { SitePreferences } from "@/components/site-preferences";
import { StitchLineChart } from "@/components/stitch/StitchLineChart";
import { TrendsPanelHeader } from "@/components/stitch/TrendsPanelHeader";
import { TierTabs } from "@/components/TierTabs";
import { LangNavProvider } from "@/components/LangNavContext";
import { Card, CardContent } from "@/components/ui/card";
import {
  CHART_RANGE_LONG,
  CHART_RANGE_SHORT,
  RANKING_SPARKLINE_DAYS,
  RANKINGS_PREVIEW_COUNT,
  isTierId,
  type TierId,
} from "@/lib/constants";
import { getDataRetentionDays } from "@/lib/env-config";
import {
  matchPreset,
  normalizeChartRange,
  presetRangeDays,
  subtractDaysFromIsoDate,
} from "@/lib/chart-range";
import { trimDaysForChartRsc } from "@/lib/chart/trimForRsc";
import type { LineChartValueMode } from "@/lib/chart/buildSeries";
import { getSeriesForTierCached } from "@/lib/db/stats";
import {
  buildRankingRows,
  buildRankingSparklineSeries,
  velocityIndexForLanguage,
  velocityIndexForLanguageHeat,
  velocityIndexPercent,
  velocityIndexPercentHeat,
} from "@/lib/rankings";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale } from "@/lib/i18n/get-locale";

export const dynamic = "force-dynamic";

function utcTodayString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function minIso(a: string, b: string): string {
  return a < b ? a : b;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function parseChartMetric(raw: string | undefined): LineChartValueMode {
  return raw?.trim().toLowerCase() === "heat" ? "heat" : "share";
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    tier?: string;
    from?: string;
    to?: string;
    lang?: string;
    metric?: string;
  }>;
}) {
  const {
    tier: tierParam,
    from: fromParam,
    to: toParam,
    lang: langParam,
    metric: metricParam,
  } = await searchParams;
  const tierRaw = tierParam ?? "";
  const tier: TierId = isTierId(tierRaw) ? tierRaw : "1k";
  const chartMetric = parseChartMetric(metricParam);

  const today = utcTodayString();
  const retentionStart = subtractDaysFromIsoDate(
    today,
    getDataRetentionDays() - 1,
  );

  let seriesDays: Array<{
    runDate: string;
    repoCount: number;
    languages: {
      language: string;
      share: number;
      heatRepoTotal?: number | null;
    }[];
  }> = [];
  let loadError: string | null = null;
  const hasDb = Boolean(process.env.DATABASE_URL);

  if (hasDb) {
    try {
      const { days } = await getSeriesForTierCached(tier, retentionStart, today);
      seriesDays = days.map((d) => ({
        runDate: d.runDate,
        repoCount: d.repoCount,
        languages: d.languages.map(({ language, share, heatRepoTotal }) => ({
          language,
          share,
          heatRepoTotal,
        })),
      }));
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  }

  const hasHeatData = seriesDays.some((d) =>
    d.languages.some(
      (l) =>
        typeof l.heatRepoTotal === "number" &&
        Number.isFinite(l.heatRepoTotal) &&
        l.heatRepoTotal > 0,
    ),
  );

  const latestInDb =
    seriesDays.length > 0 ? seriesDays[seriesDays.length - 1].runDate : today;

  const pickerMin = retentionStart;
  const pickerMax = minIso(today, latestInDb);

  const defaultRange = presetRangeDays(pickerMin, pickerMax, 7);
  const fromOk = fromParam && ISO_DAY.test(fromParam) ? fromParam : null;
  const toOk = toParam && ISO_DAY.test(toParam) ? toParam : null;

  const normalized = normalizeChartRange(
    fromOk ?? defaultRange.from,
    toOk ?? defaultRange.to,
    pickerMin,
    pickerMax,
  );
  const chartFrom = normalized.from;
  const chartTo = normalized.to;

  const chartDays = seriesDays.filter(
    (d) => d.runDate >= chartFrom && d.runDate <= chartTo,
  );

  const rankingSnapshotDate =
    seriesDays.length > 0 ? seriesDays[seriesDays.length - 1].runDate : today;
  const { rows, snapshotDate, repoCount } = buildRankingRows(
    seriesDays,
    rankingSnapshotDate,
  );

  const focusLang = langParam?.trim() ? decodeURIComponent(langParam.trim()) : null;

  const chartDaysForModel = trimDaysForChartRsc(
    chartDays,
    undefined,
    focusLang,
    chartMetric,
  );

  const previewLangs = rows
    .slice(0, RANKINGS_PREVIEW_COUNT)
    .map((r) => r.language);
  const sparklinesByLanguage =
    hasDb && seriesDays.length > 0
      ? buildRankingSparklineSeries(
          seriesDays,
          previewLangs,
          RANKING_SPARKLINE_DAYS,
        )
      : {};

  const velocityPct =
    chartMetric === "heat"
      ? focusLang
        ? velocityIndexForLanguageHeat(chartDays, focusLang)
        : velocityIndexPercentHeat(chartDays)
      : focusLang
        ? velocityIndexForLanguage(chartDays, focusLang)
        : velocityIndexPercent(chartDays);

  const presetActive = matchPreset(chartFrom, chartTo, pickerMin, pickerMax);

  const locale = await getServerLocale();
  const t = getDictionary(locale);

  const velocityTitle =
    chartMetric === "heat"
      ? focusLang
        ? t.chart.velocityMoMHeat(focusLang)
        : t.chart.velocityIndexHeat
      : focusLang
        ? t.chart.velocityMoM(focusLang)
        : t.chart.velocityIndex;

  return (
    <LocaleProvider locale={locale}>
      <div className="min-h-screen bg-background text-on-background">
        <main className="mx-auto max-w-[var(--max-w-dashboard)] px-6 py-12">
          <header className="mb-14">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="mb-3 font-sans text-3xl font-medium tracking-tight text-primary md:text-[30px]">
                  {t.hero.title}
                </h1>
                <p className="max-w-2xl text-sm text-on-surface-variant md:text-[15px]">
                  {t.hero.subtitle}
                </p>
                <p className="mt-3 max-w-2xl whitespace-pre-line text-xs leading-relaxed text-muted-foreground md:text-[13px]">
                  {t.hero.metricsExplainer}
                </p>
              </div>
              <SitePreferences className="shrink-0 pt-1" />
            </div>
          </header>

          <LangNavProvider
            key={`${tier}-${chartFrom}-${chartTo}-${chartMetric}-${focusLang ?? ""}`}
            initialLang={focusLang}
            tier={tier}
            from={chartFrom}
            to={chartTo}
            metric={chartMetric}
          >
            <div className="mb-14 max-w-full overflow-x-auto pb-1">
              <h2 className="mb-4 text-2xl font-medium leading-snug tracking-tight text-foreground">
                {t.tierSection.title}
              </h2>
              <TierTabs
                active={tier}
                chartFrom={chartFrom}
                chartTo={chartTo}
                metric={chartMetric}
              />
            </div>

            {!hasDb && (
              <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                {t.db.missingBefore}
                <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">DATABASE_URL</code>
                {t.db.missingAfter}
                <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">drizzle/init.sql</code>
                {t.db.missingEnd}
              </div>
            )}
            {loadError && (
              <div className="mb-8 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-950 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-100">
                {t.loadError}
                {loadError}
              </div>
            )}

            <section className="mb-20">
              <TrendsPanelHeader
                tier={tier}
                chartFrom={chartFrom}
                chartTo={chartTo}
                pickerMin={pickerMin}
                pickerMax={pickerMax}
                presetActive={presetActive}
                trendsTitle={t.trends.title}
                presetLabel7={t.trends.lastDays(CHART_RANGE_SHORT)}
                presetLabel30={t.trends.lastDays(CHART_RANGE_LONG)}
                uiLocale={locale}
                metric={chartMetric}
                chartLabelShare={t.chart.tabShare}
                chartLabelHeat={t.chart.tabHeat}
                lang={focusLang}
              />
              <Card className="border-border gap-0 overflow-visible rounded-xl border bg-card py-0 shadow-none ring-0">
                <CardContent className="px-6 pt-6 pb-3 md:px-8 md:pt-8 md:pb-4">
                  <StitchLineChart
                    days={chartDaysForModel}
                    chartValue={chartMetric}
                    velocityPct={velocityPct}
                    velocityTitle={velocityTitle}
                  />
                </CardContent>
              </Card>
            </section>
          </LangNavProvider>

          <RankingsTable
            key={`${tier}-${snapshotDate}`}
            tier={tier}
            previewRows={rows.slice(0, RANKINGS_PREVIEW_COUNT)}
            totalLanguageCount={rows.length}
            snapshotDate={snapshotDate}
            repoCount={repoCount}
            showHeatColumn={hasHeatData}
            sparklinesByLanguage={sparklinesByLanguage}
          />
        </main>

        <footer className="mt-24 pt-4 pb-12">
          <div className="mx-auto flex max-w-[var(--max-w-dashboard)] flex-col items-center justify-between gap-6 px-6 md:flex-row">
            <span className="text-center text-sm text-on-surface-variant md:text-left">
              {t.footer.line(new Date().getFullYear())}
            </span>
            <div className="flex flex-wrap justify-center gap-6">
            <a
              className="text-sm text-on-surface-variant transition-colors hover:text-primary"
              href="https://github.com"
              rel="noopener noreferrer"
              target="_blank"
            >
              GitHub
            </a>
            <a
              className="text-sm text-on-surface-variant transition-colors hover:text-primary"
              href="https://docs.github.com/en/rest"
              rel="noopener noreferrer"
              target="_blank"
            >
              API
            </a>
            </div>
          </div>
        </footer>
      </div>
    </LocaleProvider>
  );
}
