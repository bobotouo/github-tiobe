"use client";

import { useLangNav } from "@/components/LangNavContext";
import { useI18n } from "@/components/i18n/locale-provider";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  buildLineChartModel,
  buildSingleLanguageSeries,
  type DayInput,
  type LineChartValueMode,
} from "@/lib/chart/buildSeries";
import { chartLineColorByIndex } from "@/lib/chart/lineHex";
import { DEFAULT_TOP_LANGS_CHART } from "@/lib/constants";
import {
  velocityIndexForLanguage,
  velocityIndexForLanguageHeat,
  velocityIndexPercent,
  velocityIndexPercentHeat,
} from "@/lib/rankings";
import { cn } from "@/lib/utils";

type TooltipPayloadItem = {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
};

type StitchTooltipProps = {
  active?: boolean;
  payload?: unknown;
  label?: unknown;
  baselineByKey: Record<string, number> | null;
};

function StitchTooltip({ active, payload, label, baselineByKey }: StitchTooltipProps) {
  if (!active || !payload || !Array.isArray(payload) || payload.length === 0) {
    return null;
  }
  const rows = ([...payload] as TooltipPayloadItem[]).filter(
    (p) =>
      p.value != null &&
      !Number.isNaN(Number(p.value)) &&
      p.dataKey !== "date" &&
      p.dataKey !== "_i",
  );
  if (rows.length === 0) {
    return null;
  }
  const sorted = [...rows].sort((a, b) => Number(b.value) - Number(a.value));

  const row0 = (payload as TooltipPayloadItem[])[0]?.payload;
  const labelText =
    row0?.date != null
      ? String(row0.date)
      : label != null
        ? String(label)
        : "";

  return (
    <div
      className={cn(
        "pointer-events-auto min-w-[15rem] max-w-[min(90vw,28rem)] rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg",
        "font-[family-name:var(--font-sans)] [font-variant-numeric:tabular-nums_lining-nums]",
      )}
    >
      <div className="mb-1.5 shrink-0 border-b border-border pb-1 text-[11px] font-medium text-popover-foreground">
        {labelText}
      </div>
      <ul
        className={cn(
          "max-h-[min(70vh,28rem)] overflow-y-auto overscroll-y-contain pr-0.5 [-webkit-overflow-scrolling:touch]",
          "flex flex-col gap-0.5",
        )}
      >
        {sorted.map((p) => {
          const name = String(p.name ?? p.dataKey ?? "");
          const v = Number(p.value);
          const base = baselineByKey?.[name];
          const level =
            base != null && Number.isFinite(base) ? base + v : null;
          return (
            <li
              key={`${name}-${p.dataKey}`}
              className="flex min-h-0 items-center gap-1.5 py-0.5 text-[11px] leading-tight"
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: p.color ?? "var(--muted-foreground)" }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-popover-foreground" title={name}>
                {name}
              </span>
              <span className="shrink-0 whitespace-nowrap tabular-nums text-popover-foreground">
                {baselineByKey ? (
                  <>
                    <span className="font-medium">
                      Δ{v >= 0 ? "+" : ""}
                      {v.toFixed(3)}
                    </span>
                    {level != null && Number.isFinite(level) ? (
                      <span className="text-muted-foreground"> →{level.toFixed(2)}%</span>
                    ) : null}
                  </>
                ) : (
                  <span className="font-medium">{v.toFixed(2)}%</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function yDomainFromValues(values: number[], minSpan: number): [number, number] {
  if (values.length === 0) return [0, 100];
  let min = Math.min(...values);
  let max = Math.max(...values);
  let span = Math.max(1e-9, max - min);
  if (span < minSpan) {
    const mid = (min + max) / 2;
    min = mid - minSpan / 2;
    max = mid + minSpan / 2;
    span = minSpan;
  }
  const pad = Math.max(0.06, span * 0.1);
  let low = min - pad;
  let high = max + pad;
  if (low < 0) {
    high += -low;
    low = 0;
  }
  if (high > 100) {
    low -= high - 100;
    high = 100;
    low = Math.max(0, low);
  }
  low = Number(low.toFixed(4));
  high = Number(Math.max(low + 0.02, high).toFixed(4));
  return [low, high];
}

/** Δ（百分点）纵轴，允许负值 */
function yDomainFromDeltaValues(values: number[], minSpan: number): [number, number] {
  if (values.length === 0) return [-0.4, 0.4];
  let min = Math.min(...values);
  let max = Math.max(...values);
  let span = Math.max(1e-9, max - min);
  if (span < minSpan) {
    const mid = (min + max) / 2;
    min = mid - minSpan / 2;
    max = mid + minSpan / 2;
    span = minSpan;
  }
  const pad = Math.max(0.03, span * 0.12);
  return [
    Number((min - pad).toFixed(4)),
    Number((max + pad).toFixed(4)),
  ];
}

/** 多线：各序列减去区间首日的值（百分点），突出走势差异 */
function indexDeltaFromFirstRow<
  T extends Record<string, number | string> & { _i: number },
>(rows: T[], keys: string[]): T[] {
  if (rows.length === 0) return rows;
  const base = rows[0];
  return rows.map((row) => {
    const out = { ...row } as T;
    for (const k of keys) {
      const b = base[k];
      const v = row[k];
      if (typeof v === "number" && typeof b === "number") {
        (out as Record<string, unknown>)[k] = Number((v - b).toFixed(4));
      }
    }
    return out;
  });
}

function baselineFromFirstRow(
  row: Record<string, number | string>,
  keys: string[],
): Record<string, number> {
  const m: Record<string, number> = {};
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) m[k] = v;
  }
  return m;
}

type Props = {
  days: DayInput[];
  topN?: number;
  chartValue: LineChartValueMode;
};

const FOCUS_MIN_SPAN = 0.48;
/** 多线 Δ 图：纵轴跨度下限（百分点） */
const INDEXED_MIN_SPAN = 0.35;

export function StitchLineChart({
  days,
  topN = DEFAULT_TOP_LANGS_CHART,
  chartValue,
}: Props) {
  const { lang: focusLang, setLang } = useLangNav();
  const { dict } = useI18n();

  const velocityPct = useMemo(() => {
    if (chartValue === "heat") {
      return focusLang
        ? velocityIndexForLanguageHeat(days, focusLang)
        : velocityIndexPercentHeat(days);
    }
    return focusLang
      ? velocityIndexForLanguage(days, focusLang)
      : velocityIndexPercent(days);
  }, [days, chartValue, focusLang]);

  const velocityTitle = useMemo(() => {
    if (chartValue === "heat") {
      return focusLang
        ? dict.chart.velocityMoMHeat(focusLang)
        : dict.chart.velocityIndexHeat;
    }
    return focusLang
      ? dict.chart.velocityMoM(focusLang)
      : dict.chart.velocityIndex;
  }, [chartValue, focusLang, dict.chart]);

  const model = useMemo(
    () => buildLineChartModel(days, topN, { value: chartValue }),
    [days, topN, chartValue],
  );

  const focusColorIndex =
    focusLang != null ? Math.max(0, model.lineKeys.indexOf(focusLang)) : 0;

  const { data, lineKeys } = useMemo(() => {
    if (!focusLang) {
      return model;
    }
    if (model.lineKeys.includes(focusLang)) {
      return {
        data: model.data.map((row) => ({
          date: row.date,
          [focusLang]: row[focusLang],
        })),
        lineKeys: [focusLang],
      };
    }
    return buildSingleLanguageSeries(days, focusLang, { value: chartValue });
  }, [days, focusLang, model, chartValue]);

  const rawRows = useMemo<
    Array<Record<string, number | string> & { _i: number }>
  >(
    () =>
      data.map((row, i) => ({
        ...(row as Record<string, number | string>),
        _i: i,
      })),
    [data],
  );

  const useIndexedMulti = !focusLang && model.lineKeys.length > 1;

  const baselineByKey = useMemo(() => {
    if (!useIndexedMulti || rawRows.length === 0) return null;
    return baselineFromFirstRow(rawRows[0], model.lineKeys);
  }, [useIndexedMulti, rawRows, model.lineKeys]);

  const chartRows = useMemo(() => {
    if (!useIndexedMulti) return rawRows;
    return indexDeltaFromFirstRow(rawRows, model.lineKeys);
  }, [useIndexedMulti, rawRows, model.lineKeys]);

  const xDomain = useMemo((): [number, number] => {
    const max = Math.max(0, chartRows.length - 1);
    return [0, max];
  }, [chartRows.length]);

  const xTicks = useMemo(() => {
    const n = chartRows.length;
    const maxTicks = 12;
    if (n <= 0) {
      return [];
    }
    if (n === 1) {
      return [0];
    }
    if (n <= maxTicks) {
      return chartRows.map((_, i) => i);
    }
    const innerSlots = maxTicks - 2;
    const pick = new Set<number>([0, n - 1]);
    for (let j = 1; j <= innerSlots; j++) {
      const idx = Math.round((j * (n - 1)) / (innerSlots + 1));
      pick.add(Math.min(n - 1, Math.max(0, idx)));
    }
    return Array.from(pick).sort((a, b) => a - b);
  }, [chartRows]);

  const yDomain = useMemo((): [number, number] => {
    const values: number[] = [];
    for (const row of chartRows) {
      for (const key of lineKeys) {
        const v = row[key];
        if (typeof v === "number" && Number.isFinite(v)) values.push(v);
      }
    }
    const minSpan = useIndexedMulti ? INDEXED_MIN_SPAN : FOCUS_MIN_SPAN;
    if (useIndexedMulti) {
      return yDomainFromDeltaValues(values, minSpan);
    }
    return yDomainFromValues(values, minSpan);
  }, [chartRows, lineKeys, useIndexedMulti]);

  const yTickDecimals = useMemo(() => {
    const [lo, hi] = yDomain;
    const span = hi - lo;
    if (useIndexedMulti) return span < 0.5 ? 3 : 2;
    return span < 0.65 ? 3 : 2;
  }, [yDomain, useIndexedMulti]);

  const legendTwoRowCols = useMemo(() => {
    const n = model.lineKeys.length;
    if (n <= 1) return 1;
    return Math.ceil(n / 2);
  }, [model.lineKeys.length]);

  function setFocusLang(next: string | null) {
    setLang(next);
  }

  if (data.length === 0) {
    return (
      <div className="flex h-[min(22rem,55vh)] min-h-[16.5rem] items-center justify-center rounded-xl border border-dashed border-[var(--thin-border)] bg-surface-container-low text-sm leading-normal text-on-surface-variant">
        {dict.chart.noData}
      </div>
    );
  }

  return (
    <div>
      <div
        className={cn(
          "mb-4 flex flex-col gap-4 md:flex-row md:items-start",
          !focusLang ? "md:justify-between" : "md:justify-between",
        )}
      >
        <div className="min-w-0 flex-1">
          {focusLang ? (
            <div className="flex flex-wrap items-center gap-2.5 py-1">
              <button
                type="button"
                onClick={() => setFocusLang(null)}
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                {dict.chart.showAllLanguages}
              </button>
              <span className="flex min-w-0 items-center gap-1.5 text-foreground">
                <span
                  className="h-0.5 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: chartLineColorByIndex(focusColorIndex) }}
                />
                <span className="truncate font-sans text-[10px] font-semibold uppercase leading-none tracking-wide">
                  {focusLang}
                </span>
              </span>
            </div>
          ) : (
            <div className="-mx-1 px-1 py-1">
              <div
                className="grid gap-x-2 gap-y-2"
                style={{
                  gridTemplateColumns: `repeat(${legendTwoRowCols}, minmax(0, 1fr))`,
                }}
              >
                {model.lineKeys.map((key, i) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFocusLang(key)}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-left transition-colors",
                      "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
                    )}
                    title={key}
                  >
                    <span
                      className="h-0.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: chartLineColorByIndex(i) }}
                    />
                    <span className="truncate font-sans text-[9px] font-semibold uppercase leading-tight tracking-wide text-on-surface-variant">
                      {key}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {velocityPct !== null && (
          <div className="shrink-0 text-left md:text-right">
            <span className="text-[12px] font-semibold uppercase leading-none tracking-[0.08em] text-on-surface-variant">
              {velocityTitle}
            </span>
            <div className="mt-1 text-2xl font-semibold tabular-nums leading-none tracking-tight text-primary lining-nums">
              {velocityPct >= 0 ? "+" : ""}
              {velocityPct.toFixed(2)}%
            </div>
          </div>
        )}
      </div>

      <div className="stitch-line-chart-host relative h-[min(20rem,50vh)] min-h-[15rem] w-full select-none overflow-visible sm:h-[min(22rem,48vh)]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            accessibilityLayer={false}
            data={chartRows}
            margin={{ top: 8, right: 10, left: 2, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" />
            <XAxis
              type="number"
              dataKey="_i"
              domain={xDomain}
              ticks={xTicks}
              scale="linear"
              allowDecimals={false}
              height={20}
              tickFormatter={(v) => {
                const row = chartRows[Number(v)];
                const d = row?.date;
                return d != null ? String(d).slice(5) : "";
              }}
              tickMargin={2}
              tick={{
                fill: "var(--chart-axis-label)",
                fontSize: 11,
                fontFamily: "var(--font-sans)",
                letterSpacing: "-0.01em",
              }}
              tickLine={false}
              axisLine={{ stroke: "var(--thin-border)" }}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={(v) =>
                useIndexedMulti
                  ? `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(yTickDecimals)}`
                  : `${Number(v).toFixed(yTickDecimals)}%`
              }
              tick={{
                fill: "var(--chart-axis-label)",
                fontSize: 11,
                fontFamily: "var(--font-sans)",
              }}
              tickLine={false}
              axisLine={{ stroke: "var(--thin-border)" }}
              width={useIndexedMulti ? 44 : 48}
            />
            <Tooltip
              allowEscapeViewBox={{ x: true, y: true }}
              isAnimationActive={false}
              cursor={{ stroke: "var(--thin-border)", strokeWidth: 1 }}
              content={(tipProps) => (
                <StitchTooltip
                  {...tipProps}
                  baselineByKey={useIndexedMulti ? baselineByKey : null}
                />
              )}
              wrapperStyle={{
                outline: "none",
                zIndex: 50,
                pointerEvents: "auto",
              }}
            />
            {lineKeys.map((key, i) => (
              <Line
                key={key}
                type="monotoneX"
                dataKey={key}
                name={key}
                stroke={chartLineColorByIndex(focusLang ? focusColorIndex : i)}
                strokeWidth={focusLang ? 3 : 1.85}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 4 }}
                opacity={0.92}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {useIndexedMulti ? (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          {dict.chart.indexedNote}
        </p>
      ) : null}
    </div>
  );
}
