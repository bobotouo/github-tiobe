"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type { TierId } from "@/lib/constants";
import type { LineChartValueMode } from "@/lib/chart/buildSeries";
import { buildDashboardHref } from "@/lib/dashboard-url";

type LangNavValue = {
  lang: string | null;
  setLang: (next: string | null) => void;
};

const LangNavContext = createContext<LangNavValue | null>(null);

type ProviderProps = {
  initialLang: string | null;
  tier: TierId;
  from: string;
  to: string;
  metric: LineChartValueMode;
  children: React.ReactNode;
};

export function LangNavProvider({
  initialLang,
  tier,
  from,
  to,
  metric,
  children,
}: ProviderProps) {
  const [lang, setLangState] = useState<string | null>(initialLang);

  const setLang = useCallback(
    (next: string | null) => {
      setLangState(next);
      const href = buildDashboardHref({
        tier,
        from,
        to,
        lang: next ?? undefined,
        metric,
      });
      window.history.replaceState(window.history.state, "", href);
    },
    [tier, from, to, metric],
  );

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);

  return (
    <LangNavContext.Provider value={value}>{children}</LangNavContext.Provider>
  );
}

export function useLangNav(): LangNavValue {
  const ctx = useContext(LangNavContext);
  if (!ctx) {
    throw new Error("useLangNav must be used within LangNavProvider");
  }
  return ctx;
}
