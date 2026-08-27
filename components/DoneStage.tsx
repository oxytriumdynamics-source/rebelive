"use client";

import { motion } from "framer-motion";
import HalftoneField from "./HalftoneField";
import NavLogo from "./NavLogo";
import { PersonaProfile } from "@/data/personas";
import { RotateCcw, ArrowRight } from "lucide-react";

export default function DoneStage({
  persona,
  name,
  onRestart,
}: {
  persona: PersonaProfile;
  name: string;
  onRestart: () => void;
}) {
  return (
    <motion.div
      key="done"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="relative flex h-full w-full flex-col items-center justify-between overflow-hidden"
      style={{ backgroundColor: "#f0efeb" }}
    >
      <HalftoneField />

      {/* Top nav */}
      <nav className="relative z-10 flex w-full items-center justify-between px-6 py-5 sm:px-10 sm:py-7">
        <NavLogo tone="light" width={180} />
        <span
          className="font-mono text-[10px] uppercase tracking-[0.25em] text-ash"
          style={{ fontFamily: "JetBrains Mono, Courier New, monospace" }}
        >
          Reward Unlocked
        </span>
      </nav>

      {/* Center */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center sm:px-10">
        {/* Checkmark circle */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.1 }}
          className="flex h-16 w-16 items-center justify-center border-2 border-ink"
        >
          <motion.svg
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, delay: 0.4, ease: "easeOut" }}
            className="h-7 w-7"
            viewBox="0 0 28 28"
            fill="none"
          >
            <polyline
              points="4,14 11,21 24,7"
              stroke="#0a0a0a"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.svg>
        </motion.div>

        {/* Name + persona */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.3 }}
        >
          <span
            className="font-mono text-[10px] uppercase tracking-[0.3em] text-ash"
            style={{ fontFamily: "JetBrains Mono, Courier New, monospace" }}
          >
            Rebel Certified
          </span>
          <h1
            className="font-display mt-2 text-[clamp(1.8rem,6vw,3rem)] leading-tight text-ink"
            style={{ fontFamily: "Anton, Arial Narrow, sans-serif" }}
          >
            Welcome to the pack, {name}.
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="max-w-sm text-[13px] leading-relaxed text-ash"
          style={{ fontFamily: "Inter, -apple-system, sans-serif" }}
        >
          Your Rebel ID is now stamped{" "}
          <span className="font-display text-ink" style={{ fontFamily: "Anton, Arial Narrow, sans-serif" }}>
            {persona.name}
          </span>
          . Keep an eye on your inbox — this year&rsquo;s completely unpredictable Rebelive
          benefit is on its way.
        </motion.p>

        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.65 }}
          className="group flex items-center gap-2 bg-ink px-7 py-4 font-mono text-[11px] uppercase tracking-[0.2em] text-paper transition-all duration-200 hover:bg-ink/85"
          style={{ fontFamily: "JetBrains Mono, Courier New, monospace" }}
        >
          VIEW YOUR REBEL ID
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
        </motion.button>
      </div>

      {/* Bottom */}
      <div className="relative z-10 flex w-full items-center justify-between border-t border-black/10 px-6 py-3 sm:px-10">
        <button
          onClick={onRestart}
          className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ash transition-colors hover:text-ink"
          style={{ fontFamily: "JetBrains Mono, Courier New, monospace" }}
        >
          <RotateCcw className="h-3 w-3" /> Run again
        </button>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.3em] text-ash"
          style={{ fontFamily: "JetBrains Mono, Courier New, monospace" }}
        >
          WAKE · FUEL · REBEL
        </span>
      </div>
    </motion.div>
  );
}
