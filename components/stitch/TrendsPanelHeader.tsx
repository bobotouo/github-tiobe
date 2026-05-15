import type { TierId } from "@/lib/constants";
import type { LineChartValueMode } from "@/lib/chart/buildSeries";
import type { Locale } from "@/lib/i18n/types";

import { ChartMetricTabs } from "@/components/ChartMetricTabs";
import { TrendsDateRangeBar } from "@/components/stitch/TrendsDateRangeBar";

type Props = {
  tier: TierId;
  chartFrom: string;
  chartTo: string;
  pickerMin: string;
  pickerMax: string;
  presetActive: "7" | "30" | null;
  trendsTitle: string;
  presetLabel7: string;
  presetLabel30: string;
  uiLocale: Locale;
  metric: LineChartValueMode;
  chartLabelShare: string;
  chartLabelHeat: string;
};

export function TrendsPanelHeader({
  tier,
  chartFrom,
  chartTo,
  pickerMin,
  pickerMax,
  presetActive,
  trendsTitle,
  presetLabel7,
  presetLabel30,
  uiLocale,
  metric,
  chartLabelShare,
  chartLabelHeat,
}: Props) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <h2 className="text-2xl font-medium leading-snug tracking-tight text-foreground">
          {trendsTitle}
        </h2>
        <ChartMetricTabs
          tier={tier}
          from={chartFrom}
          to={chartTo}
          metric={metric}
          labelShare={chartLabelShare}
          labelHeat={chartLabelHeat}
        />
      </div>
      <TrendsDateRangeBar
        tier={tier}
        chartFrom={chartFrom}
        chartTo={chartTo}
        pickerMin={pickerMin}
        pickerMax={pickerMax}
        presetActive={presetActive}
        presetLabel7={presetLabel7}
        presetLabel30={presetLabel30}
        uiLocale={uiLocale}
        metric={metric}
      />
    </div>
  );
}
