"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/locale-provider";
import { Toggle } from "@/components/ui/toggle";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

function setLocaleCookie(next: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
}

/** 胶囊内单格：等宽、扁平，与整颗 pill 连成一体 */
const pillSegmentClass =
  "h-9 min-h-0 min-w-0 flex-1 basis-0 items-center justify-center rounded-none border-0 px-0 text-sm font-semibold tracking-wide text-foreground shadow-none outline-none hover:bg-foreground/[0.05] aria-pressed:bg-transparent aria-pressed:text-foreground aria-pressed:shadow-none dark:border-0 dark:hover:bg-foreground/[0.07] dark:focus-visible:border-0 focus-visible:z-[1] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0";

export function SitePreferences({ className }: { className?: string }) {
  const { locale, dict } = useI18n();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <div
      className={cn("flex flex-wrap items-center sm:justify-end", className)}
    >
      <div
        className={cn(
          "inline-flex h-9 w-[7.25rem] shrink-0 items-stretch overflow-hidden rounded-full",
          "border border-[var(--thin-border)] bg-surface",
          "shadow-[0_1px_2px_rgb(28_26_23/0.04)]",
          "dark:border-[var(--thin-border)] dark:bg-[color-mix(in_oklch,var(--card)_30%,var(--background))]",
          "dark:shadow-[0_1px_2px_rgb(0_0_0/0.32)]",
        )}
        title={`${dict.prefs.localeSwitch} · ${dict.prefs.themeSwitch}`}
      >
        <Toggle
          size="default"
          pressed={locale === "en"}
          onPressedChange={(next) => {
            const nextLocale: Locale = next ? "en" : "zh";
            if (nextLocale === locale) return;
            setLocaleCookie(nextLocale);
            router.refresh();
          }}
          aria-label={`${dict.prefs.localeSwitch}: ${locale === "en" ? "EN" : "中"}`}
          className={pillSegmentClass}
        >
          {locale === "en" ? "EN" : "中"}
        </Toggle>

        <div
          className="w-px shrink-0 self-stretch bg-[var(--thin-border)]"
          aria-hidden
        />

        <Toggle
          size="default"
          pressed={isDark}
          disabled={!mounted}
          onPressedChange={(next) => {
            if (!mounted) return;
            setTheme(next ? "dark" : "light");
          }}
          aria-label={
            isDark ? dict.prefs.themeDark : dict.prefs.themeLight
          }
          className={pillSegmentClass}
        >
          {isDark ? (
            <Moon className="size-[1.125rem] stroke-[2.25]" aria-hidden />
          ) : (
            <Sun className="size-[1.125rem] stroke-[2.25]" aria-hidden />
          )}
        </Toggle>
      </div>
    </div>
  );
}
