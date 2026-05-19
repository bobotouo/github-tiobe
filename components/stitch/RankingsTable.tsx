"use client";

import { useCallback, useState } from "react";

import { useI18n } from "@/components/i18n/locale-provider";
import { RankingSparkline } from "@/components/stitch/RankingSparkline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { chartLineColorByIndex } from "@/lib/chart/lineHex";
import {
  RANKINGS_PREVIEW_COUNT,
  type TierId,
} from "@/lib/constants";
import type { RankingRow } from "@/lib/rankings";

/** 与表格两位小数一致：显示为 0.00% 视为无变化 */
const CHANGE_EPS = 0.005;

function ChangeCell({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center text-xs font-semibold text-on-surface-variant">
        <span className="material-symbols-outlined mr-1 text-sm">horizontal_rule</span>
        —
      </span>
    );
  }
  if (Math.abs(delta) < CHANGE_EPS) {
    return (
      <span className="inline-flex items-center text-xs font-semibold tabular-nums lining-nums text-on-surface-variant">
        <span className="material-symbols-outlined mr-1 text-sm">horizontal_rule</span>
        0.00%
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`inline-flex items-center text-xs font-semibold tabular-nums lining-nums ${up ? "text-tertiary" : "text-destructive"}`}
    >
      <span className="material-symbols-outlined mr-1 text-sm">
        {up ? "trending_up" : "trending_down"}
      </span>
      {up ? "+" : ""}
      {delta.toFixed(2)}%
    </span>
  );
}

