"use client";

import * as React from "react";
import { format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type { DateRange } from "react-day-picker";

import { useLangNav } from "@/components/LangNavContext";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CHART_RANGE_LONG,
  CHART_RANGE_SHORT,
  type TierId,
} from "@/lib/constants";
import {
  normalizeChartRange,
  presetRangeDays,
} from "@/lib/chart-range";
import { buildDashboardHref } from "@/lib/dashboard-url";
import type { LineChartValueMode } from "@/lib/chart/buildSeries";
import type { Locale } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

type Props = {
  tier: TierId;
  chartFrom: string;
  chartTo: string;
  pickerMin: string;
  pickerMax: string;
  presetActive: "7" | "30" | null;
  presetLabel7: string;
  presetLabel30: string;
  uiLocale: Locale;
  metric: LineChartValueMode;
};

function parseDay(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T12:00:00`);
}

export function TrendsDateRangeBar({
  tier,
  chartFrom,
  chartTo,
  pickerMin,
  pickerMax,
  presetActive,
  presetLabel7,
  presetLabel30,
  uiLocale,
  metric,
}: Props) {
  const router = useRouter();
  const { lang } = useLangNav();
  const [open, setOpen] = React.useState(false);
  const calendarLocale = uiLocale === "en" ? enUS : zhCN;

  function pushRange(from: string, to: string) {
    const n = normalizeChartRange(from, to, pickerMin, pickerMax);
    router.push(
      buildDashboardHref({
        tier,
        from: n.from,
        to: n.to,
        lang: lang ?? undefined,
        metric,
      }),
    );
  }

  return (
    <div className="flex w-full shrink-0 flex-col gap-2 md:w-auto">
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <div className="rounded-lg bg-muted p-[3px]">
          <div className="flex gap-0.5">
            <button
              type="button"
              onClick={() => {
                const p = presetRangeDays(pickerMin, pickerMax, CHART_RANGE_SHORT);
                pushRange(p.from, p.to);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                presetActive === "7"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              {presetLabel7}
            </button>
            <button
              type="button"
              onClick={() => {
                const p = presetRangeDays(pickerMin, pickerMax, CHART_RANGE_LONG);
                pushRange(p.from, p.to);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                presetActive === "30"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              {presetLabel30}
            </button>
          </div>
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <div className="rounded-lg bg-muted p-[3px]">
            <PopoverTrigger
              className={cn(
                "flex min-w-[200px] items-center justify-start gap-2 rounded-md px-3 py-1.5 text-left text-sm font-medium",
                "border-0 bg-card text-foreground shadow-sm outline-none transition-[color,box-shadow]",
                "hover:text-foreground hover:shadow-sm",
                "focus-visible:ring-2 focus-visible:ring-ring/45",
                "[&[aria-expanded=true]]:shadow-sm",
              )}
            >
              <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="tabular-nums lining-nums">
                {chartFrom} — {chartTo}
              </span>
            </PopoverTrigger>
          </div>
          <PopoverContent
            className={cn(
              "w-auto overflow-hidden rounded-xl border border-border p-0",
              "bg-[var(--calendar-surface)] text-foreground",
              "opacity-100 shadow-[0_10px_32px_-8px_rgb(40_36_33/12%)]",
              "!animate-none motion-safe:!transition-none",
            )}
            align="end"
          >
            <Calendar
              mode="range"
              locale={calendarLocale}
              captionLayout="dropdown"
              className="rounded-none bg-[var(--calendar-surface)] text-foreground"
              selected={{
                from: parseDay(chartFrom),
                to: parseDay(chartTo),
              }}
              defaultMonth={parseDay(chartTo)}
              disabled={(day) => {
                const d = format(day, "yyyy-MM-dd");
                return d < pickerMin || d > pickerMax;
              }}
              onSelect={(range: DateRange | undefined) => {
                if (!range?.from || !range.to) return;
                const from = format(range.from, "yyyy-MM-dd");
                const to = format(range.to, "yyyy-MM-dd");
                pushRange(from, to);
                setOpen(false);
              }}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
