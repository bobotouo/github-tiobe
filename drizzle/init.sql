-- 与其它项目共库：表放在独立 schema，不会碰到 public 下的业务表。
-- 在 Neon / Supabase / 任意 Postgres 的 SQL 控制台整段执行即可。

CREATE SCHEMA IF NOT EXISTS github_tiobe;

CREATE TABLE IF NOT EXISTS github_tiobe.collection_runs (
  id serial PRIMARY KEY,
  run_date date NOT NULL,
  tier varchar(8) NOT NULL,
  pushed_after date NOT NULL,
  repo_count integer NOT NULL,
  status varchar(20) NOT NULL,
  error text,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS collection_runs_run_tier_uidx
  ON github_tiobe.collection_runs (run_date, tier);

CREATE INDEX IF NOT EXISTS collection_runs_tier_status_run_date_idx
  ON github_tiobe.collection_runs (tier, status, run_date);

CREATE TABLE IF NOT EXISTS github_tiobe.language_snapshots (
  id serial PRIMARY KEY,
  run_id integer NOT NULL REFERENCES github_tiobe.collection_runs (id) ON DELETE CASCADE,
  language varchar(64) NOT NULL,
  bytes bigint NOT NULL,
  share real NOT NULL
);

CREATE INDEX IF NOT EXISTS language_snapshots_run_id_idx
  ON github_tiobe.language_snapshots (run_id);

CREATE TABLE IF NOT EXISTS github_tiobe.language_heat_snapshots (
  id serial PRIMARY KEY,
  run_id integer NOT NULL REFERENCES github_tiobe.collection_runs (id) ON DELETE CASCADE,
  language varchar(64) NOT NULL,
  repo_total integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS language_heat_run_lang_uidx
  ON github_tiobe.language_heat_snapshots (run_id, language);

CREATE INDEX IF NOT EXISTS language_heat_run_id_idx
  ON github_tiobe.language_heat_snapshots (run_id);

CREATE TABLE IF NOT EXISTS github_tiobe.repo_enrichments (
  id serial PRIMARY KEY,
  run_id integer NOT NULL REFERENCES github_tiobe.collection_runs (id) ON DELETE CASCADE,
  full_name varchar(256) NOT NULL,
  description text,
  topics jsonb,
  star_count integer,
  primary_language varchar(64),
  homepage text,
  html_url text,
  llm_summary text,
  llm_domains jsonb,
  llm_repo_kind varchar(32),
  llm_extra jsonb,
  llm_model varchar(64) NOT NULL,
  llm_prompt_version varchar(16) NOT NULL DEFAULT '1',
  enriched_at timestamptz NOT NULL DEFAULT now()
);

-- 全局一仓一行：同一个 full_name 在任意 run 下只保留一条（最新 upsert 覆盖）
DROP INDEX IF EXISTS github_tiobe.repo_enrichments_run_full_name_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS repo_enrichments_full_name_uidx
  ON github_tiobe.repo_enrichments (full_name);

CREATE INDEX IF NOT EXISTS repo_enrichments_run_id_idx
  ON github_tiobe.repo_enrichments (run_id);

-- 若你曾用旧版在 public 下建过同名空表、且无数据要保留，可手动执行：
-- DROP TABLE IF EXISTS public.language_snapshots;
-- DROP TABLE IF EXISTS public.collection_runs;
