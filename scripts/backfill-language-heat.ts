/**
 * 为历史 `collection_runs` 仅补写 `language_heat_snapshots`，不重采 Linguist、不删已有占比。
 *
 * 前置：Postgres 已有 `language_heat_snapshots` 表；`.env.local` 中 `DATABASE_URL`、`GITHUB_TOKEN`，
 * 且 `COLLECT_HEAT=1`（与日常采集开关一致）。
 *
 * 用法:
 *   npx tsx scripts/backfill-language-heat.ts --dry-run
 *   npx tsx scripts/backfill-language-heat.ts
 *   npx tsx scripts/backfill-language-heat.ts --limit=3
 *   npx tsx scripts/backfill-language-heat.ts --force
 */
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { backfillLanguageHeatSnapshots } from "@/lib/collect/backfill-language-heat";

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argInt(name: string): number | undefined {
  const key = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(key));
  if (!hit) return undefined;
  const n = Number.parseInt(hit.slice(key.length), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  if (!process.env.GITHUB_TOKEN?.trim()) {
    console.error("GITHUB_TOKEN is not set.");
    process.exit(1);
  }

  const dryRun = hasFlag("dry-run");
  const force = hasFlag("force");
  const limit = argInt("limit");

  const out = await backfillLanguageHeatSnapshots({ dryRun, force, limit });
  console.log(JSON.stringify(out, null, 2));

  process.exit(out.errors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
