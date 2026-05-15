import { eq } from "drizzle-orm";

import { STAR_TIERS, type TierId } from "@/lib/constants";
import { collectLanguageHeatForRun } from "@/lib/collect/collect-language-heat";
import { getCollectHeatEnabled } from "@/lib/env-config";
import { requireDb } from "@/lib/db/index";
import {
  collectionRuns,
  languageHeatSnapshots,
  languageSnapshots,
} from "@/lib/db/schema";

export type BackfillLanguageHeatOptions = {
  /** 只打印将处理的 run，不写库、不调 GitHub */
  dryRun?: boolean;
  /** 对已存在热度行的 run 先删后采（同一 run_id 全量重算） */
  force?: boolean;
  /** 最多处理多少个 run（便于试跑） */
  limit?: number;
};

export type BackfillLanguageHeatResult = {
  /** 进入处理列表的 run 数（含 dry-run） */
  candidateRuns: number;
  /** 成功写入热度，或 dry-run 下会尝试的 run 数 */
  processed: number;
  /** 无 `language_snapshots` 行，跳过 */
  skippedNoLanguageSnapshots: number;
  errors: Array<{ runId: number; message: string }>;
};

function tierDefOrNull(tier: string) {
  return STAR_TIERS.find((t) => t.id === tier) ?? null;
}

/**
 * 为**已有**的 `collection_runs`（成功且已有 `language_snapshots`）补写 `language_heat_snapshots`，
 * 不触发 Linguist 重采、不按日删库。
 *
 * 需 `COLLECT_HEAT=1`（与日常采集一致），并配置 `GITHUB_TOKEN`。
 */
export async function backfillLanguageHeatSnapshots(
  opts: BackfillLanguageHeatOptions = {},
): Promise<BackfillLanguageHeatResult> {
  const { dryRun = false, force = false, limit } = opts;

  if (!getCollectHeatEnabled()) {
    throw new Error(
      "COLLECT_HEAT 未开启。请在环境变量中设置 COLLECT_HEAT=1 后再执行补数。",
    );
  }

  const db = requireDb();

  const successRuns = await db
    .select({
      id: collectionRuns.id,
      runDate: collectionRuns.runDate,
      tier: collectionRuns.tier,
    })
    .from(collectionRuns)
    .where(eq(collectionRuns.status, "success"));

  const heatRunRows = await db
    .selectDistinct({ runId: languageHeatSnapshots.runId })
    .from(languageHeatSnapshots);
  const runsWithHeat = new Set(heatRunRows.map((r) => r.runId));

  let candidates = successRuns.filter((r) => {
    if (!tierDefOrNull(r.tier)) return false;
    if (force) return true;
    return !runsWithHeat.has(r.id);
  });

  candidates.sort((a, b) => {
    const c = a.runDate.localeCompare(b.runDate);
    if (c !== 0) return c;
    return a.tier.localeCompare(b.tier);
  });

  if (limit != null && limit > 0) {
    candidates = candidates.slice(0, limit);
  }

  const result: BackfillLanguageHeatResult = {
    candidateRuns: candidates.length,
    processed: 0,
    skippedNoLanguageSnapshots: 0,
    errors: [],
  };

  for (const run of candidates) {
    const tierDef = tierDefOrNull(run.tier);
    if (!tierDef) {
      result.errors.push({ runId: run.id, message: `unknown tier: ${run.tier}` });
      continue;
    }

    const langs = await db
      .select({
        language: languageSnapshots.language,
        share: languageSnapshots.share,
      })
      .from(languageSnapshots)
      .where(eq(languageSnapshots.runId, run.id));

    if (langs.length === 0) {
      result.skippedNoLanguageSnapshots += 1;
      continue;
    }

    if (dryRun) {
      console.info("[backfill-heat] dry-run", {
        runId: run.id,
        runDate: run.runDate,
        tier: run.tier as TierId,
        languageRows: langs.length,
        existingHeatRows: runsWithHeat.has(run.id),
      });
      result.processed += 1;
      continue;
    }

    if (force && runsWithHeat.has(run.id)) {
      await db
        .delete(languageHeatSnapshots)
        .where(eq(languageHeatSnapshots.runId, run.id));
    }

    try {
      await collectLanguageHeatForRun({
        runId: run.id,
        runDate: run.runDate,
        tierDef,
        languages: langs.map((l) => ({ language: l.language, share: l.share })),
      });
      result.processed += 1;
      console.info("[backfill-heat] ok", {
        runId: run.id,
        runDate: run.runDate,
        tier: run.tier,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result.errors.push({ runId: run.id, message });
      console.error("[backfill-heat] failed", { runId: run.id, message });
    }
  }

  return result;
}
