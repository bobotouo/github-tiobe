# GitHub 语言指数

基于 **GitHub REST `/repos/{owner}/{repo}/languages`**（与 Linguist 一致的字节统计）汇总「近期有 push」的公开仓样本。Stars 分为**不重叠区间**：1k–2k、2k–3k、3k–5k、5k–10k、≥10k，每档单独采样本并统计语言占比。采集成功后会**裁剪数据库**：保留天数由环境变量 **`DATA_RETENTION_DAYS`**（默认 `30`）控制。首页趋势**可选日期跨度**不超过该保留天数；**近 7 / 30 日**为 UI 快捷预设。**每日排行**为保留期内最近一次成功快照。部署在 **Vercel**，数据库可使用 **Neon / Supabase** 等免费 Postgres。

## 环境变量

复制 [.env.example](.env.example) 为 `.env.local` 并填写：

- `DATABASE_URL`：Postgres 连接串  
- `GITHUB_TOKEN`：可读取公开库的 PAT（提高速率上限）  

可选（详见 [.env.example](.env.example)）：

- **`CRON_SECRET`**：仅当你仍用 **Vercel Cron** 或生产环境要 **`curl /api/cron/collect`** 时设置；本地脚本 `npm run collect:daily` 与 **GitHub Actions** 采集**不需要**该变量。

其余可调项：

- **数据**：`DATA_RETENTION_DAYS`（默认 `30`，兼容 `DB_RETENTION_DAYS`）——快照保留与趋势图最大跨度  
- **样本量**：`COLLECT_MAX_REPOS` 或 `SAMPLE_MAX_REPOS`（默认 `800`，最大 `1000`）——每档采集仓数；**LLM 归纳**默认每档 **20** 个（`ENRICH_MAX_REPOS`，与采集样本量无关，最大 `500`）  
- **搜索窗口**：`PUSHED_WITHIN_DAYS`（默认 `30`）  
- **并发**：`COLLECT_CONCURRENCY`（默认 `12`）  
- **LLM**：`LLM_API_KEY`（或 `OPENAI_API_KEY`）、`LLM_BASE_URL`（或 `OPENAI_BASE_URL`）、`LLM_MODE`（`json` / `raw`）、`LLM_MODEL` 等  

## 数据库

本项目的表在 **独立 schema `github_tiobe`**（见 [lib/db/schema.ts](lib/db/schema.ts)），与 **`public` 里其它项目的表隔离**。

### 推荐（有数据 / 共库）：只用 SQL

把 **[drizzle/init.sql](drizzle/init.sql)** 整段在数据库 SQL Editor 里执行（`CREATE SCHEMA IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS`，**不碰** `public`）。应用读写不依赖 `drizzle-kit push`。

### 不要用 `npm run db:push`（已默认拦截）

Drizzle `push` 有时会提示 **删除整个 `github_tiobe` schema**（数据会没）。若看到这个提示，**必须选 No**。因此默认命令 `npm run db:push` 只会打印说明并退出；**不要**在不懂 diff 的情况下盲目确认 push。

确有需要、已备份、且你在本机交互终端里操作时，可**手动**执行：

```bash
npm run db:push:kit
```

**注意：** `.env.local` 里 `DATABASE_URL` 要与控制台选中的库一致。若仍见 `42P01`，先执行 `init.sql`。若曾只在 `public` 建过旧表，请改用 `github_tiobe`（执行当前 `init.sql`）；无用旧表可按 `init.sql` 末尾注释自行 `DROP`。

## 本地开发

```bash
npm install
npm run dev
```

## 采集（推荐：本地脚本 / GitHub Actions）

**本地试跑**（直接写数据库，无需启动 Next、无需 `CRON_SECRET`）：

```bash
# 与生产相同逻辑（整次可能十几分钟，视 COLLECT_MAX_REPOS 而定）
npm run collect:daily

# 试通：每档只采 40 个仓
npm run collect:daily -- --quick

# 自定每档上限（≤1000）
npm run collect:daily -- --max-repos=50
```

