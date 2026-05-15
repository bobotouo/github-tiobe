"use client";

import { useRouter } from "next/navigation";

import { useLangNav } from "@/components/LangNavContext";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STAR_TIERS, isTierId, type TierId } from "@/lib/constants";
import { buildDashboardHref } from "@/lib/dashboard-url";
import type { LineChartValueMode } from "@/lib/chart/buildSeries";
import { cn } from "@/lib/utils";

type Props = {
  active: TierId;
  chartFrom: string;
  chartTo: string;
  metric: LineChartValueMode;
};

export function TierTabs({ active, chartFrom, chartTo, metric }: Props) {
  const router = useRouter();
  const { lang } = useLangNav();

  return (
    <Tabs
      value={active}
      onValueChange={(id) => {
        if (id == null) return;
        const s = String(id);
        if (!isTierId(s)) return;
        router.push(
          buildDashboardHref({
            tier: s,
            from: chartFrom,
            to: chartTo,
            lang: lang ?? undefined,
            metric,
          }),
        );
      }}
      className="w-fit max-w-full flex-row"
    >
      <TabsList className="box-border !h-auto inline-flex w-fit max-w-full flex-nowrap gap-0.5 rounded-lg bg-muted p-[3px]">
        {STAR_TIERS.map(({ id, pillLabel }) => (
          <TabsTrigger
            key={id}
            value={id}
            className={cn(
              "h-7 shrink-0 rounded-md px-2.5 py-0 text-xs font-medium after:hidden sm:h-8 sm:px-3 sm:text-sm",
              "data-active:shadow-sm",
              /* 深色：去掉 1px 描边，避免出现浅灰格子边 */
              "dark:border-0 dark:focus-visible:border-0",
            )}
          >
            {pillLabel}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
