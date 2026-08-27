"use client";

import { useMemo } from "react";

// deterministic PRNG — avoids hydration mismatches
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRing(
  cx: number,
  cy: number,
  r: number,
  wobble: number,
  rand: () => number
): string {
  const points: [number, number][] = [];
  const steps = 32;
  const phase = rand() * Math.PI * 2;
  const freq = 2 + Math.floor(rand() * 4);
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const n =
      Math.sin(a * freq + phase) * wobble +
      Math.sin(a * (freq + 1.7) + phase * 1.3) * wobble * 0.4;
    const rr = r + n;
    points.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  const d =
    `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)} ` +
    points
      .slice(1)
      .map((p) => `L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`)
      .join(" ") +
    " Z";
  return d;
}

/**
 * DriftField — light-mode animated topographic contour lines.
 * Used on off-white (#f0efeb) backgrounds. Renders near-invisible
 * gray strokes that drift slowly as a motion graphic background.
 */
export default function DriftField({
  seed = 7,
  className = "",
  speed = 55,
}: {
  seed?: number;
  className?: string;
  speed?: number; // animation duration in seconds
}) {
  const rand = useMemo(() => mulberry32(seed), [seed]);

  const rings = useMemo(() => {
    const cx = 45 + rand() * 25;
    const cy = 40 + rand() * 30;
    const out: string[] = [];
    let r = 4;
    for (let i = 0; i < 14; i++) {
      out.push(buildRing(cx, cy, r, 2.5 + rand() * 3.5, rand));
      r += 5 + rand() * 4;
    }
    return out;
  }, [rand]);

  // Second cluster offset for richness
  const rand2 = useMemo(() => mulberry32(seed + 777), [seed]);
  const rings2 = useMemo(() => {
    const cx = 70 + rand2() * 20;
    const cy = 60 + rand2() * 25;
    const out: string[] = [];
    let r = 3;
    for (let i = 0; i < 10; i++) {
      out.push(buildRing(cx, cy, r, 2 + rand2() * 3, rand2));
      r += 4 + rand2() * 3;
    }
    return out;
  }, [rand2]);

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
    >
      {/* Primary cluster */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        className="absolute -inset-[15%] h-[130%] w-[130%]"
        style={{
          animation: `driftLines ${speed}s linear infinite alternate`,
        }}
      >
        {rings.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="rgba(0,0,0,0.055)"
            strokeWidth={0.15}
          />
        ))}
      </svg>

      {/* Secondary cluster — slower drift opposite direction */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        className="absolute -inset-[15%] h-[130%] w-[130%]"
        style={{
          animation: `driftSlow ${speed * 1.4}s ease-in-out infinite`,
          opacity: 0.7,
        }}
      >
        {rings2.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="rgba(0,0,0,0.04)"
            strokeWidth={0.12}
          />
        ))}
      </svg>

      {/* Subtle radial vignette for depth */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 40%, transparent 50%, rgba(0,0,0,0.03) 100%)",
        }}
      />
    </div>
  );
}
