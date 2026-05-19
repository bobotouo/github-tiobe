import { chartLineColorByIndex } from "@/lib/chart/lineHex";
import type { HotspotTerm } from "@/lib/enrich/types";

export type MaskedWordTile = {
  term: string;
  count: number;
  left: number;
  top: number;
  fontSize: number;
  color: string;
  opacity: number;
};

// 词块铺满整个容器，CSS mask 负责裁出字形
const TILE_COUNT = 600;
const FONT_MIN = 14;
const FONT_MAX = 40;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * 在整个容器内密集铺词，由外层 CSS mask-image 剪裁成字形。
 * 词频越高字号越大，词的位置均匀随机分布。
 */
export function layoutDenseWordTiles(
  terms: HotspotTerm[],
  width: number,
  height: number,
): MaskedWordTile[] {
  if (terms.length === 0 || width < 80 || height < 80) return [];

  const maxC = Math.max(...terms.map((t) => t.count));
  const minC = Math.min(...terms.map((t) => t.count));
  const spread = maxC - minC || 1;

  const cols = Math.max(16, Math.floor(width / 74));
  const rows = Math.max(10, Math.floor(height / 46));
  const total = Math.max(TILE_COUNT, rows * cols);

  return Array.from({ length: total }, (_, i) => {
    const term = terms[i % terms.length]!;
    const rank = i % terms.length;
    const seed = hashString(`${term.term}-${i}`);
    const col = i % cols;
    const row = Math.floor(i / cols) % rows;
    const rx = pseudoRandom(seed + 1);
    const ry = pseudoRandom(seed + 2);

    const x = ((col + 0.15 + rx * 0.7) / cols) * width;
    const y = ((row + 0.18 + ry * 0.68) / rows) * height;

    const countRatio = (term.count - minC) / spread;
    const repeatN = Math.floor(i / terms.length);
    const sizeFactor = Math.max(0.55, 1 - repeatN * 0.05);
    const fontSize = (FONT_MIN + countRatio * (FONT_MAX - FONT_MIN)) * sizeFactor;

    return {
      term: term.term,
      count: term.count,
      left: x,
      top: y,
      fontSize: Math.round(fontSize),
      color: chartLineColorByIndex(rank),
      opacity: 0.80 + pseudoRandom(seed + 3) * 0.20,
    };
  });
}
