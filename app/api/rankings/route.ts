import { NextResponse } from "next/server";

import { isTierId } from "@/lib/constants";
import { loadFullRankingForTier } from "@/lib/load-full-ranking";

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "未配置 DATABASE_URL" }, { status: 503 });
  }

  const tierRaw = new URL(request.url).searchParams.get("tier") ?? "1k";
  if (!isTierId(tierRaw)) {
    return NextResponse.json({ error: "invalid tier" }, { status: 400 });
  }

  try {
    const { rows, snapshotDate, repoCount } = await loadFullRankingForTier(tierRaw);
    return NextResponse.json({
      rows,
      snapshotDate,
      repoCount,
      totalLanguageCount: rows.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
