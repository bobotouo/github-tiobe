import {
  bigint,
  date,
  integer,
  jsonb,
  pgSchema,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/** 与其它项目共库时，表放在独立 schema，drizzle-kit push 只应管理此 schema */
export const GITHUB_TIOBE_SCHEMA = "github_tiobe";

const gh = pgSchema(GITHUB_TIOBE_SCHEMA);

export const collectionRuns = gh.table(
  "collection_runs",
  {
    id: serial("id").primaryKey(),
    runDate: date("run_date", { mode: "string" }).notNull(),
    tier: varchar("tier", { length: 8 }).notNull(),
    pushedAfter: date("pushed_after", { mode: "string" }).notNull(),
    repoCount: integer("repo_count").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    error: text("error"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("collection_runs_run_tier_uidx").on(t.runDate, t.tier)],
);

export const languageSnapshots = gh.table("language_snapshots", {
  id: serial("id").primaryKey(),
  runId: integer("run_id")
    .references(() => collectionRuns.id, { onDelete: "cascade" })
    .notNull(),
  language: varchar("language", { length: 64 }).notNull(),
  bytes: bigint("bytes", { mode: "bigint" }).notNull(),
  share: real("share").notNull(),
});

/**
 * 与某次 `collection_runs` 关联的「大众向热度」快照：GitHub Search 在星档 + 语言 + created 窗口下的 `total_count`。
 * 与 Linguist 字节占比独立，用于趋势/排行中的「新建仓库匹配量」视图。
 */
export const languageHeatSnapshots = gh.table(
  "language_heat_snapshots",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .references(() => collectionRuns.id, { onDelete: "cascade" })
      .notNull(),
    language: varchar("language", { length: 64 }).notNull(),
    repoTotal: integer("repo_total").notNull(),
  },
  (t) => [uniqueIndex("language_heat_run_lang_uidx").on(t.runId, t.language)],
);

/** 与某次 collection_runs 关联的仓库元数据及 LLM 归纳（随 run 保留策略级联删除） */
export const repoEnrichments = gh.table(
  "repo_enrichments",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .references(() => collectionRuns.id, { onDelete: "cascade" })
      .notNull(),
    fullName: varchar("full_name", { length: 256 }).notNull(),
    description: text("description"),
    topics: jsonb("topics").$type<string[] | null>(),
    starCount: integer("star_count"),
    primaryLanguage: varchar("primary_language", { length: 64 }),
    homepage: text("homepage"),
    htmlUrl: text("html_url"),
    llmSummary: text("llm_summary"),
    llmDomains: jsonb("llm_domains").$type<string[] | null>(),
    llmRepoKind: varchar("llm_repo_kind", { length: 32 }),
    llmExtra: jsonb("llm_extra").$type<Record<string, unknown> | null>(),
    llmModel: varchar("llm_model", { length: 64 }).notNull(),
    llmPromptVersion: varchar("llm_prompt_version", { length: 16 })
      .notNull()
      .default("1"),
    enrichedAt: timestamp("enriched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("repo_enrichments_full_name_uidx").on(t.fullName)],
);
