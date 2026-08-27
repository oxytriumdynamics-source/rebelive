"use client";

import { useEffect, useRef } from "react";

interface Dot {
  bx: number;
  by: number;
  currentX: number;
  currentY: number;
  currentSize: number;
  currentAlpha: number;
}

/**
 * HalftoneField — continuous fluid square-dot mesh.
 * 
 * - Continuous liquid motion: Multi-octave harmonic fluid simulation continuously flows
 *   with subtle organic displacement and breathing dot scale.
 * - Refined / less visible: Soft, elegant contrast on backgrounds (0.018 - 0.06 base opacity).
 * - Interactive: Responsive fluid ripple wake on mouse movement with smooth inertia decay.
 */
export default function HalftoneField({
  colorRgb = "10, 10, 10",
  className = "",
}: {
  colorRgb?: string; // e.g. "255, 255, 255" or "200, 146, 42" or "232, 98, 138"
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999, targetX: -9999, targetY: -9999, speed: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /* ── Configuration ── */
    const SPACING = 24;       // grid density
    const BASE_MIN = 0.8;     // min dot size
    const BASE_MAX = 2.4;     // max dot size in flow crests
    const HOVER_MAX = 6.8;    // dot size on direct hover
    const INFLUENCE = 140;    // mouse ripple reach
    const LERP = 0.08;        // smoothing rate

    let dots: Dot[] = [];
    let w = 0, h = 0;
    let time = 0;
    let raf: number;
    let lastT = performance.now();

    function buildDots(width: number, height: number) {
      const list: Dot[] = [];
      const cols = Math.ceil(width / SPACING) + 2;
      const rows = Math.ceil(height / SPACING) + 2;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * SPACING;
          const y = r * SPACING;
          list.push({
            bx: x,
            by: y,
            currentX: x,
            currentY: y,
            currentSize: BASE_MIN,
            currentAlpha: 0.02,
          });
        }
      }
      return list;
    }

    /* Multi-frequency continuous fluid motion generator */
    function fluidSample(x: number, y: number, t: number) {
      const w1 = Math.sin(x * 0.008 + t * 0.45) * Math.cos(y * 0.009 + t * 0.35);
      const w2 = Math.sin((x + y) * 0.005 + t * 0.6) * 0.5;
      const w3 = Math.cos(x * 0.012 - y * 0.008 + t * 0.25) * 0.35;
      const w4 = Math.sin(Math.sqrt(x * x + y * y) * 0.006 - t * 0.4) * 0.25;

      const combined = (w1 + w2 + w3 + w4) / 2.1; // normalized roughly -1 to 1
      return (combined + 1) * 0.5; // 0 to 1
    }

    function draw(now: number) {
      if (!ctx || !canvas) return;
      const delta = Math.min(32, now - lastT) / 1000;
      lastT = now;
      time += delta * 0.75; // smooth continuous fluid progression

      ctx.clearRect(0, 0, w, h);

      // Smooth mouse coordinate tracking
      const mouse = mouseRef.current;
      mouse.x += (mouse.targetX - mouse.x) * 0.15;
      mouse.y += (mouse.targetY - mouse.y) * 0.15;

      const mx = mouse.x;
      const my = mouse.y;

      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];

        // Fluid potential at this coordinate
        const f = fluidSample(dot.bx, dot.by, time);

        // Subtle liquid displacement (fluid drift)
        const dispX = Math.cos(dot.by * 0.01 + time * 0.6) * 2.5 * f;
        const dispY = Math.sin(dot.bx * 0.01 + time * 0.5) * 2.5 * f;

        // Interactive mouse proximity calculation
        const dx = dot.bx - mx;
        const dy = dot.by - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let hoverBoost = 0;
        let pushX = 0;
        let pushY = 0;

        if (dist < INFLUENCE) {
          const proximity = 1 - dist / INFLUENCE;
          hoverBoost = proximity * proximity; // quadratic falloff
          // subtle liquid push away from cursor
          const angle = Math.atan2(dy, dx);
          const pushMag = hoverBoost * 4;
          pushX = Math.cos(angle) * pushMag;
          pushY = Math.sin(angle) * pushMag;
        }

        // Target size and subtle opacity
        const targetSize = BASE_MIN + f * (BASE_MAX - BASE_MIN) + hoverBoost * (HOVER_MAX - BASE_MAX);
        // Base alpha is kept very subtle (0.018 to 0.055) + interactive highlight (up to 0.26)
        const targetAlpha = 0.018 + f * 0.042 + hoverBoost * 0.22;
        const targetX = dot.bx + dispX + pushX;
        const targetY = dot.by + dispY + pushY;

        // Fluid lerp smoothing
        dot.currentSize += (targetSize - dot.currentSize) * LERP;
        dot.currentAlpha += (targetAlpha - dot.currentAlpha) * LERP;
        dot.currentX += (targetX - dot.currentX) * LERP;
        dot.currentY += (targetY - dot.currentY) * LERP;

        const s = dot.currentSize;
        if (s < 0.4 || dot.currentAlpha < 0.008) continue;

        ctx.fillStyle = `rgba(${colorRgb}, ${dot.currentAlpha.toFixed(4)})`;
        ctx.fillRect(dot.currentX - s / 2, dot.currentY - s / 2, s, s);
      }

      raf = requestAnimationFrame(draw);
    }

    function resize() {
      if (!canvas) return;
      const parent = canvas.parentElement;
      w = parent ? parent.offsetWidth : window.innerWidth;
      h = parent ? parent.offsetHeight : window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      dots = buildDots(w, h);
    }

    function onMouseMove(e: MouseEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.targetX = e.clientX - rect.left;
      mouseRef.current.targetY = e.clientY - rect.top;
    }

    function onMouseLeave() {
      mouseRef.current.targetX = -9999;
      mouseRef.current.targetY = -9999;
    }

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseleave", onMouseLeave, { passive: true });

    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    resize();
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-0 ${className}`}
    />
  );
}
