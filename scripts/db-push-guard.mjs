#!/usr/bin/env node
/**
 * 默认拦截 `drizzle-kit push`，避免误删 `github_tiobe` schema。
 * 建表请用 drizzle/init.sql；确需 push 时用 npm run db:push:kit
 */
console.error(`
[db:push] 已拦截 drizzle-kit push。

推荐：在数据库 SQL 控制台执行 drizzle/init.sql（schema: github_tiobe）。

若已备份且明确要对比/推送 schema，请在本机交互终端运行：
  npm run db:push:kit

切勿在 push 提示中确认删除整个 github_tiobe schema。
`);
process.exit(1);
