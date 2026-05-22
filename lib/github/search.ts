import { SEARCH_RESULT_CAP } from "@/lib/constants";
import { githubJsonWithRetry } from "@/lib/github/client";
import { sleep } from "@/lib/github/request-pace";

type SearchItem = { full_name: string };
type SearchResponse = {
  items: SearchItem[];
  total_count: number;
  incomplete_results: boolean;
};

const PER_PAGE = 100;
const MAX_PAGES = SEARCH_RESULT_CAP / PER_PAGE;
/** Search 分页间隔（非环境变量，仅降 secondary rate limit） */
const PAGE_DELAY_MS = 4000;

export type SearchRepositoriesOptions = {
  /** 凑够条目即停止翻页（避免为 100 样本拉满 10 页 Search） */
  maxItems?: number;
};

export async function searchRepositories(
  q: string,
  opts?: SearchRepositoriesOptions,
): Promise<{ repos: SearchItem[]; totalCount: number }> {
  const cap = Math.min(
    opts?.maxItems ?? SEARCH_RESULT_CAP,
    SEARCH_RESULT_CAP,
  );
  const repos: SearchItem[] = [];
  let totalCount = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    if (page > 1) {
      await sleep(PAGE_DELAY_MS);
    }
    const params = new URLSearchParams({
      q,
      sort: "stars",
      order: "desc",
      per_page: String(PER_PAGE),
      page: String(page),
    });
    const path = `/search/repositories?${params.toString()}`;
    const data = await githubJsonWithRetry<SearchResponse>(path);
    totalCount = data.total_count;
    repos.push(...data.items);
    if (data.items.length < PER_PAGE || repos.length >= cap) {
      break;
    }
  }

  return { repos: repos.slice(0, cap), totalCount };
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
  const data = await githubJsonWithRetry<SearchResponse>(path);
  return data.total_count;
}
