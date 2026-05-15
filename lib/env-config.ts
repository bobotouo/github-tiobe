/** 运行时环境配置（集中一处，便于文档与部署对齐） */

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
 * 采集：每档参与统计的仓库上限。`COLLECT_MAX_REPOS` 优先，否则 `SAMPLE_MAX_REPOS`，默认 800，最大 1000。
 */
export function getCollectMaxReposCap(): number {
  const explicit = process.env.COLLECT_MAX_REPOS;
  const sample = process.env.SAMPLE_MAX_REPOS;
  const raw = explicit ?? sample;
  if (!raw) return 800;
  const name = explicit != null ? "COLLECT_MAX_REPOS" : "SAMPLE_MAX_REPOS";
  return parseEnvInt(name, 800, { min: 1, max: 1000 });
}

/** LLM 归纳每档默认处理数（与采集样本量解耦，节省 token / 耗时）。 */
const ENRICH_MAX_REPOS_DEFAULT = 20;

/**
 * LLM 归纳脚本每档处理上限：`ENRICH_MAX_REPOS` 可覆盖，默认 20，最大 500。
 */
export function getEnrichMaxReposDefault(): number {
  return parseEnvInt("ENRICH_MAX_REPOS", ENRICH_MAX_REPOS_DEFAULT, {
    min: 1,
    max: 500,
  });
}

/** 是否在每日采集后写入「新建仓库」Search 热度（需库表 `language_heat_snapshots`）。默认关，设 `COLLECT_HEAT=1` 开启。 */
export function getCollectHeatEnabled(): boolean {
  const v = (process.env.COLLECT_HEAT ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** 每档参与热度 Search 的语言数上限（按 Linguist 占比排序取 Top）。 */
export function getCollectHeatTopLangs(): number {
  return parseEnvInt("COLLECT_HEAT_TOP_LANGS", 15, { min: 5, max: 50 });
}

/** 热度查询：`created:>= run_date - N`（UTC 日）。 */
export function getCollectHeatLookbackDays(): number {
  return parseEnvInt("COLLECT_HEAT_LOOKBACK_DAYS", 14, { min: 1, max: 90 });
}

/**
 * 两次热度 Search 之间的间隔（毫秒）。
 * GitHub Search 对认证用户约 **30 次/分钟** 量级次级限流，默认 **2200ms**（略低于 30/min）以降低 403。
 */
export function getCollectHeatSearchDelayMs(): number {
  return parseEnvInt("COLLECT_HEAT_SEARCH_DELAY_MS", 2200, {
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
    "https://api.openai.com/v1";
  return u.replace(/\/$/, "");
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
