/**
 * 按 `PRUNE_RETENTION_DAYS`（默认 40）删除过旧的 `collection_runs` 及关联子表，不占满磁盘。
 * 仅依赖 `DATABASE_URL`，不需要 GitHub。
 *
 * 与每日采集内置裁剪（`DATA_RETENTION_DAYS`）可并存；本脚本便于单独挂 cron / GHA。
 *
 * 用法:
 *   npx tsx scripts/prune-old-data.ts
 *   npx tsx scripts/prune-old-data.ts --dry-run
 */
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { subtractDaysFromIsoDate } from "@/lib/chart-range";
import {
  countCollectionRunsOlderThanRunDate,
  pruneCollectionRunsOlderThanRunDate,
} from "@/lib/db/prune-collection-data";
import { getPruneRetentionDays } from "@/lib/env-config";

function utcTodayString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const keepDays = getPruneRetentionDays();
  const today = utcTodayString();
  const runDateBefore = subtractDaysFromIsoDate(today, keepDays - 1);
  const dryRun = hasFlag("dry-run");

  console.info("[prune-old-data]", {
    anchorUtcDay: today,
    keepDays,
    deleteRunDateStrictlyBefore: runDateBefore,
    dryRun,
  });

  if (dryRun) {
    const n = await countCollectionRunsOlderThanRunDate(runDateBefore);
    console.info("[prune-old-data] dry-run: would delete run rows:", n);
    return;
  }

  const deleted = await pruneCollectionRunsOlderThanRunDate(runDateBefore);
  console.info("[prune-old-data] deleted collection_runs rows:", deleted);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
