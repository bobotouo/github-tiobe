import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { existsSync } from "fs";

import { GITHUB_TIOBE_SCHEMA } from "./lib/db/schema";

config({ path: ".env" });
if (existsSync(".env.local")) {
  config({ path: ".env.local", override: true });
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  /**
   * 与其它项目共库时：只同步本 schema，不去动 public 里的表/序列。
   * （仅靠 tablesFilter 仍会试图“整理”整个 public，可能误删。）
   */
  schemaFilter: [GITHUB_TIOBE_SCHEMA],
  tablesFilter: ["collection_runs", "language_snapshots"],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
