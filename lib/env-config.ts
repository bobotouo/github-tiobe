/** 运行时环境配置（集中一处；未设环境变量时用下列默认值，与 .env.example 对齐） */

export function parseEnvInt(
  name: string,
  fallback: number,
  opts?: { min?: number; max?: number },
): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  let v = n;
  if (opts?.min != null) v = Math.max(opts.min, v);
  if (opts?.max != null) v = Math.min(opts.max, v);
  return v;
}

/**
 * 数据库中快照保留天数（自然日跨度）。也用于首页/图表可选区间上限。
 * `DATA_RETENTION_DAYS` 优先，兼容旧名 `DB_RETENTION_DAYS`。默认 30，范围 1–366。
 */
export function getDataRetentionDays(): number {
  const raw =
    process.env.DATA_RETENTION_DAYS ?? process.env.DB_RETENTION_DAYS ?? "";
  if (!raw) return 30;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 30;
  return Math.min(366, Math.max(1, n));
}

/**
 * 独立清理脚本 `npm run prune:old-data` 在库中保留的「自然日」跨度（含锚定日当天）。
 * 与 `DATA_RETENTION_DAYS`（每日采集成功后的内置裁剪）可分开配置。默认 40，范围 7–366。
 */
export function getPruneRetentionDays(): number {
  return parseEnvInt("PRUNE_RETENTION_DAYS", 40, { min: 7, max: 366 });
}

/**
 * 采集：每档参与统计的仓库上限。`COLLECT_MAX_REPOS` 优先，否则 `SAMPLE_MAX_REPOS`，默认 100，最大 1000。
 */
export function getCollectMaxReposCap(): number {
  const explicit = process.env.COLLECT_MAX_REPOS;
  const sample = process.env.SAMPLE_MAX_REPOS;
  const raw = explicit ?? sample;
  if (!raw) return 100;
  const name = explicit != null ? "COLLECT_MAX_REPOS" : "SAMPLE_MAX_REPOS";
  return parseEnvInt(name, 100, { min: 1, max: 1000 });
}

/** Search：`pushed:>DATE`，相对 run_date 向前推 N 天。默认 30。 */
export function getPushedWithinDays(): number {
  return parseEnvInt("PUSHED_WITHIN_DAYS", 30, { min: 1, max: 365 });
}

/** 并发拉取 `/languages`。默认 12。 */
export function getCollectConcurrency(): number {
  return parseEnvInt("COLLECT_CONCURRENCY", 12, { min: 1, max: 64 });
}

/** LLM 归纳每档默认处理数（与采集样本量解耦）。默认 20，最大 500。 */
export function getEnrichMaxReposDefault(): number {
  return parseEnvInt("ENRICH_MAX_REPOS", 20, { min: 1, max: 500 });
}

/**
 * 是否在每日采集后写入「新建仓库」Search 热度（需库表 `language_heat_snapshots`）。
 * 默认开启；设 `COLLECT_HEAT=0` / `false` 关闭。
 */
export function getCollectHeatEnabled(): boolean {
  const v = (process.env.COLLECT_HEAT ?? "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  if (v === "1" || v === "true" || v === "yes") return true;
  return true;
}

/** 每档参与热度 Search 的语言数上限（按 Linguist 占比排序取 Top）。默认 15。 */
export function getCollectHeatTopLangs(): number {
  return parseEnvInt("COLLECT_HEAT_TOP_LANGS", 15, { min: 5, max: 50 });
}

/** 热度查询：`created:>= run_date - N`（UTC 日）。默认 14。 */
export function getCollectHeatLookbackDays(): number {
  return parseEnvInt("COLLECT_HEAT_LOOKBACK_DAYS", 14, { min: 1, max: 90 });
}

/** 两次热度 Search 之间的间隔（毫秒）。默认 2000。 */
export function getCollectHeatSearchDelayMs(): number {
  return parseEnvInt("COLLECT_HEAT_SEARCH_DELAY_MS", 2000, {
    min: 0,
    max: 120_000,
  });
}

/** OpenAI 兼容：密钥。`LLM_API_KEY` 优先，其次 `OPENAI_API_KEY`。 */
export function getLlmApiKey(): string | undefined {
  const k = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  return k && k.trim() !== "" ? k.trim() : undefined;
}

/** OpenAI 兼容：Base URL，无尾斜杠。 */
export function getLlmBaseUrl(): string {
  const u =
    process.env.LLM_BASE_URL ??
    process.env.OPENAI_BASE_URL ??
    "https://token-plan-cn.xiaomimimo.com/v1";
  return u.replace(/\/$/, "");
}

/** Chat Completions 模型名。默认 mimo-v2.5。 */
export function getLlmModel(): string {
  const m = process.env.LLM_MODEL?.trim();
  return m && m.length > 0 ? m : "mimo-v2.5";
}

/** 单次 LLM 请求超时（毫秒）。默认 600000。 */
export function getLlmTimeoutMs(): number {
  return parseEnvInt("LLM_TIMEOUT_MS", 600_000, { min: 5000, max: 600_000 });
}

/** 相邻两次 LLM 请求最小间隔（毫秒）。默认 500。 */
export function getLlmMinRequestIntervalMs(): number {
  return parseEnvInt("LLM_MIN_REQUEST_INTERVAL_MS", 500, {
    min: 0,
    max: 120_000,
  });
}

/** LLM 失败重试次数（不含首次）。默认 2。 */
export function getLlmRetryMax(): number {
  return parseEnvInt("LLM_RETRY_MAX", 2, { min: 0, max: 8 });
}

/** 收到 429 时退避基数（毫秒）。默认 5000。 */
export function getLlm429BackoffBaseMs(): number {
  return parseEnvInt("LLM_429_BACKOFF_BASE_MS", 5000, {
    min: 1000,
    max: 600_000,
  });
}

/** 收到 429 时退避上限（毫秒）。默认 80000。 */
export function getLlm429BackoffMaxMs(): number {
  return parseEnvInt("LLM_429_BACKOFF_MAX_MS", 80_000, {
    min: 10_000,
    max: 600_000,
  });
}

/** enrich：并发拉 GitHub 元数据。默认 5。 */
export function getEnrichGithubConcurrency(): number {
  return parseEnvInt("ENRICH_GITHUB_CONCURRENCY", 5, { min: 1, max: 32 });
}

/** enrich：并发 LLM 请求。默认 1。 */
export function getEnrichLlmConcurrency(): number {
  return parseEnvInt("ENRICH_LLM_CONCURRENCY", 1, { min: 1, max: 16 });
}

/**
 * 是否在请求体里使用 `response_format: { type: "json_object" }`。
 * `LLM_MODE=json` 强制开启；`LLM_MODE=raw|text` 强制关闭；未设时沿用 `LLM_JSON_OBJECT_FORMAT`（默认开）。
 */
export function getLlmJsonObjectResponseFormat(): boolean {
  const mode = (process.env.LLM_MODE ?? "").trim().toLowerCase();
  if (mode === "json" || mode === "json_object") return true;
  if (mode === "raw" || mode === "text") return false;
  const legacy = process.env.LLM_JSON_OBJECT_FORMAT;
  if (legacy === "0" || legacy === "false") return false;
  return true;
}
