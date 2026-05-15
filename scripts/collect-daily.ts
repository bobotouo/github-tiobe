/**
 * 本地 / CI 直连运行每日采集（写入 Postgres），不经过 HTTP，也无需 CRON_SECRET。
 *
 * 环境变量：与站内一致，从 `.env.local`（优先）再 `.env` 加载；也可用已导出的环境变量。
 *
 * 用法:
 *   npx tsx scripts/collect-daily.ts
 *   npx tsx scripts/collect-daily.ts --quick
 *   npx tsx scripts/collect-daily.ts --max-repos=50
 *   npx tsx scripts/collect-daily.ts --date=2026-05-01
 */
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import type { RunCollectOptions } from "@/lib/collect/run-collection";
import { runDailyCollection } from "@/lib/collect/run-collection";
import { SEARCH_RESULT_CAP } from "@/lib/constants";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function arg(name: string): string | undefined {
  const key = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(key));
  return hit?.slice(key.length);
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

  let opts: RunCollectOptions | undefined;
  if (process.argv.includes("--quick")) {
    opts = { maxReposOverride: 40 };
  }
  const mr = arg("max-repos");
  if (mr) {
    const n = Number.parseInt(mr, 10);
    if (Number.isFinite(n) && n > 0) {
      opts = {
        ...(opts ?? {}),
        maxReposOverride: Math.min(n, SEARCH_RESULT_CAP),
      };
    }
  }

  const date = arg("date");
  if (date) {
    const d = date.trim();
    if (!ISO_DAY.test(d)) {
      console.error("Invalid --date=YYYY-MM-DD");
      process.exit(1);
    }
    opts = { ...(opts ?? {}), runDate: d };
  }

  const summary = await runDailyCollection(new Date(), opts);
  console.log(JSON.stringify(summary, null, 2));

  const allOk = summary.tiers.every((t) => t.ok);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
