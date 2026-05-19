import { chartLineColorByIndex } from "@/lib/chart/lineHex";
import type { HotspotTerm } from "@/lib/enrich/types";

export type PlacedWord = {
  term: string;
  count: number;
  x: number;
  y: number;
  fontSize: number;
  rotate: number;
  color: string;
  opacity: number;
};

export type WordCloudLayout = {
  words: PlacedWord[];
};

const FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MASK_FONT = `900 0px "Impact", "Arial Black", ${FONT_FAMILY}`;
const PHRASE_LINES = ["SHIT", "BRO"];

function pr(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function setMeasureFont(ctx: CanvasRenderingContext2D, fs: number, weight = 800) {
  ctx.font = `${weight} ${fs}px ${FONT_FAMILY}`;
}

function measureWidth(ctx: CanvasRenderingContext2D, term: string, fs: number) {
  setMeasureFont(ctx, fs);
  return ctx.measureText(term).width;
}

function buildTermPool(terms: HotspotTerm[]) {
  return [...terms].sort((a, b) => b.count - a.count);
}

function buildPhraseMask(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lineRatio = 0.82;
  const gapRatio = 0.2;
  const totalRatio = PHRASE_LINES.length * lineRatio + gapRatio;
  let fs = Math.floor((height * 0.86) / totalRatio);
  const targetLineW = width * 0.96;

  for (let guard = 0; guard < 80; guard++) {
    ctx.font = MASK_FONT.replace("0px", `${fs}px`);
    const maxLineW = Math.max(...PHRASE_LINES.map((line) => ctx.measureText(line).width));
    if (maxLineW <= targetLineW) break;
    fs -= 2;
  }

  const lineH = fs * lineRatio;
  const gap = fs * gapRatio;
  const totalH = PHRASE_LINES.length * lineH + gap;
  const startY = height / 2 - totalH / 2 + lineH / 2;

  ctx.fillStyle = "#000";
  ctx.font = MASK_FONT.replace("0px", `${fs}px`);
  for (let i = 0; i < PHRASE_LINES.length; i++) {
    const line = PHRASE_LINES[i]!;
    const naturalW = Math.max(1, ctx.measureText(line).width);
    const scaleX = targetLineW / naturalW;
    ctx.save();
    ctx.scale(scaleX, 1);
    ctx.fillText(line, width / 2 / scaleX, startY + i * (lineH + gap));
    ctx.restore();
  }

  const data = ctx.getImageData(0, 0, width, height).data;
  const bin = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      bin[y * width + x] = data[(y * width + x) * 4]! < 128 ? 1 : 0;
    }
  }

  return { bin, maskFontSize: fs };
}

function insideSegmentsAtY(
  bin: Uint8Array,
  width: number,
  height: number,
  y: number,
) {
  const segments: Array<{ x0: number; x1: number }> = [];
  if (y < 0 || y >= height) return segments;

  let start: number | null = null;
  for (let x = 0; x < width; x++) {
    const inside = bin[y * width + x] === 1;
    if (inside && start == null) start = x;
    if ((!inside || x === width - 1) && start != null) {
      const end = inside && x === width - 1 ? x : x - 1;
      if (end - start >= 12) segments.push({ x0: start, x1: end });
      start = null;
    }
  }

  return segments;
}

function pickWordThatFits(
  pool: HotspotTerm[],
  start: number,
  ctx: CanvasRenderingContext2D,
  fs: number,
  maxWidth: number,
) {
  for (let i = 0; i < pool.length; i++) {
    const index = (start + i) % pool.length;
    const term = pool[index]!;
    if (measureWidth(ctx, term.term, fs) <= maxWidth) {
      return { term, cursor: start + i + 1 };
    }
  }
  return { term: pool[start % pool.length]!, cursor: start + 1 };
}

export function placeWordsInShape(
  terms: HotspotTerm[],
  width: number,
  height: number,
): WordCloudLayout {
  if (typeof document === "undefined" || terms.length === 0 || width < 80 || height < 80) {
    return { words: [] };
  }

  const W = Math.floor(width);
  const H = Math.floor(height);
  const built = buildPhraseMask(W, H);
  if (!built) return { words: [] };

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) return { words: [] };

  const { bin, maskFontSize } = built;
  const pool = buildTermPool(terms);
  const termIndex = new Map(terms.map((term, i) => [term.term, i]));
  const maxC = Math.max(...terms.map((t) => t.count), 1);
  const minC = Math.min(...terms.map((t) => t.count));
  const spread = maxC - minC || 1;
  const words: PlacedWord[] = [];

  const rowGap = Math.max(9, Math.min(16, Math.floor(maskFontSize * 0.055)));
  const minFs = Math.max(7, Math.min(10, Math.floor(maskFontSize * 0.034)));
  const maxFs = Math.max(10, Math.min(17, Math.floor(maskFontSize * 0.064)));
  let cursor = 0;

  for (let y = rowGap; y < H - rowGap; y += rowGap) {
    const segments = insideSegmentsAtY(bin, W, H, y);
    for (const segment of segments) {
      let x = segment.x0 + 2;
      const end = segment.x1 - 2;

      while (x < end) {
        const remaining = end - x;
        if (remaining < minFs * 1.6) break;

        const probe = pool[cursor % pool.length]!;
        const ratio = (probe.count - minC) / spread;
        let fs = Math.round(minFs + Math.pow(Math.max(0, ratio), 0.9) * (maxFs - minFs));
        fs = Math.max(minFs, Math.min(maxFs, fs));

        let picked = pickWordThatFits(pool, cursor, measureCtx, fs, remaining);
        cursor = picked.cursor;
        let term = picked.term;
        let w = measureWidth(measureCtx, term.term, fs);

        if (w > remaining) {
          fs = Math.max(6, Math.floor((fs * remaining) / w));
          picked = pickWordThatFits(pool, cursor, measureCtx, fs, remaining);
          cursor = picked.cursor;
          term = picked.term;
          w = measureWidth(measureCtx, term.term, fs);
        }

        if (w > remaining || fs < 6) break;

        const ti = termIndex.get(term.term) ?? cursor;
        const jitterY = (pr(cursor * 17 + y) - 0.5) * Math.min(2, rowGap * 0.18);
        const rotateSeed = pr(cursor * 47 + x);

        words.push({
          term: term.term,
          count: term.count,
          x: x + w / 2,
          y: y + jitterY,
          fontSize: fs,
          rotate: rotateSeed < 0.9 ? 0 : rotateSeed < 0.95 ? -5 : 5,
          color: chartLineColorByIndex(ti),
          opacity: 0.88 + pr(cursor * 71) * 0.12,
        });

        x += w + Math.max(2, fs * 0.22);
      }
    }
  }

  return { words };
}
