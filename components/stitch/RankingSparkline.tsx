"use client";

type Props = {
  values: number[];
  color: string;
};

/** 无边框、无坐标轴的占比迷你折线（近 N 日快照序列） */
export function RankingSparkline({ values, color }: Props) {
  if (values.length < 2) {
    return (
      <span className="text-muted-foreground tabular-nums" aria-hidden>
        —
      </span>
    );
  }

  const w = 92;
  const h = 28;
  const padX = 2;
  const padY = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const xAt = (i: number) =>
    padX + (i / Math.max(1, values.length - 1)) * (w - 2 * padX);
  const yAt = (v: number) => {
    if (max === min) return padY + (h - 2 * padY) / 2;
    const t = (v - min) / (max - min);
    return padY + (1 - t) * (h - 2 * padY);
  };
  const points = values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const pathD = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    const prev = points[i - 1];
    const cp1x = prev.x + (p.x - prev.x) / 3;
    const cp2x = p.x - (p.x - prev.x) / 3;
    return `${acc} C ${cp1x.toFixed(2)} ${prev.y.toFixed(2)}, ${cp2x.toFixed(2)} ${p.y.toFixed(2)}, ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }, "");

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0 overflow-visible"
      aria-hidden
    >
      <path
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        d={pathD}
      />
    </svg>
  );
}
