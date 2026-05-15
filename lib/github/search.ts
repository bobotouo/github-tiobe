import { SEARCH_RESULT_CAP } from "@/lib/constants";
import { githubFetch, githubJson } from "@/lib/github/client";

type SearchItem = { full_name: string };
type SearchResponse = {
  items: SearchItem[];
  total_count: number;
  incomplete_results: boolean;
};

const PER_PAGE = 100;
const MAX_PAGES = SEARCH_RESULT_CAP / PER_PAGE;
const PAGE_DELAY_MS = 1500;

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function searchRepositories(
  q: string,
): Promise<{ repos: SearchItem[]; totalCount: number }> {
  const repos: SearchItem[] = [];
  let totalCount = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    if (page > 1) {
      await delay(PAGE_DELAY_MS);
    }
    const params = new URLSearchParams({
      q,
      sort: "stars",
      order: "desc",
      per_page: String(PER_PAGE),
      page: String(page),
    });
    const data = await githubJson<SearchResponse>(
      `/search/repositories?${params.toString()}`,
    );
    totalCount = data.total_count;
    repos.push(...data.items);
    if (data.items.length < PER_PAGE) {
      break;
    }
  }

  return { repos, totalCount };
}

/** 仅取 `total_count`（单页、小 payload），用于热度等不需要拉全量 items 的场景 */
export async function searchRepositoriesTotalCount(q: string): Promise<number> {
  const params = new URLSearchParams({
    q,
    sort: "stars",
    order: "desc",
    per_page: "1",
    page: "1",
  });
  const path = `/search/repositories?${params.toString()}`;
  const maxAttempts = 8;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await githubFetch(path);
    if (res.status === 403 || res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      let waitMs = Math.min(120_000, 3000 * 2 ** (attempt - 1));
      if (retryAfter) {
        const sec = Number.parseInt(retryAfter, 10);
        if (Number.isFinite(sec)) {
          waitMs = Math.max(1000, sec * 1000);
        }
      }
      console.warn(
        `[github search] ${res.status} total_count, sleeping ${waitMs}ms (attempt ${attempt}/${maxAttempts})`,
      );
      await delay(waitMs);
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub ${res.status} ${path}: ${text.slice(0, 500)}`);
    }
    const data = (await res.json()) as SearchResponse;
    return data.total_count;
  }

  throw new Error(
    `GitHub search rate limited after ${maxAttempts} retries: ${path}`,
  );
}
