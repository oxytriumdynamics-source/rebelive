"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";

import NavLogo from "./NavLogo";
import SiteFooter from "./SiteFooter";
import MemberCard from "./MemberCard";
import { PERSONAS } from "@/data/personas";
import { ScoreResult } from "@/lib/quiz";
import { ArrowRight } from "lucide-react";
import EverestPattern from "./EverestPattern";
import HalftoneField from "./HalftoneField";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { claimPersona } from "@/store/slices/authslice";

const MONO = "JetBrains Mono, Courier New, monospace";

export default function ResultStage({
  result,
  onRestart,
}: {
  result: ScoreResult;
  onRestart?: () => void;
}) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAuthenticated, user } = useAppSelector((s) => s.auth);
  const persona = PERSONAS[result.winner];
  const isApex = persona.id === "APEX";
  const isCapella = persona.id === "CAPELLA";
  const isAviva = persona.id === "AVIVA";

  // The member name: use logged-in user's name or a placeholder
  const memberName = user ? `${user.firstName} ${user.lastName}` : "";

  async function handleClaim() {
    if (isAuthenticated) {
      // Already logged in — claim immediately
      await dispatch(claimPersona(result.winner.toLowerCase()));
      router.push("/");
    } else {
      // Guest — save persona, send to signup
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('pendingPersona', result.winner.toLowerCase());
      }
      router.push('/auth');
    }
  }

  // Persona-specific Background and EverestPattern stroke settings
  const bgStyle = isApex
    ? "#090909"
    : isCapella
    ? "#ffffff"
    : "#ffffff";

  const patternStroke = isApex
    ? "#ffffff"
    : isCapella
    ? "#c8922a"
    : "#e8628a";

  const halftoneRgb = isApex
    ? "255, 255, 255"
    : isCapella
    ? "200, 146, 42"
    : "232, 98, 138";

  const patternOpacity = isApex ? 0.32 : isCapella ? 0.38 : 0.38;

  return (
    <motion.div
      key="result"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="relative flex h-full w-full flex-col overflow-hidden transition-colors duration-500"
      style={{ backgroundColor: bgStyle }}
    >
      {/* ── Interactive Halftone Mouse Hover Ripple Pattern ── */}
      <HalftoneField colorRgb={halftoneRgb} />

      {/* ── EverestPattern with Persona-specific Color & Stroke ── */}
      <EverestPattern
        strokeColor={patternStroke}
        opacity={patternOpacity}
      />

      {/* ── Top Nav ── */}
      <nav className="relative z-20 flex w-full items-center justify-between px-4 py-3 sm:px-10 sm:py-4">
        <NavLogo tone={isApex ? "dark" : "light"} width={180} />

        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1 backdrop-blur-md ${
            isApex
              ? "border border-white/15 bg-white/[0.06]"
              : isCapella
              ? "border border-amber-500/20 bg-amber-500/[0.06]"
              : "border border-rose-400/20 bg-rose-500/[0.06]"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full animate-pulse ${
              isApex
                ? "bg-emerald-400"
                : isCapella
                ? "bg-amber-500 shadow-[0_0_6px_#f59e0b]"
                : "bg-rose-500 shadow-[0_0_6px_#f43f5e]"
            }`}
          />
          <span
            className={`font-mono text-[10.5px] uppercase tracking-[0.2em] font-semibold ${
              isApex
                ? "text-white"
                : isCapella
                ? "text-[#92620e]"
                : "text-[#be185d]"
            }`}
            style={{ fontFamily: MONO }}
          >
            REBEL ID ISSUED
          </span>
        </div>
      </nav>

      {/* ── Center Stage: Member Card + Actions ── */}
      <div className="relative z-20 flex flex-1 min-h-0 flex-col items-center justify-center gap-2 px-4 py-1 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="w-full flex flex-col items-center gap-2"
        >

          {/* Member Card with Flip functionality */}
          <MemberCard persona={persona} memberName={memberName} showActions={false} />

          {/* CTA row */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <button
                onClick={handleClaim}
                className={`group flex items-center gap-3 px-7 py-3.5 font-mono text-[11px] uppercase tracking-[0.2em] transition-all duration-200 active:scale-[0.98] ${
                  isApex
                    ? "bg-white text-black hover:bg-white/90 shadow-[0_10px_30px_rgba(255,255,255,0.15)]"
                    : isCapella
                    ? "bg-[#111110] text-white hover:bg-black/85 shadow-lg"
                    : "bg-[#111110] text-white hover:bg-black/85 shadow-lg"
                }`}
                style={{ fontFamily: MONO }}
              >
                {isAuthenticated ? "SAVE MY CHARACTER" : "CLAIM YOUR REWARD"}
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
              </button>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* ── Footer ── */}
      <SiteFooter
        borderColor={isApex ? "border-white/10" : "border-black/10"}
        textColor={isApex ? "text-white/45" : "text-black/45"}
      />
    </motion.div>
  );
}
