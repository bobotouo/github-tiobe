import { sleep } from "@/lib/github/request-pace";

const GITHUB_API = "https://api.github.com";

export type GitHubRequestInit = RequestInit & { path: string };

function retryWaitMs(res: Response, attempt: number): number {
  const retryAfter = res.headers.get("retry-after");
  let waitMs = Math.min(120_000, 4000 * 2 ** (attempt - 1));
  if (retryAfter) {
    const sec = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(sec)) {
      waitMs = Math.max(2000, sec * 1000);
    }
  }
  return waitMs;
}

export async function githubFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = process.env.GITHUB_TOKEN;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  return fetch(url, { ...init, headers });
}

export async function githubJson<T>(path: string): Promise<T> {
  const res = await githubFetch(path);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status} ${path}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

/** 遇 403/429（含 secondary rate limit）时指数退避重试 */
export async function githubJsonWithRetry<T>(
  path: string,
  opts?: { maxAttempts?: number },
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 8;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await githubFetch(path);
    if (res.status === 403 || res.status === 429) {
      const waitMs = retryWaitMs(res, attempt);
      console.warn(
        `[github] ${res.status} retry in ${waitMs}ms (${attempt}/${maxAttempts}) ${path.slice(0, 96)}`,
      );
      await sleep(waitMs);
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub ${res.status} ${path}: ${text.slice(0, 500)}`);
    }
    return (await res.json()) as T;
  }

  throw new Error(
    `GitHub rate limited after ${maxAttempts} retries: ${path}`,
  );
}
