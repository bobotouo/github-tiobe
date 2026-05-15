import type { RepoLanguages } from "@/lib/github/languages";

export function mergeLanguageBytes(
  languagesList: RepoLanguages[],
): Map<string, bigint> {
  const acc = new Map<string, bigint>();
  for (const langs of languagesList) {
    for (const [lang, bytes] of Object.entries(langs)) {
      acc.set(lang, (acc.get(lang) ?? BigInt(0)) + BigInt(bytes));
    }
  }
  return acc;
}

export function sharesFromBytes(totalByLang: Map<string, bigint>): {
  totalBytes: bigint;
  shares: Map<string, number>;
} {
  let total = BigInt(0);
  for (const v of totalByLang.values()) {
    total += v;
  }
  const shares = new Map<string, number>();
  if (total === BigInt(0)) {
    return { totalBytes: BigInt(0), shares };
  }
  const totalNum = Number(total);
  for (const [lang, bytes] of totalByLang) {
    shares.set(lang, Number(bytes) / totalNum);
  }
  return { totalBytes: total, shares };
}
