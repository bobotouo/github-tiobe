import { GITHUB_TIOBE_SCHEMA } from "@/lib/db/schema";
import { requirePg } from "@/lib/db/index";

function qualified(
  table:
    | "collection_runs"
    | "language_snapshots"
    | "language_heat_snapshots"
    | "repo_enrichments",
): string {
  return `${GITHUB_TIOBE_SCHEMA}.${table}`;
}

async function deleteSnapshotsAndRunsForIds(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const sql = requirePg();
  await sql`
    delete from ${sql.unsafe(qualified("language_heat_snapshots"))}
    where run_id in ${sql(ids)}
  `;
  await sql`
    delete from ${sql.unsafe(qualified("language_snapshots"))}
    where run_id in ${sql(ids)}
  `;
  await sql`
    delete from ${sql.unsafe(qualified("repo_enrichments"))}
    where run_id in ${sql(ids)}
  `;
  await sql`
    delete from ${sql.unsafe(qualified("collection_runs"))}
    where id in ${sql(ids)}
  `;
}

/** 删除指定 UTC 日 + 档位的 run 及其子表（与采集前「重采当日」一致） */
export async function deleteCollectionRunsForDayTier(
  runDate: string,
  tier: string,
): Promise<number> {
  const sql = requirePg();
  const rows = await sql<{ id: number }[]>`
    select id from ${sql.unsafe(qualified("collection_runs"))}
    where run_date = ${runDate} and tier = ${tier}
  `;
  const ids = rows.map((r) => r.id);
  await deleteSnapshotsAndRunsForIds(ids);
  return ids.length;
}

/** 删除 `run_date < runDateBefore` 的全部 run 及子表（与采集成功后的保留期裁剪一致） */
export async function pruneCollectionRunsOlderThanRunDate(
  runDateBefore: string,
): Promise<number> {
  const sql = requirePg();
  const rows = await sql<{ id: number }[]>`
    select id from ${sql.unsafe(qualified("collection_runs"))}
    where run_date < ${runDateBefore}
  `;
  const ids = rows.map((r) => r.id);
  await deleteSnapshotsAndRunsForIds(ids);
  return ids.length;
}

/** 统计将受 `pruneCollectionRunsOlderThanRunDate` 影响的 run 行数（用于 dry-run） */
export async function countCollectionRunsOlderThanRunDate(
  runDateBefore: string,
): Promise<number> {
  const sql = requirePg();
  const rows = await sql<{ n: string }[]>`
    select count(*)::text as n
    from ${sql.unsafe(qualified("collection_runs"))}
    where run_date < ${runDateBefore}
  `;
  const raw = rows[0]?.n ?? "0";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}
