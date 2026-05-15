/** 与 `globals.css` :root 一致，供 Recharts / SVG 直接使用（避免 CSS 变量在 SVG 中失效） */
export const CHART_LINE_HEX: readonly string[] = [
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#2563eb",
  "#9333ea",
  "#db2777",
  "#0891b2",
  "#4f46e5",
  "#0d9488",
  "#b45309",
  "#7c3aed",
  "#be185d",
  "#047857",
  "#c2410c",
] as const;

export function chartLineColorByIndex(i: number): string {
  return CHART_LINE_HEX[i % CHART_LINE_HEX.length] ?? "#2563eb";
}
