import type { TierId } from "@/lib/constants";
import { getDataRetentionDays } from "@/lib/env-config";
import { subtractDaysFromIsoDate } from "@/lib/chart-range";
import { getSeriesForTierCached } from "@/lib/db/stats";
import { buildRankingRows } from "@/lib/rankings";

function utcTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 与首页排行逻辑一致，供 /api/rankings 与需复用处调用（走 Data Cache） */
export async function loadFullRankingForTier(tier: TierId) {
  const today = utcTodayString();
  const retentionStart = subtractDaysFromIsoDate(
    today,
    getDataRetentionDays() - 1,
  );
  const { days } = await getSeriesForTierCached(tier, retentionStart, today);

  const seriesDays = days.map((d) => ({
    runDate: d.runDate,
    repoCount: d.repoCount,
    languages: d.languages.map(({ language, share, heatRepoTotal }) => ({
      language,
      share,
      heatRepoTotal,
    })),
  }));

  const rankingSnapshotDate =
    seriesDays.length > 0 ? seriesDays[seriesDays.length - 1].runDate : today;

  return buildRankingRows(seriesDays, rankingSnapshotDate);
}
