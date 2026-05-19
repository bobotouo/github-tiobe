"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { placeWordsInShape } from "@/lib/enrich/word-cloud-placement";
import type { HotspotTerm } from "@/lib/enrich/types";
import { cn } from "@/lib/utils";

type Props = {
  terms: HotspotTerm[];
  className?: string;
  countLabel: (term: string, count: number) => string;
  cloudAriaLabel: string;
};

const MIN_H = 400;

const FONT_UI =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

const MIN_VISIBLE_WORDS = 12;

export function EnrichWordCloud({
  terms,
  className,
  countLabel,
  cloudAriaLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w < 1) return;
      const h = Math.max(MIN_H, Math.min(780, Math.round(w * 0.66)));
      setSize((prev) =>
        prev?.width === w && prev.height === h ? prev : { width: w, height: h },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ready = size != null && size.width >= 80;

  const words = useMemo(() => {
    if (!ready || !size || terms.length === 0) return [];
    if (process.env.NODE_ENV === "development" && terms.length < MIN_VISIBLE_WORDS) {
      console.warn(
        `[EnrichWordCloud] only ${terms.length} unique terms (${size.width}×${size.height})`,
      );
    }
    return placeWordsInShape(terms, size.width, size.height).words;
  }, [terms, size, ready]);

  if (terms.length === 0) return null;

  const showPlaceholder = !ready;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full overflow-hidden rounded-2xl",
        "border-border/60 bg-transparent",
        className,
      )}
      style={{ minHeight: MIN_H, height: ready ? size?.height : MIN_H }}
      role="img"
      aria-label={cloudAriaLabel}
      aria-busy={showPlaceholder}
    >
      {showPlaceholder ? (
        <div
          className="flex h-full min-h-[400px] items-center justify-center text-sm text-muted-foreground"
          aria-hidden
        >
          …
        </div>
      ) : (
        <svg
          width={size!.width}
          height={size!.height}
          className="block select-none"
          style={{ overflow: "hidden" }}
          aria-hidden
        >
          {words.map((w, i) => (
            <g key={`${w.term}-${i}`} transform={`translate(${w.x}, ${w.y})`}>
              <g transform={`rotate(${w.rotate})`}>
                <g className="origin-[0px_0px] cursor-default transition-transform duration-150 ease-out hover:scale-[1.4]">
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={w.fontSize}
                    fontFamily={FONT_UI}
                    fontWeight={w.fontSize >= 16 ? 800 : 700}
                    fill={w.color}
                    fillOpacity={w.opacity}
                    className="pointer-events-auto transition-[fill-opacity,filter] duration-150 ease-out hover:fill-opacity-100 hover:brightness-125 hover:drop-shadow-sm"
                  >
                    <title>{countLabel(w.term, w.count)}</title>
                    {w.term}
                  </text>
                </g>
              </g>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
