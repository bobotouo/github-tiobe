"use client";

import { useRouter } from "next/navigation";

import { useLangNav } from "@/components/LangNavContext";
import { type TierId } from "@/lib/constants";
import { buildDashboardHref } from "@/lib/dashboard-url";
import type { LineChartValueMode } from "@/lib/chart/buildSeries";
import { cn } from "@/lib/utils";

type Props = {
  tier: TierId;
  from: string;
  to: string;
  metric: LineChartValueMode;
  labelShare: string;
  labelHeat: string;
};

export function ChartMetricTabs({
  tier,
  from,
  to,
  metric,
  labelShare,
  labelHeat,
}: Props) {
  const router = useRouter();
  const { lang } = useLangNav();

  function push(next: LineChartValueMode) {
    router.push(
      buildDashboardHref({
        tier,
        from,
        to,
        lang: lang ?? undefined,
        metric: next,
      }),
    );
  }

  return (
    <div className="rounded-lg bg-muted p-[3px]">
      <div className="flex gap-0.5">
        <button
          type="button"
          onClick={() => push("share")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            metric === "share"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
          )}
        >
          {labelShare}
        </button>
        <button
          type="button"
          onClick={() => push("heat")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            metric === "heat"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
          )}
        >
          {labelHeat}
        </button>
      </div>
    </div>
  );
}
