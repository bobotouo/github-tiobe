import { NextResponse } from "next/server";

import { runDailyCollection } from "@/lib/collect/run-collection";
import { SEARCH_RESULT_CAP } from "@/lib/constants";
import { formatDbError } from "@/lib/db/format-error";

export const maxDuration = 300;

function authorizeWithRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV === "development";
  }
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** 仅 development：缩短单次采集，便于本地验证（生产忽略） */
function devCollectOptionsFromUrl(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return undefined;
  }
  const url = new URL(request.url);
  if (url.searchParams.get("quick") === "1") {
    return { maxReposOverride: 40 };
  }
  const raw = url.searchParams.get("maxRepos");
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) {
      return { maxReposOverride: Math.min(n, SEARCH_RESULT_CAP) };
    }
  }
  return undefined;
}

async function handleCollect(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured" },
      { status: 500 },
    );
  }
  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN is not configured" },
      { status: 500 },
    );
  }
  try {
    const devOpts = devCollectOptionsFromUrl(request);
    const summary = await runDailyCollection(new Date(), devOpts);
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!authorizeWithRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleCollect(request);
}

export async function POST(request: Request) {
  if (!authorizeWithRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleCollect(request);
}
