import { addDaysToIsoDate } from "@/lib/chart-range";
import { STAR_TIERS } from "@/lib/constants";
import { requireDb } from "@/lib/db/index";
import { collectionRuns } from "@/lib/db/schema";
import { and, eq, max } from "drizzle-orm";

function asIsoDay(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return null;
}

/**
 * 各档 `status=success` 的 `max(run_date)` 里**最小**的那一天：表示「最慢那一档」最后全员都有成功快照的对齐日。
 * 任一档尚无成功 run 时返回 null。
 */
export async function minOfPerTierMaxSuccessRunDate(): Promise<string | null> {
  const db = requireDb();
  let bottleneck: string | null = null;
  for (const t of STAR_TIERS) {
    const rows = await db
      .select({ m: max(collectionRuns.runDate) })
      .from(collectionRuns)
      .where(
        and(eq(collectionRuns.tier, t.id), eq(collectionRuns.status, "success")),
      );
    const s = asIsoDay(rows[0]?.m);
    if (!s) return null;
    if (bottleneck == null || s < bottleneck) bottleneck = s;
  }
  return bottleneck;
}

/** 建议从下一天起按日补采，使各档日期对齐到最新（与 `minOfPerTierMaxSuccessRunDate` +1 天） */
export async function suggestedGapFillStartDate(): Promise<string | null> {
  const last = await minOfPerTierMaxSuccessRunDate();
  if (!last) return null;
  return addDaysToIsoDate(last, 1);
}

/** 含首尾，按 UTC 日历日递增 */
export function iterateUtcIsoDaysInclusive(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  let d = from;
  while (d <= to) {
    out.push(d);
    d = addDaysToIsoDate(d, 1);
  }
  return out;
}
