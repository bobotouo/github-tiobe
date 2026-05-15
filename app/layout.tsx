import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale } from "@/lib/i18n/get-locale";
import { cn } from "@/lib/utils";

import "./globals.css";

/** 拉丁字母与数字优先：清晰、适合数据/仪表盘 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  return {
    title: t.meta.title,
    description: t.meta.description,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getServerLocale();

  return (
    <html
      lang={locale === "en" ? "en" : "zh-CN"}
      className={cn("h-full antialiased", geistSans.variable, inter.variable, geistMono.variable)}
      suppressHydrationWarning
    >
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col font-normal text-base leading-relaxed">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