function RankingSkeletonRows({
  count = 6,
  cols = 5,
}: {
  count?: number;
  cols?: number;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, sk) => (
        <tr key={`rank-sk-${sk}`} aria-hidden>
          {Array.from({ length: cols }, (_, j) => (
            <td key={j} className="py-4">
              <div className="h-4 w-full max-w-[8rem] animate-pulse rounded-md bg-muted" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

type Props = {
  tier: TierId;
  previewRows: RankingRow[];
  totalLanguageCount: number;
  snapshotDate: string;
  repoCount: number;
  showHeatColumn: boolean;
  /** 近 RANKING_SPARKLINE_DAYS 日 Linguist 占比序列（与「占比」列一致，不随趋势图 share/heat 切换） */
  sparklinesByLanguage: Record<string, number[]>;
};

export function RankingsTable({
  tier,
  previewRows,
  totalLanguageCount,
  snapshotDate,
  repoCount,
  showHeatColumn,
  sparklinesByLanguage,
}: Props) {
  const { dict } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<RankingRow[]>(previewRows);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasMore = totalLanguageCount > RANKINGS_PREVIEW_COUNT;
  const remainder = Math.max(0, totalLanguageCount - RANKINGS_PREVIEW_COUNT);
  const displayRows = expanded ? rows : previewRows;
  const colCount = showHeatColumn ? 6 : 5;

  const loadRest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rankings?tier=${encodeURIComponent(tier)}`);
      const data = (await res.json()) as { error?: string; rows?: RankingRow[] };
      if (!res.ok) {
        throw new Error(data.error ?? `${dict.api.requestFailed} ${res.status}`);
      }
      if (!data.rows) {
        throw new Error(dict.api.noRows);
      }
      setRows(data.rows);
      setExpanded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tier, dict]);

  const collapse = useCallback(() => {
    setExpanded(false);
  }, []);

  const [y, m, d] = snapshotDate.split("-");
  const dateLabel = `${y}-${m}-${d}`;

  function trendCell(r: RankingRow) {
    const top15 = r.rank <= RANKINGS_PREVIEW_COUNT;
    const pts = sparklinesByLanguage[r.language];
    const ok = top15 && pts != null && pts.length >= 2;
    if (!ok) {
      return (
        <span className="text-muted-foreground tabular-nums" aria-hidden>
          —
        </span>
      );
    }
    return (
      <RankingSparkline
        values={pts}
        color={chartLineColorByIndex(r.rank - 1)}
      />
    );
  }

  function langDotColor(r: RankingRow): string {
    if (r.rank <= RANKINGS_PREVIEW_COUNT) {
      return chartLineColorByIndex(r.rank - 1);
    }
    return "var(--outline-variant)";
  }

  return (
    <section className="mb-20">
      <Card className="border-border gap-0 rounded-xl border bg-card py-0 shadow-none ring-0">
        <CardHeader className="space-y-0 border-b border-border px-6 pb-4 pt-6 sm:px-8">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <CardTitle className="text-2xl font-medium tracking-tight text-card-foreground">
              {dict.rankings.title}
            </CardTitle>
            <div className="text-sm text-muted-foreground tabular-nums">
              {dict.rankings.metaLine(dateLabel, repoCount, totalLanguageCount)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-6 pt-0 sm:px-2">
          <div className="overflow-x-auto px-4 sm:px-6">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--thin-border)] text-on-surface-variant">
                  <th className="py-4 text-xs font-semibold uppercase tracking-[0.08em]">
                    {dict.rankings.colRank}
                  </th>
                  <th className="py-4 text-xs font-semibold uppercase tracking-[0.08em]">
                    {dict.rankings.colLanguage}
                  </th>
                  <th className="py-4 text-xs font-semibold uppercase tracking-[0.08em]">
                    {dict.rankings.colShare}
                  </th>
                  {showHeatColumn ? (
                    <th className="py-4 text-xs font-semibold uppercase tracking-[0.08em]">
                      {dict.rankings.colHeat}
                    </th>
                  ) : null}
                  <th className="py-4 text-xs font-semibold uppercase tracking-[0.08em]">
                    {dict.rankings.colDoD}
                  </th>
                  <th className="w-[104px] py-4 text-xs font-semibold uppercase tracking-[0.08em]">
                    {dict.rankings.colTrend}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--thin-border)]">
                {displayRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={colCount}
                      className="py-8 text-center text-sm text-on-surface-variant"
                    >
                      {dict.rankings.empty}
                    </td>
                  </tr>
                ) : (
                  displayRows.map((r) => (
                    <tr
                      key={r.language}
                      className="group transition-colors hover:bg-surface-container-low"
                    >
                      <td className="py-3 font-mono text-sm tabular-nums text-on-surface-variant">
                        {String(r.rank).padStart(2, "0")}
                      </td>
                      <td className="py-3">
                        <span className="inline-flex max-w-[12rem] items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: langDotColor(r) }}
                            aria-hidden
                          />
                          <span className="truncate font-medium lining-nums text-primary">
                            {r.language}
                          </span>
                        </span>
                      </td>
                      <td className="py-3 text-sm tabular-nums lining-nums">
                        {r.usagePct.toFixed(2)}%
                      </td>
                      {showHeatColumn ? (
                        <td className="py-3 text-sm tabular-nums lining-nums text-muted-foreground">
                          {r.heatRepoTotal != null ? (
                            r.heatRepoTotal.toLocaleString()
                          ) : (
                            <span aria-hidden>—</span>
                          )}
                        </td>
                      ) : null}
                      <td className="py-3">
                        <ChangeCell delta={r.changePctPoints} />
                      </td>
                      <td className="py-2 align-middle">{trendCell(r)}</td>
                    </tr>
                  ))
                )}
                {loading && !expanded && (
                  <RankingSkeletonRows cols={colCount} />
                )}
              </tbody>
            </table>
          </div>
          {hasMore && expanded && (
            <div className="flex justify-center px-4 pt-6 sm:px-6">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={collapse}
                className="min-w-[12rem]"
              >
                {dict.rankings.collapse}
              </Button>
            </div>
          )}
          {hasMore && !expanded && (
            <div className="flex justify-center px-4 pt-6 sm:px-6">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => void loadRest()}
                className="min-w-[12rem]"
              >
                {loading ? dict.rankings.loading : dict.rankings.expand(remainder)}
              </Button>
            </div>
          )}
          {error && (
            <p className="px-4 pt-4 text-center text-sm text-destructive sm:px-6">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