生产环境定时采集可使用 **[.github/workflows/collect-daily.yml](.github/workflows/collect-daily.yml)**：在仓库 **Secrets** 配置 `DATABASE_URL`、**`GH_PAT`**（你的 PAT；GitHub 不允许自定义 Secret 名以 `GITHUB_` 开头，workflow 会把它当作 `GITHUB_TOKEN` 传给脚本），按需加 **Variables**（如 `COLLECT_MAX_REPOS`、`DATA_RETENTION_DAYS`）。

**备选：HTTP 触发**（需配置 `CRON_SECRET`，且生产 `NODE_ENV` 下会校验 `Authorization: Bearer …`）：

```bash
curl -sS -X POST "$BASE_URL/api/cron/collect" \
  -H "Authorization: Bearer $CRON_SECRET"
```

开发中也可用 `GET http://localhost:3000/api/cron/collect?quick=1`（未设 `CRON_SECRET` 时仅 **development** 免鉴权）。

## LLM 仓库归纳（扩展数据）

采集结果里**只聚合了语言字节占比**，没有逐仓落库。若你需要「这些样本仓大致做什么、属于哪些领域」，可增加表 **`github_tiobe.repo_enrichments`**（见 [drizzle/init.sql](drizzle/init.sql)），并用脚本按**某日 + 某档**的 `collection_runs` 关联写入：先 **`GET /repos`** 拉公开元数据，再调用 **OpenAI 兼容** Chat Completions 产出 `summary` / `domains` / `repo_kind` 等（可扩展 `llm_extra` JSON）。

**注意：** 归纳脚本会**按与采集相同的 Search 条件重新搜一轮**，再截断 `min(limit, run.repo_count)` 个仓；与当日采集瞬间的样本顺序可能因 GitHub 排序略有差异。若以后要 **100% 与某次 run 一致**，需要在采集流程里把 `full_name` 列表一并写入数据库（可再开 issue/迭代）。

1. 在数据库执行 `init.sql` 中 `repo_enrichments` 段（若库是旧的，只补这段 `CREATE TABLE` + 索引即可）。  
2. 配置 `.env.example` 中 `LLM_API_KEY`（或 `OPENAI_API_KEY`）、`LLM_BASE_URL`、`LLM_MODE`、`LLM_MODEL` 等。  
3. 本机执行：

```bash
npm run enrich:repos
# 或指定日期、档位、数量、仅元数据、强制重跑 LLM：
npx tsx scripts/enrich-repos-llm.ts --date=2026-05-07 --tier=1k --limit=40
npx tsx scripts/enrich-repos-llm.ts --skip-llm
npx tsx scripts/enrich-repos-llm.ts --force
```

GitHub Actions 示例：[.github/workflows/repo-enrich.yml](.github/workflows/repo-enrich.yml)。可与 **采集** workflow 错开时间运行。

## Vercel（仅部署站点）

1. 在 Vercel 配置 **`DATABASE_URL`**（与 GHA 采集写入的 Postgres 一致），供首页/接口读库。采集若在 **GitHub Actions** 完成，Vercel 上**通常不需要** `GITHUB_TOKEN`、**不需要** `CRON_SECRET`。  
2. 本仓库默认**不含** `vercel.json` 定时任务；每日入库请用 [.github/workflows/collect-daily.yml](.github/workflows/collect-daily.yml)。若仍要用 **Vercel Cron**，可自行添加 `vercel.json` 并设置 `CRON_SECRET`。  
3. `/api/cron/collect` 仍可用（HTTP 备选）；`maxDuration = 300`；免费层超时请降低 `COLLECT_MAX_REPOS` 或改用 GHA 更长超时。

## 说明

- 每个 GitHub Search 查询最多约 **1000** 条仓库；本项目默认每档采集 **800** 条以预留搜索与其它请求的速率余量。  
- 统计为 **样本内字节占比**，不等价于全站语言分布。  
- 查询参数：`tier`、`from` / `to`（趋势**起止日**，含当天；跨度不超过环境变量 **DATA_RETENTION_DAYS**）、`lang`（仅趋势图聚焦某一语言）。

---

This is a [Next.js](https://nextjs.org) project. See `package.json` scripts for `db:studio` 等命令。
