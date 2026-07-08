import {
  STAR_TIERS,
  starsSearchQualifier,
} from "@/lib/constants";
import {
  getCollectHeatEnabled,
  getCollectHeatLookbackDays,
  getCollectHeatSearchDelayMs,
  getCollectHeatTopLangs,
} from "@/lib/env-config";
import { requireDb } from "@/lib/db/index";
import { languageHeatSnapshots } from "@/lib/db/schema";
import { searchRepositoriesTotalCount } from "@/lib/github/search";
import { subtractDaysFromIsoDate } from "@/lib/chart-range";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** GitHub `language:` 限定符中的语言名转义 */
export function languageQualifierForGitHubSearch(name: string): string {
  if (name === "Other") return name;
  if (/^[A-Za-z0-9_.+\-#]+$/.test(name)) return name;
  const escaped = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

type TierDef = (typeof STAR_TIERS)[number];

/**
 * 对单次成功 run 写入热度：同一星档下，各语言在 `created:>=` 窗口内的新仓库 Search 总量（近似大众「新仓库热度」）。
 */
export async function collectLanguageHeatForRun(opts: {
  runId: number;
  runDate: string;
  tierDef: TierDef;
  languages: Array<{ language: string; share: number }>;
}): Promise<number> {
  if (!getCollectHeatEnabled()) return 0;

  const topN = getCollectHeatTopLangs();
  const delayMs = getCollectHeatSearchDelayMs();
  const lookback = getCollectHeatLookbackDays();
  const createdFrom = subtractDaysFromIsoDate(opts.runDate, lookback);
  const starQ = starsSearchQualifier(opts.tierDef);

  const sorted = [...opts.languages]
    .filter((l) => l.language !== "Other")
    .sort((a, b) => b.share - a.share)
    .slice(0, topN);

  const rows: Array<{
    runId: number;
    language: string;
    repoTotal: number;
  }> = [];

  /** 热度 Search 在 env 间隔之上再加固定下限，减轻 secondary limit */
  const effectiveDelayMs = Math.max(delayMs, 3000);

  for (let i = 0; i < sorted.length; i += 1) {
    const { language } = sorted[i];
    if (i > 0 && effectiveDelayMs > 0) await sleep(effectiveDelayMs);
    const langQ = languageQualifierForGitHubSearch(language);
    const q = `${starQ} language:${langQ} created:>=${createdFrom}`;
    const total = await searchRepositoriesTotalCount(q);
    const capped = Math.min(total, 2_147_483_647);
    rows.push({ runId: opts.runId, language, repoTotal: capped });
  }

  if (rows.length === 0) return 0;

  const db = requireDb();
  await db.insert(languageHeatSnapshots).values(rows);
  return rows.length;
}
