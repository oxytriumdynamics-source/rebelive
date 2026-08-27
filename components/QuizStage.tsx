"use client";

import { motion, AnimatePresence } from "framer-motion";
import HalftoneField from "./HalftoneField";
import EverestPattern from "./EverestPattern";
import NavLogo from "./NavLogo";
import ProgressRail from "./ProgressRail";
import { ShuffledQuestion } from "@/lib/quiz";
import { Persona } from "@/data/questions";
import { ArrowUpRight } from "lucide-react";

const TAGS = ["A", "B", "C"];
const MONO = "JetBrains Mono, Courier New, monospace";

export default function QuizStage({
  question,
  index,
  total,
  onAnswer,
}: {
  question: ShuffledQuestion;
  index: number;
  total: number;
  onAnswer: (persona: Persona) => void;
}) {
  return (
    <motion.div
      key="quiz"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{ backgroundColor: "#f0efeb" }}
    >
      <HalftoneField />
      <EverestPattern opacity={0.2} />

      {/* ── Header ── */}
      <div className="relative z-10 flex w-full items-center justify-between px-6 pt-5 sm:px-10 sm:pt-7">
        <NavLogo tone="light" width={180} />

        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ash font-medium" style={{ fontFamily: MONO }}>
          0{index + 1} / 0{total}
        </span>
      </div>

      {/* Progress rail */}
      <div className="relative z-10 px-6 pt-3 sm:px-10">
        <ProgressRail total={total} current={index} tone="light" />
      </div>

      {/* ── Centered glass question card ── */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-6 sm:px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={question.id}
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.97 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-2xl"
            style={{
              // Glass card
              background: "rgba(255,255,255,0.45)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: "2px",
              boxShadow: "0 8px 48px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.7)",
              padding: "clamp(24px, 4vw, 48px)",
            }}
          >
            {/* Question number tag */}
            <div className="mb-4 flex items-center gap-3">
              <span
                className="font-mono text-[9px] uppercase tracking-[0.35em] text-ash"
                style={{ fontFamily: MONO }}
              >
                {question.title}
              </span>
              <div className="h-px flex-1 bg-black/10" />
              <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-ash/60" style={{ fontFamily: MONO }}>
                Q{index + 1}
              </span>
            </div>

            {/* Question text */}
            <h2
              className="text-ink select-none leading-[1.05] mb-6"
              style={{
                fontFamily: "Inter, -apple-system, sans-serif",
                fontSize: "clamp(1.5rem, 3vw, 2.2rem)",
                fontWeight: 800,
                letterSpacing: "-0.02em",
              }}
            >
              {question.prompt}
            </h2>

            {/* Answer options */}
            <div className="flex flex-col gap-2.5">
              {question.options.map((opt, i) => (
                <motion.button
                  key={opt.text}
                  onClick={() => onAnswer(opt.persona)}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 + i * 0.08, duration: 0.3 }}
                  className="group flex w-full items-center justify-between border border-black/12 px-5 py-4 text-left transition-all duration-200 hover:border-black/50 hover:bg-white/60 active:scale-[0.99]"
                  style={{
                    background: "rgba(255,255,255,0.3)",
                    borderRadius: "1px",
                  }}
                >
                  <div className="flex items-center gap-4">
                    <span
                      className="font-mono flex h-6 w-6 shrink-0 items-center justify-center border border-black/20 text-[10px] text-ash transition-all group-hover:border-ink group-hover:text-ink"
                      style={{ fontFamily: MONO }}
                    >
                      {TAGS[i]}
                    </span>
                    <span
                      className="text-[13px] leading-snug text-ink/70 transition-colors group-hover:text-ink"
                      style={{ fontFamily: "Inter, -apple-system, sans-serif" }}
                    >
                      {opt.text}
                    </span>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-black/20 transition-all duration-200 group-hover:text-ink group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </motion.button>
              ))}
            </div>

            {/* Hint */}
            <p className="mt-5 text-center font-mono text-[9px] uppercase tracking-[0.25em] text-ash/50" style={{ fontFamily: MONO }}>
              Choose fast — instinct only.
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Footer ── */}
      <div className="relative z-10 flex w-full items-center justify-between border-t border-black/10 px-6 py-3 sm:px-10">
        <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-ash" style={{ fontFamily: MONO }}>REBELIVE</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-ash" style={{ fontFamily: MONO }}>WAKE · FUEL · REBEL</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-ash" style={{ fontFamily: MONO }}>0{index + 1} / 0{total}</span>
      </div>
    </motion.div>
  );
}
