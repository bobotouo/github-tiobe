/** 拼出更可读的数据库错误（postgres.js / PG 驱动常见字段） */
export function formatDbError(error: unknown): string {
  if (error == null) {
    return "unknown error";
  }
  if (typeof error !== "object") {
    return String(error);
  }
  const e = error as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof e.message === "string") {
    parts.push(e.message);
  }
  if (typeof e.code === "string") {
    parts.push(`code=${e.code}`);
  }
  if (typeof e.detail === "string" && e.detail.length > 0) {
    parts.push(`detail=${e.detail}`);
  }
  if (typeof e.hint === "string" && e.hint.length > 0) {
    parts.push(`hint=${e.hint}`);
  }
  if (e.cause != null) {
    parts.push(`cause=${formatDbError(e.cause)}`);
  }
  return parts.length > 0 ? parts.join(" | ") : String(error);
}
