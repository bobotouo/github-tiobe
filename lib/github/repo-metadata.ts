import { githubJson } from "@/lib/github/client";

export type RepoPublicMetadata = {
  full_name: string;
  description: string | null;
  topics: string[];
  language: string | null;
  stargazers_count: number;
  html_url: string;
  homepage: string | null;
};

function segmentsFromFullName(fullName: string): [string, string] {
  const s = fullName.trim();
  const i = s.indexOf("/");
  if (i <= 0 || i === s.length - 1) {
    throw new Error(`invalid full_name: ${fullName}`);
  }
  return [s.slice(0, i), s.slice(i + 1)];
}

/** `GET /repos/{owner}/{repo}` 公开字段（需 TOKEN 仅在提升限额） */
export async function fetchRepoMetadata(
  fullName: string,
): Promise<RepoPublicMetadata> {
  const [owner, repo] = segmentsFromFullName(fullName);
  const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const data = await githubJson<RepoPublicMetadata>(path);
  if (!data.topics) {
    (data as RepoPublicMetadata).topics = [];
  }
  return data;
}
