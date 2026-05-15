"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { buildLineChartModel, type DayInput } from "@/lib/chart/buildSeries";
import { DEFAULT_TOP_LANGS_CHART } from "@/lib/constants";

const PALETTE = [
  "#5c7cfa",
  "#51cf66",
  "#ff922b",
  "#cc5de8",
  "#22b8cf",
  "#ffd43b",
  "#ff6b6b",
  "#20c997",
  "#845ef7",
  "#fd7e14",
  "#adb5bd",
  "#e599f7",
  "#339af0",
  "#ff8787",
  "#69db7c",
];

type Props = {
  days: DayInput[];
  topN?: number;
};

export function LanguageTrendChart({ days, topN = DEFAULT_TOP_LANGS_CHART }: Props) {
  const { data, lineKeys } = useMemo(
    () => buildLineChartModel(days, topN),
    [days, topN],
  );

  const yDomain = useMemo((): [number, number] => {
    const values: number[] = [];
    for (const row of data) {
      for (const key of lineKeys) {
        const v = row[key];
        if (typeof v === "number" && Number.isFinite(v)) values.push(v);
      }
    }
    if (values.length === 0) return [0, 100];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(0.1, max - min);
    const pad = Math.max(0.2, span * 0.12);
    const low = Math.max(0, min - pad);
    const high = Math.min(100, max + pad);
    return [Number(low.toFixed(2)), Number(Math.max(low + 0.1, high).toFixed(2))];
  }, [data, lineKeys]);

  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] text-sm text-[var(--muted)]">
        尚无数据。配置数据库并触发一次采集后即可查看近 7 日趋势。
      </div>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            domain={yDomain}
            tickFormatter={(v) => `${Number(v).toFixed(2)}%`}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              boxShadow: "0 8px 30px rgb(0 0 0 / 6%)",
            }}
            labelStyle={{ color: "var(--foreground)" }}
            formatter={(value, name) => [
              `${Number(value ?? 0).toFixed(2)}%`,
              String(name),
            ]}
          />
          <Legend wrapperStyle={{ fontSize: "12px", color: "var(--muted)" }} />
          {lineKeys.map((key, i) => (
            <Line
              key={key}
              type="monotoneX"
              dataKey={key}
              name={key}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
