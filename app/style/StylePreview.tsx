"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { StyleEntry } from "@/types/styles";

export function StylePreview({ entry }: { entry: StyleEntry }) {
  const tags = new Set(entry.tags.map((tag) => tag.toLowerCase()));
  const imageUrl = entry.preview_url || (entry.kind === "image" && /\.(avif|gif|jpe?g|png|webp)(\?.*)?$/i.test(entry.url || "") ? entry.url : null);

  if (entry.id === "pretext-sine-wave-text" || tags.has("sine-wave")) return <SineWavePreview />;
  if (entry.id === "codrops-wave-svg-text-reveal" || (tags.has("wave") && tags.has("color-matrix"))) return <CodropsWavePreview />;

  if (entry.kind === "text-effect" && tags.has("displacement")) {
    const filterId = `style-displacement-${entry.id.replace(/[^a-z0-9_-]/gi, "-")}`;
    return (
      <PreviewFrame>
        <svg aria-hidden="true" className="absolute size-0">
          <filter id={filterId}>
            <feTurbulence baseFrequency="0.012 0.045" numOctaves="2" seed="7" type="fractalNoise" />
            <feDisplacementMap in="SourceGraphic" scale="7" xChannelSelector="R" yChannelSelector="B" />
          </filter>
        </svg>
        <span className="text-center text-[28px] font-bold tracking-tight text-[#292822]" style={{ filter: `url(#${filterId})` }}>
          Selectable, distorted text
        </span>
      </PreviewFrame>
    );
  }

  if (imageUrl) {
    return (
      <div className="mb-3 overflow-hidden rounded-md border border-border bg-bg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={`Preview of ${entry.source_text}`} className="h-44 w-full object-cover" loading="lazy" src={imageUrl} />
      </div>
    );
  }

  return null;
}

function PreviewFrame({ children }: { children: ReactNode }) {
  return <div className="relative mb-3 grid min-h-32 place-items-center overflow-hidden rounded-md border border-border bg-[#eeeae1] px-4">{children}</div>;
}

function SineWavePreview() {
  const text = "A continuous field of living text";
  return (
    <PreviewFrame>
      <span aria-label={text} className="text-center text-[25px] font-bold tracking-tight text-[#292822]">
        {Array.from(text).map((character, index) => (
          <span
            aria-hidden="true"
            className="style-sine-character inline-block motion-reduce:animate-none"
            key={`${character}-${index}`}
            style={{ "--sine-index": index } as CSSProperties}
          >
            {character === " " ? "\u00a0" : character}
          </span>
        ))}
      </span>
    </PreviewFrame>
  );
}

function CodropsWavePreview() {
  const blurRef = useRef<SVGFEGaussianBlurElement>(null);
  const frameRef = useRef<number | null>(null);
  const [opacity, setOpacity] = useState(1);

  const replay = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      blurRef.current?.setAttribute("stdDeviation", "0");
      setOpacity(1);
      return;
    }

    const started = performance.now();
    setOpacity(0);
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 1800);
      const eased = progress === 1 ? 1 : 1 - 2 ** (-10 * progress);
      blurRef.current?.setAttribute("stdDeviation", String(42 * (1 - eased)));
      setOpacity(eased);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  return (
    <PreviewFrame>
      <svg aria-hidden="true" className="absolute size-0">
        <filter id="style-codrops-wave" x="-60%" y="-100%" width="220%" height="300%">
          <feGaussianBlur in="SourceGraphic" ref={blurRef} result="blur" stdDeviation="0" />
          <feColorMatrix in="blur" mode="matrix" result="goo" values="1 0 0 0 0  0 1 0 0 0  1 0 1 0 0  0 0 0 13 -6" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </svg>
      <button aria-label="Replay the Wave text reveal" className="group grid min-h-24 w-full place-items-center" onClick={replay} type="button">
        <span className="text-[42px] font-bold tracking-[-0.05em] text-[#292822]" style={{ filter: "url(#style-codrops-wave)", opacity }}>
          Wave
        </span>
        <span className="absolute bottom-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted group-hover:text-[#292822]">Replay</span>
      </button>
    </PreviewFrame>
  );
}
