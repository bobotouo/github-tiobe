import type { Locale } from "./types";

const zh = {
  meta: {
    title: "GitHub 语言指数",
    description:
      "按 star 区间统计 GitHub 活跃仓库的 Linguist 语言占比（保留约 30 日，趋势可自选日期范围）。",
  },
  hero: {
    title: "GitHub 语言指数",
    subtitle:
      "按 star 档用 Search 拉活跃仓样本，Linguist 汇总各语言字节后换算占比；趋势图可自选区间。",
    metricsExplainer:
      "「结构占比」：样本仓 Linguist 字节换算的日度语言占比（%）。\n「新建热度」：档内 Search「新建仓」匹配量归一为当日热度池占比（%）；需开启热度采集。\n「Velocity」：当前区间内相邻两期之间，多线时取池内第一名该指标的百分点差；点选单语言后取该语言。",
  },
  tierSection: {
    title: "Stars 区间",
  },
  db: {
    missingBefore: "未配置 ",
    missingAfter:
      "。连接 Postgres 后执行 ",
    missingEnd: "。",
  },
  loadError: "读取失败：",
  trends: {
    title: "趋势",
    lastDays: (n: number) => `近 ${n} 日`,
  },
  chart: {
    noData: "暂无数据",
    showAllLanguages: "查看全部语言",
    velocityIndex: "Velocity 指数",
    velocityMoM: (lang: string) => `${lang} · 环比`,
    velocityIndexHeat: "热度 Velocity",
    velocityMoMHeat: (lang: string) => `${lang} · 热度环比`,
    tabShare: "结构占比",
    tabHeat: "新建热度",
    indexedNote:
      "多线：纵轴为相对区间首日的变化（Δ，百分点），便于对比谁先走强/走弱。",
  },
  rankings: {
    title: "每日排行",
    metaLine: (date: string, repos: number, langs: number) =>
      `${date} · ${repos} 仓库 · ${langs} 种语言`,
    colRank: "#",
    colLanguage: "语言",
    colShare: "占比",
    colHeat: "新建匹配",
    colDoD: "周环比",
    colTrend: "趋势",
    empty: "暂无排行数据",
    collapse: "收起",
    expand: (n: number) => `展开其余 ${n} 种语言`,
    loading: "加载中…",
  },
  api: {
    requestFailed: "请求失败",
    noRows: "响应无数据",
  },
  footer: {
    line: (year: number) =>
      `© ${year} GitHub 语言指数 · GitHub API`,
  },
  prefs: {
    localeSwitch: "界面语言",
    localeZh: "中文",
    localeEn: "English",
    themeSwitch: "颜色主题",
    themeLight: "浅色",
    themeDark: "深色",
  },
} as const;

const en = {
  meta: {
    title: "GitHub Language Index",
    description:
      "Linguist language share among active GitHub repos by star tier (~30 days retained; custom trend ranges).",
  },
  hero: {
    title: "GitHub Language Index",
    subtitle:
      "Per star tier we sample active repos via Search, aggregate Linguist bytes per language, then show shares; pick a range for trends.",
    metricsExplainer:
      "Share: daily Linguist byte shares in the tier sample (%).\nHeat: Search new-repo counts normalized to that day’s heat pool (%); requires heat collection.\nVelocity: percentage-point change between the last two days in the range—leader in the pool, or the language you select.",
  },
  tierSection: {
    title: "Star tiers",
  },
  db: {
    missingBefore: "Set ",
    missingAfter: ", then run ",
    missingEnd: " on Postgres.",
  },
  loadError: "Failed to load: ",
  trends: {
    title: "Trends",
    lastDays: (n: number) => `Last ${n} days`,
  },
  chart: {
    noData: "No data",
    showAllLanguages: "All languages",
    velocityIndex: "Velocity index",
    velocityMoM: (lang: string) => `${lang} · DoD`,
    velocityIndexHeat: "Heat velocity",
    velocityMoMHeat: (lang: string) => `${lang} · heat DoD`,
    tabShare: "Linguist share",
    tabHeat: "New-repo heat",
    indexedNote:
      "Multi-line Y: change from the first day in the range (Δ, percentage points).",
  },
  rankings: {
    title: "Daily rankings",
    metaLine: (date: string, repos: number, langs: number) =>
      `${date} · ${repos} repos · ${langs} languages`,
    colRank: "#",
    colLanguage: "Language",
    colShare: "Share",
    colHeat: "New matches",
    colDoD: "WoW",
    colTrend: "Trend",
    empty: "No ranking data",
    collapse: "Collapse",
    expand: (n: number) => `Show ${n} more languages`,
    loading: "Loading…",
  },
  api: {
    requestFailed: "Request failed",
    noRows: "Empty response",
  },
  footer: {
    line: (year: number) => `© ${year} GitHub Language Index · GitHub API`,
  },
  prefs: {
    localeSwitch: "Language",
    localeZh: "中文",
    localeEn: "EN",
    themeSwitch: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
  },
} as const;

export const dictionaries = { zh, en } as const;

export type Dictionary = (typeof dictionaries)[Locale];

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
