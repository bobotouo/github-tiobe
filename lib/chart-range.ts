import { getDataRetentionDays } from "@/lib/env-config";

/** 含首尾的自然日数 */
export function daysBetweenInclusive(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00.000Z`).getTime();
  const b = new Date(`${to}T12:00:00.000Z`).getTime();
  return Math.floor((b - a) / 86400000) + 1;
}

export function subtractDaysFromIsoDate(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function addDaysToIsoDate(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function clampIsoDate(v: string, min: string, max: string): string {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/** 限制在可选区间内，且跨度不超过 `DATA_RETENTION_DAYS`（见 getDataRetentionDays） */
export function normalizeChartRange(
  from: string,
  to: string,
  pickerMin: string,
  pickerMax: string,
  maxSpan?: number,
): { from: string; to: string } {
  const span = maxSpan ?? getDataRetentionDays();
  let f = clampIsoDate(from, pickerMin, pickerMax);
  let t = clampIsoDate(to, pickerMin, pickerMax);
  if (f > t) {
    [f, t] = [t, f];
  }

  if (daysBetweenInclusive(f, t) > span) {
    f = subtractDaysFromIsoDate(t, span - 1);
  }
  if (f < pickerMin) {
    f = pickerMin;
  }
  if (daysBetweenInclusive(f, t) > span) {
    t = addDaysToIsoDate(f, span - 1);
    if (t > pickerMax) t = pickerMax;
  }
  if (f > t) {
    t = f;
  }
  return { from: f, to: t };
}

/** 快捷「近 N 日」区间：结束于可选的最后一天 */
export function presetRangeDays(
  pickerMin: string,
  pickerMax: string,
  days: number,
): { from: string; to: string } {
  const to = pickerMax;
  const from = subtractDaysFromIsoDate(to, days - 1);
  return normalizeChartRange(from, to, pickerMin, pickerMax);
}

export function matchPreset(
  from: string,
  to: string,
  pickerMin: string,
  pickerMax: string,
): "7" | "30" | null {
  const p7 = presetRangeDays(pickerMin, pickerMax, 7);
  const p30 = presetRangeDays(pickerMin, pickerMax, 30);
  if (from === p7.from && to === p7.to) return "7";
  if (from === p30.from && to === p30.to) return "30";
  return null;
}
