import type { RepoPublicMetadata } from "@/lib/github/repo-metadata";

export const REPO_ENRICH_PROMPT_VERSION = "1";

export function buildRepoEnrichMessages(
  meta: RepoPublicMetadata,
): { system: string; user: string } {
  const topics =
    meta.topics?.length > 0 ? meta.topics.join(", ") : "（无 topics）";
  const system = `你是资深开源项目分析助手。只输出一个 JSON 对象，不要 Markdown，不要代码围栏。
JSON 字段必须齐全：
- summary: 字符串，≤140 字中文，概括仓库**做什么、给谁用**。
- domains: 字符串数组，2–5 个，每个为简短中文领域标签（如「CLI 工具」「深度学习」「Web 前端」）。
- repo_kind: 字符串，从下列选一：library | application | framework | plugin | docs | sample | tooling | other
- extra: 对象，可含任意补充键值（如 risks、audience），没有则填空对象 {}`;

  const user = [
    `仓库: ${meta.full_name}`,
    `描述: ${meta.description ?? "（无描述）"}`,
    `Topics: ${topics}`,
    `主语言: ${meta.language ?? "未知"}`,
    `Stars: ${meta.stargazers_count}`,
    `主页: ${meta.homepage ?? "—"}`,
  ].join("\n");

  return { system, user };
}
