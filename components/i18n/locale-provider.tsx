"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import type { Dictionary } from "@/lib/i18n/dictionaries";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/types";

type Value = {
  locale: Locale;
  dict: Dictionary;
};

const LocaleContext = createContext<Value | null>(null);

type Props = {
  locale: Locale;
  children: ReactNode;
};

export function LocaleProvider({ locale, children }: Props) {
  const dict = useMemo(() => getDictionary(locale), [locale]);
  const value = useMemo(() => ({ locale, dict }), [locale, dict]);
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useI18n(): Value {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useI18n must be used within LocaleProvider");
  }
  return ctx;
}
