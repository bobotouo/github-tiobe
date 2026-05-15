/**
 * 按 UTC 日历日逐日调用 `runDailyCollection`，补全缺失采集（含当日各档 + 可选热度）。
 *
 * 与单次 `collect-daily --date=某天` 相同：每天都会删掉该日各档旧 run 后重采。
 *
 * 用法:
 *   npx tsx scripts/collect-missing-range.ts --auto
 *   npx tsx scripts/collect-missing-range.ts --from=2026-05-08 --to=2026-05-14
 *   npx tsx scripts/collect-missing-range.ts --auto --dry-run
 *
 * `--auto`：从「各档成功 run 的 max(run_date) 里取最小值」的次日补到今天（各档对齐）。
 * 可再写 `--from=` 覆盖自动算出的起始日（仍不得大于 `--to`）。
 */
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import type { RunCollectOptions } from "@/lib/collect/run-collection";
import { runDailyCollection } from "@/lib/collect/run-collection";
import {
  iterateUtcIsoDaysInclusive,
  suggestedGapFillStartDate,
} from "@/lib/collect/gap-fill-dates";
import { SEARCH_RESULT_CAP } from "@/lib/constants";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function arg(name: string): string | undefined {
  const key = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(key));
  return hit?.slice(key.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function utcTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
  const auto = hasFlag("auto");
  const dayDelayMs = Math.max(
    0,
    Number.parseInt(arg("day-delay-ms") ?? "3000", 10) || 0,
  );

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

  const toRaw = arg("to")?.trim();
  const to = toRaw && ISO_DAY.test(toRaw) ? toRaw : utcTodayString();
  if (toRaw && !ISO_DAY.test(toRaw)) {
    console.error("Invalid --to=YYYY-MM-DD");
    process.exit(1);
  }

  let fromStr = arg("from")?.trim();
  if (auto) {
    const suggested = await suggestedGapFillStartDate();
    if (!suggested) {
      console.error(
        "[collect-missing-range] --auto: 无法推断起始日（可能某档尚无成功 run）。请显式传入 --from=YYYY-MM-DD",
      );
      process.exit(1);
    }
    console.info("[collect-missing-range] --auto suggested from:", suggested);
    if (!fromStr) fromStr = suggested;
    else if (fromStr < suggested) {
      console.warn(
        "[collect-missing-range] --from 早于自动对齐日，已改为从对齐日起:",
        suggested,
      );
      fromStr = suggested;
    }
  }

  if (!fromStr || !ISO_DAY.test(fromStr)) {
    console.error(
      "请指定 --from=YYYY-MM-DD，或使用 --auto（可配合 --to，默认今天）",
    );
    process.exit(1);
  }

  if (fromStr > to) {
    console.error("[collect-missing-range] from 不得大于 to");
    process.exit(1);
  }

  const days = iterateUtcIsoDaysInclusive(fromStr, to);
  console.info("[collect-missing-range]", {
    from: fromStr,
    to,
    dayCount: days.length,
    dryRun,
    dayDelayMs,
  });

  let failed = 0;
  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    if (i > 0 && dayDelayMs > 0) await sleep(dayDelayMs);

    if (dryRun) {
      console.info("[collect-missing-range] dry-run would collect:", day);
      continue;
    }

    console.info("[collect-missing-range] collecting", day, `(${i + 1}/${days.length})`);
    const summary = await runDailyCollection(new Date(), {
      ...opts,
      runDate: day,
    });
    console.log(JSON.stringify(summary, null, 2));
    const allOk = summary.tiers.every((t) => t.ok);
    if (!allOk) failed += 1;
  }

  process.exit(dryRun ? 0 : failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
