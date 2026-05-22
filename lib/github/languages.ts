import { githubJsonWithRetry } from "@/lib/github/client";

/** GitHub Linguist: language -> bytes */
export type RepoLanguages = Record<string, number>;

export async function fetchRepoLanguages(
  fullName: string,
): Promise<RepoLanguages> {
  const path = `/repos/${fullName}/languages`;
  return githubJsonWithRetry<RepoLanguages>(path);
}
