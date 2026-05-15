import { NextResponse } from "next/server";

import { isTierId } from "@/lib/constants";
import { getDataRetentionDays } from "@/lib/env-config";
import { getSeriesForTierCached } from "@/lib/db/stats";

function utcTodayString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function subtractDaysFromIsoDate(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tierRaw = searchParams.get("tier") ?? "1k";
  if (!isTierId(tierRaw)) {
    return NextResponse.json({ error: "invalid tier" }, { status: 400 });
  }

  const today = utcTodayString();
  const defaultFrom = subtractDaysFromIsoDate(today, getDataRetentionDays() - 1);
  const from = searchParams.get("from") ?? defaultFrom;
  const to = searchParams.get("to") ?? today;

  try {
    const data = await getSeriesForTierCached(tierRaw, from, to);
    return NextResponse.json({ tier: tierRaw, from, to, ...data });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
