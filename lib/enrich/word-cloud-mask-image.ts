export const WORDCLOUD_MASK_PHRASE = "SHIT BRO";

/**
 * 生成 CSS mask-image 用的 PNG（透明背景 + 不透明字形）。
 * 把这张图当 mask-image 贴到词层上：
 *   - 字母区域（alpha=1）→ 词可见
 *   - 空白区域（alpha=0）→ 词隐藏
 * 词层整体铺满容器，mask 自然裁出字形，词的位置就"是"字母的轮廓。
 */
export function buildMaskDataUrl(
  phrase: string,
  width: number,
  height: number,
): string | null {
  if (typeof document === "undefined" || width < 80 || height < 80) return null;

  const W = Math.floor(width);
  const H = Math.floor(height);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // 完全透明背景（alpha=0）
  ctx.clearRect(0, 0, W, H);

  const lines = phrase.trim().toUpperCase().split(/\s+/);
  const totalRatio = lines.length * 0.82 + (lines.length - 1) * 0.28;
  const fontSize = Math.min(Math.floor((H * 0.84) / totalRatio), 220);
  const lineH = fontSize * 0.82;
  const lineGap = fontSize * 0.28;
  const totalH = lines.length * lineH + (lines.length - 1) * lineGap;
  const startY = (H - totalH) / 2;
  // 两行拉成相同宽度（90% 容器宽），让字形更饱满
  const targetW = W * 0.90;

  ctx.fillStyle = "#000"; // 不透明黑色（alpha=1）→ CSS mask 展示
  ctx.textBaseline = "alphabetic";
  ctx.font = `900 ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const naturalW = ctx.measureText(line).width || 1;
    const scaleX = targetW / naturalW;
    const y = startY + i * (lineH + lineGap) + fontSize * 0.78;
    // 水平缩放使两行等宽并居中
    const drawX = (W / 2 - targetW / 2) / scaleX;
    ctx.save();
    ctx.scale(scaleX, 1);
    ctx.fillText(line, drawX, y);
    ctx.restore();
  }

  return canvas.toDataURL("image/png");
}
