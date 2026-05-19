"use client";

import { useMemo, type ReactNode } from "react";

import { useI18n } from "@/components/i18n/locale-provider";
import { EnrichWordCloud } from "@/components/stitch/EnrichWordCloud";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { aggregateHotspotTerms } from "@/lib/enrich/aggregate-hotspot-terms";
import type { RepoEnrichmentItem } from "@/lib/enrich/types";
import { cn } from "@/lib/utils";

type Props = {
  tierLabel: string;
  snapshotDate: string;
  /** UTC 当日 YYYY-MM-DD，用于标注「是否今天」 */
  todayUtc: string;
  items: RepoEnrichmentItem[];
};

export function RepoEnrichmentsPanel({
  tierLabel,
  snapshotDate,
  todayUtc,
  items,
}: Props) {
  const { dict } = useI18n();
  const e = dict.enrich;
  const hotspotTerms = useMemo(() => aggregateHotspotTerms(items), [items]);
  const isToday = snapshotDate === todayUtc;

  const headerMeta = (
    <div className="flex flex-col items-end gap-1 text-right text-sm text-muted-foreground sm:items-end">
      <span className="tabular-nums">
        {e.metaLine(snapshotDate, tierLabel, items.length, hotspotTerms.length)}
      </span>
      <span className="text-xs leading-snug text-muted-foreground">{e.dateCaption}</span>
      <span
        className={cn(
          "inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium",
          isToday
            ? "bg-tertiary/15 text-tertiary"
            : "bg-muted text-muted-foreground",
        )}
      >
        {isToday ? e.badgeToday : e.badgeNotToday(snapshotDate)}
      </span>
    </div>
  );

  if (items.length === 0) {
    return (
      <section className="mb-20">
        <Card className="border-border gap-0 rounded-xl border bg-card py-0 shadow-none ring-0">
          <CardHeader className="space-y-0 border-b border-border px-6 pb-4 pt-6 sm:px-8">
            <PanelHeaderRow title={e.title} meta={headerMeta} />
            <p className="mt-3 text-sm text-on-surface-variant">{e.emptyHint}</p>
          </CardHeader>
        </Card>
      </section>
    );
  }

  return (
    <section className="mb-20">
      <Card className="border-border gap-0 rounded-xl border bg-card py-0 shadow-none ring-0">
        <CardHeader className="space-y-0 border-b border-border px-6 pb-4 pt-6 sm:px-8">
          <PanelHeaderRow title={e.title} meta={headerMeta} />
        </CardHeader>
        <CardContent className="px-4 py-6 sm:px-8 sm:py-10">
          {hotspotTerms.length > 0 ? (
            <EnrichWordCloud
              terms={hotspotTerms}
              countLabel={e.termCount}
              cloudAriaLabel={e.cloudAria(items.length, hotspotTerms.length, tierLabel)}
            />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">{e.noTerms}</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function PanelHeaderRow({
  title,
  meta,
}: {
  title: string;
  meta: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <CardTitle className="text-2xl font-medium tracking-tight text-card-foreground">
        {title}
      </CardTitle>
      {meta}
    </div>
  );
}
