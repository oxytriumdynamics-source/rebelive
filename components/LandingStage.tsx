"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import HalftoneField from "./HalftoneField";
import EverestPattern from "./EverestPattern";
import NavLogo from "./NavLogo";
import SiteFooter from "./SiteFooter";
import { ArrowRight, User } from "lucide-react";
import { useAppSelector } from "@/store/hooks";

const MONO = "JetBrains Mono, Courier New, monospace";
const DISPLAY = "Anton, Arial Narrow, sans-serif";

export default function LandingStage({
  onStart,
}: {
  onStart: () => void;
}) {
  const { isAuthenticated, user } = useAppSelector((s) => s.auth);

  return (
    <motion.div
      key="landing"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.5 }}
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{ backgroundColor: "#f0efeb" }}
    >
      <HalftoneField />
      <EverestPattern opacity={0.25} />

      {/* ── Top Nav ── */}
      <nav className="relative z-10 flex w-full items-center justify-between px-6 py-5 sm:px-10 sm:py-7">
        <NavLogo tone="light" width={180} />

        {isAuthenticated && user ? (
          <Link
            href="/"
            className="group flex items-center gap-2 rounded-full border border-black/12 bg-black/[0.04] px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink transition-all hover:bg-black/[0.08]"
            style={{ fontFamily: MONO }}
          >
            <User className="h-3 w-3" />
            {user.firstName}
          </Link>
        ) : (
          <Link
            href="/auth"
            className="group flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-ink transition-opacity hover:opacity-60"
            style={{ fontFamily: MONO }}
          >
            SIGN IN
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </nav>

      {/* ── Main content ── */}
      <div className="relative z-10 flex flex-1 flex-col px-6 pb-4 sm:px-10">
        {/* Giant headline */}
        <div className="flex flex-1 flex-col justify-center gap-0">
          {/* FIND — filled */}
          <motion.h1
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.65, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="font-display leading-[0.88] text-ink select-none"
            style={{ fontFamily: DISPLAY, fontSize: "clamp(5rem, 15vw, 12rem)", letterSpacing: "-0.01em" }}
          >
            FIND
          </motion.h1>

          {/* YOUR — outlined */}
          <motion.h1
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.65, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="font-display leading-[0.88] select-none"
            style={{
              fontFamily: DISPLAY,
              fontSize: "clamp(5rem, 15vw, 12rem)",
              letterSpacing: "-0.01em",
              color: "transparent",
              WebkitTextStroke: "2.5px #0a0a0a",
            }}
          >
            YOUR
          </motion.h1>

          {/* CHARACTER. — filled */}
          <motion.h1
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.65, delay: 0.42, ease: [0.16, 1, 0.3, 1] }}
            className="font-display leading-[0.88] text-ink select-none"
            style={{ fontFamily: DISPLAY, fontSize: "clamp(5rem, 15vw, 12rem)", letterSpacing: "-0.01em" }}
          >
            CHARACTER.
          </motion.h1>

          {/* Sub-text + CTA */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.58 }}
            className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
          >
            <p className="font-mono text-[12px] leading-relaxed text-ash" style={{ fontFamily: MONO }}>
              Five questions. Thirty possible paths.
              <br />
              One version of you, revealed.
            </p>

            <button
              onClick={onStart}
              className="group flex w-fit items-center gap-3 bg-ink px-7 py-4 font-mono text-[11px] uppercase tracking-[0.2em] text-paper transition-all duration-200 hover:bg-ink/85 active:scale-[0.98]"
              style={{ fontFamily: MONO }}
            >
              START THE TEST
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
            </button>
          </motion.div>
        </div>
      </div>

      {/* ── Footer bar ── */}
      <SiteFooter />
    </motion.div>
  );
}
