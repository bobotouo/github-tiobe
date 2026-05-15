/**
 * 按日期从已采集成功的 run 拉样本仓元数据，可选经 LLM 归纳用途后写入 github_tiobe.repo_enrichments。
 *
 * 环境变量：与站内一致，从 `.env.local`（优先）再 `.env` 加载；也可用已导出的环境变量。
 *
 * 用法:
 *   npx tsx scripts/enrich-repos-llm.ts
 *   npx tsx scripts/enrich-repos-llm.ts --date=2026-05-07 --tier=1k --limit=40
 *   npx tsx scripts/enrich-repos-llm.ts --skip-llm
 *   npx tsx scripts/enrich-repos-llm.ts --force
 */
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { isTierId, type TierId } from "@/lib/constants";
import { runRepoEnrichment } from "@/lib/enrich/run-repo-enrichment";
import { getEnrichMaxReposDefault } from "@/lib/env-config";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function arg(name: string): string | undefined {
  const key = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(key));
  return hit?.slice(key.length);
}

function parseLimit(): number {
  const fromArg = arg("limit");
  if (fromArg != null) {
    const n = Number.parseInt(fromArg, 10);
    if (!Number.isFinite(n) || n < 1) return getEnrichMaxReposDefault();
    return Math.min(n, 500);
  }
  return getEnrichMaxReposDefault();
}

async function main() {
  const runDate = (arg("date") ?? new Date().toISOString().slice(0, 10)).trim();
  if (!ISO_DAY.test(runDate)) {
    console.error("Invalid --date=YYYY-MM-DD");
    process.exit(1);
  }
  const tierRaw = arg("tier");
  const tier: TierId | undefined =
    tierRaw && isTierId(tierRaw) ? tierRaw : undefined;
  if (tierRaw && !tier) {
    console.error("unknown --tier:", tierRaw);
    process.exit(1);
  }

  const summary = await runRepoEnrichment({
    runDate,
    tier,
    maxReposPerTier: parseLimit(),
    force: process.argv.includes("--force"),
    skipLlm: process.argv.includes("--skip-llm"),
  });

  console.log(JSON.stringify(summary, null, 2));
  const hasError = summary.tiers.some((t) => t.error || t.failed > 0);
  process.exit(hasError ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
