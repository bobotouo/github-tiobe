import { cookies } from "next/headers";

import type { Locale } from "./types";
import { LOCALE_COOKIE } from "./types";

export async function getServerLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return v === "en" ? "en" : "zh";
}
