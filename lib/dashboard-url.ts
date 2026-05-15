import type { TierId } from "@/lib/constants";

export type DashboardSearch = {
  tier: TierId;
  from: string;
  to: string;
  lang?: string | null;
  /** 默认不传 URL，表示「结构占比」；`heat` 为新建仓 Search 热度视图 */
  metric?: "share" | "heat";
};

export function buildDashboardHref(opts: DashboardSearch): string {
  const q = new URLSearchParams();
  q.set("tier", opts.tier);
  q.set("from", opts.from);
  q.set("to", opts.to);
  if (opts.lang) {
    q.set("lang", opts.lang);
  }
  if (opts.metric === "heat") {
    q.set("metric", "heat");
  }
  return `/?${q.toString()}`;
}
