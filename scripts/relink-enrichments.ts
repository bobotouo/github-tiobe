/**
 * 将已有 LLM 摘要的 repo_enrichments 挂到指定采集日的 success run（无需 GitHub Search / LLM）。
 *
 *   npx tsx scripts/relink-enrichments.ts --date=2026-05-17
 *   npx tsx scripts/relink-enrichments.ts --date=2026-05-17 --tier=1k
 */
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { isTierId, type TierId } from "@/lib/constants";
import { relinkEnrichmentsForRunDate } from "@/lib/enrich/relink-enrichments";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function arg(name: string): string | undefined {
  const key = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(key));
  return hit?.slice(key.length);
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

  const summary = await relinkEnrichmentsForRunDate(runDate, tier);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
