const GITHUB_API = "https://api.github.com";

export type GitHubRequestInit = RequestInit & { path: string };

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
