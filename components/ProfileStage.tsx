"use client";

import { motion, AnimatePresence } from "framer-motion";
import { LogOut, User, Mail, Calendar, Sparkles, ArrowRight, Shield } from "lucide-react";
import MemberCard from "./MemberCard";
import NavLogo from "./NavLogo";
import SiteFooter from "./SiteFooter";
import HalftoneField from "./HalftoneField";
import EverestPattern from "./EverestPattern";
import { PERSONAS } from "@/data/personas";
import { AuthUser } from "@/store/slices/authslice";
import { useAppDispatch } from "@/store/hooks";
import { logoutUser } from "@/store/slices/authslice";

const MONO = "JetBrains Mono, Courier New, monospace";
const DISPLAY = "Anton, Arial Narrow, sans-serif";
const SANS = "Inter, -apple-system, sans-serif";

// Map backend slug → PERSONAS key
const SLUG_TO_PERSONA: Record<string, keyof typeof PERSONAS> = {
  apex: "APEX",
  capella: "CAPELLA",
  aviva: "AVIVA",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function ProfileStage({
  user,
  onStartQuiz,
}: {
  user: AuthUser;
  onStartQuiz: () => void;
}) {
  const dispatch = useAppDispatch();

  // Resolve the persona if assigned
  const personaSlug = user.preferences?.personalityType?.slug?.toLowerCase();
  const personaKey = personaSlug ? SLUG_TO_PERSONA[personaSlug] : null;
  const persona = personaKey ? PERSONAS[personaKey] : null;

  const isApex = persona?.id === "APEX";
  const isCapella = persona?.id === "CAPELLA";

  // Theme based on persona (or default neutral)
  const bg = isApex ? "#090909" : persona ? "#f0efeb" : "#f0efeb";
  const textPrimary = isApex ? "text-white" : "text-[#0a0a0a]";
  const textSub = isApex ? "text-white/45" : "text-[#0a0a0a]/45";
  const borderColor = isApex ? "border-white/10" : "border-black/10";
  const panelBg = isApex ? "bg-white/[0.04]" : "bg-black/[0.03]";
  const halftoneRgb = isApex ? "255,255,255" : isCapella ? "200,146,42" : persona ? "232,98,138" : "0,0,0";
  const patternStroke = isApex ? "#ffffff" : isCapella ? "#c8922a" : persona ? "#e8628a" : "#0a0a0a";
  const accentColor = isApex ? "#d8ac52" : isCapella ? "#c8922a" : persona ? "#e8628a" : "#0a0a0a";
  const memberName = `${user.firstName} ${user.lastName}`;

  async function handleLogout() {
    await dispatch(logoutUser());
    window.location.href = "/";
  }

  return (
    <motion.div
      key="profile"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{ backgroundColor: bg }}
    >
      {/* Background effects */}
      <HalftoneField colorRgb={halftoneRgb} />
      <EverestPattern strokeColor={patternStroke} opacity={isApex ? 0.28 : 0.22} />

      {/* ── Top Nav ── */}
      <nav className="relative z-20 flex w-full items-center justify-between px-4 py-3 sm:px-10 sm:py-5">
        <NavLogo tone={isApex ? "dark" : "light"} width={130} className="sm:!w-[180px]" />

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Identity badge — full on sm+, dot-only on xs */}
          <div
            className={`flex items-center gap-2 rounded-full px-2.5 py-1.5 border backdrop-blur-md ${borderColor}`}
            style={{ backgroundColor: isApex ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" }}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: accentColor, boxShadow: `0 0 6px ${accentColor}` }}
            />
            <span
              className={`hidden sm:inline font-mono text-[9.5px] uppercase tracking-[0.22em] font-semibold ${textSub}`}
              style={{ fontFamily: MONO }}
            >
              {persona ? `${persona.name} · REBEL ID` : "REBEL ID"}
            </span>
          </div>

          {/* Logout — icon+text on sm+, icon-only on xs */}
          <button
            id="logout-btn"
            onClick={handleLogout}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 sm:px-3.5 font-mono text-[9.5px] uppercase tracking-[0.18em] transition-all hover:opacity-70 ${borderColor} ${textSub}`}
            style={{ fontFamily: MONO }}
          >
            <LogOut className="h-3 w-3 shrink-0" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </nav>


      {/* ── Main content ── */}
      <div className="relative z-20 flex flex-1 flex-col items-center overflow-y-auto">
        <div className="w-full max-w-5xl px-4 py-4 flex flex-col items-center gap-6 md:flex-row md:items-start md:justify-center md:gap-10 lg:gap-16">

          {/* ── Left: Character Card ── */}
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center gap-2 shrink-0 w-[300px] sm:w-[320px]"
          >
            {persona ? (
              <>
                <p
                  className={`font-mono text-[9px] uppercase tracking-[0.32em] mb-1 ${textSub}`}
                  style={{ fontFamily: MONO }}
                >
                  Your Rebel Identity
                </p>
                <MemberCard persona={persona} memberName={memberName} />
              </>
            ) : (
              /* No character assigned */
              <div
                className={`flex flex-col items-center justify-center gap-5 rounded-[20px] border ${borderColor} p-10 text-center`}
                style={{
                  width: "min(340px, 86vw)",
                  minHeight: "min(400px, 55vh)",
                  backgroundColor: isApex ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
                }}
              >
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full"
                  style={{ backgroundColor: "rgba(0,0,0,0.05)" }}
                >
                  <Shield className={`h-8 w-8 ${textSub}`} />
                </div>
                <div>
                  <p
                    className={`font-display text-xl leading-tight ${textPrimary}`}
                    style={{ fontFamily: DISPLAY }}
                  >
                    No Character Yet
                  </p>
                  <p
                    className={`mt-2 font-mono text-[10px] leading-relaxed ${textSub}`}
                    style={{ fontFamily: MONO, maxWidth: "18rem" }}
                  >
                    Take the quiz to discover your rebel identity — APEX, CAPELLA, or AVIVA.
                  </p>
                </div>
                <button
                  id="take-quiz-btn"
                  onClick={onStartQuiz}
                  className="group flex items-center gap-2 bg-[#0a0a0a] px-6 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white transition-all hover:bg-[#0a0a0a]/85 active:scale-[0.98]"
                  style={{ fontFamily: MONO }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Find My Character
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            )}
          </motion.div>

          {/* ── Right: User Details ── */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, delay: 0.25 }}
            className="flex flex-col gap-5 w-full max-w-sm pt-2"
          >
            {/* Greeting */}
            <div>
              <p
                className={`font-mono text-[9px] uppercase tracking-[0.3em] ${textSub}`}
                style={{ fontFamily: MONO }}
              >
                Welcome back
              </p>
              <h1
                className={`mt-1 font-display leading-tight ${textPrimary}`}
                style={{ fontFamily: DISPLAY, fontSize: "clamp(1.8rem, 5vw, 2.8rem)" }}
              >
                {user.firstName}
                <span
                  className="ml-2 font-display"
                  style={{ fontFamily: DISPLAY, color: accentColor }}
                >
                  {user.lastName}
                </span>
              </h1>
              {persona && (
                <p
                  className="mt-1 font-mono text-[10.5px]"
                  style={{ fontFamily: MONO, color: accentColor }}
                >
                  {persona.title}
                </p>
              )}
            </div>

            {/* Info cards */}
            <div className={`space-y-2.5 rounded-xl border ${borderColor} p-4 ${panelBg}`}>
              <p
                className={`font-mono text-[8px] uppercase tracking-[0.28em] ${textSub} mb-3`}
                style={{ fontFamily: MONO }}
              >
                Account Details
              </p>

              {/* Name */}
              <div className={`flex items-center gap-3 border-b pb-2.5 ${borderColor}`}>
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isApex ? "bg-white/[0.06]" : "bg-black/[0.05]"}`}>
                  <User className={`h-3.5 w-3.5 ${textSub}`} />
                </div>
                <div>
                  <p className={`font-mono text-[8px] uppercase tracking-[0.18em] ${textSub}`} style={{ fontFamily: MONO }}>
                    Full Name
                  </p>
                  <p className={`font-sans text-[13px] font-medium mt-0.5 ${textPrimary}`} style={{ fontFamily: SANS }}>
                    {memberName}
                  </p>
                </div>
              </div>

              {/* Email */}
              <div className={`flex items-center gap-3 border-b pb-2.5 ${borderColor}`}>
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isApex ? "bg-white/[0.06]" : "bg-black/[0.05]"}`}>
                  <Mail className={`h-3.5 w-3.5 ${textSub}`} />
                </div>
                <div className="min-w-0">
                  <p className={`font-mono text-[8px] uppercase tracking-[0.18em] ${textSub}`} style={{ fontFamily: MONO }}>
                    Email
                  </p>
                  <p className={`font-sans text-[12.5px] mt-0.5 truncate ${textPrimary}`} style={{ fontFamily: SANS }}>
                    {user.email}
                  </p>
                </div>
              </div>

              {/* Joined */}
              <div className="flex items-center gap-3">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isApex ? "bg-white/[0.06]" : "bg-black/[0.05]"}`}>
                  <Calendar className={`h-3.5 w-3.5 ${textSub}`} />
                </div>
                <div>
                  <p className={`font-mono text-[8px] uppercase tracking-[0.18em] ${textSub}`} style={{ fontFamily: MONO }}>
                    Rebel Since
                  </p>
                  <p className={`font-sans text-[12.5px] mt-0.5 ${textPrimary}`} style={{ fontFamily: SANS }}>
                    {formatDate(user.createdAt)}
                  </p>
                </div>
              </div>
            </div>

            {/* Character description if assigned */}
            <AnimatePresence>
              {persona && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`rounded-xl border ${borderColor} p-4 ${panelBg}`}
                >
                  <p
                    className="font-mono text-[8px] uppercase tracking-[0.28em] mb-2"
                    style={{ fontFamily: MONO, color: accentColor }}
                  >
                    Your Character
                  </p>
                  <h2
                    className={`font-display text-lg leading-tight ${textPrimary} mb-2`}
                    style={{ fontFamily: DISPLAY }}
                  >
                    {persona.name} — {persona.title}
                  </h2>
                  <p
                    className={`font-sans text-[12px] leading-relaxed ${textSub}`}
                    style={{ fontFamily: SANS }}
                  >
                    {persona.tagline}
                  </p>

                  {/* Traits */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(user.preferences?.personalityType?.traits ?? []).slice(0, 4).map((trait) => (
                      <span
                        key={trait}
                        className="rounded-full px-2.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.14em]"
                        style={{
                          fontFamily: MONO,
                          backgroundColor: `${accentColor}18`,
                          color: accentColor,
                          border: `1px solid ${accentColor}30`,
                        }}
                      >
                        {trait}
                      </span>
                    ))}
                  </div>

                 
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Social Links ── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className={`rounded-xl border ${borderColor} p-4 ${panelBg}`}
            >
              <p
                className="font-mono text-[8px] uppercase tracking-[0.28em] mb-3"
                style={{ fontFamily: MONO, color: accentColor }}
              >
                Stay Connected
              </p>
              <div className="flex items-center gap-2">
                {/* Instagram */}
                <a
                  href="https://www.instagram.com/rebelive.official"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group flex items-center gap-2 flex-1 rounded-lg border px-3 py-2.5 transition-all hover:scale-[1.02] active:scale-[0.98] ${borderColor}`}
                  style={{ backgroundColor: isApex ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: accentColor }}>
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                    <circle cx="12" cy="12" r="4"/>
                    <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
                  </svg>
                  <span className={`font-mono text-[8.5px] uppercase tracking-[0.15em] ${textSub}`} style={{ fontFamily: MONO }}>
                    Instagram
                  </span>
                </a>

                {/* LinkedIn */}
                <a
                  href="https://www.linkedin.com/company/rebelive/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group flex items-center gap-2 flex-1 rounded-lg border px-3 py-2.5 transition-all hover:scale-[1.02] active:scale-[0.98] ${borderColor}`}
                  style={{ backgroundColor: isApex ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" style={{ color: accentColor }}>
                    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                    <rect x="2" y="9" width="4" height="12"/>
                    <circle cx="4" cy="4" r="2"/>
                  </svg>
                  <span className={`font-mono text-[8.5px] uppercase tracking-[0.15em] ${textSub}`} style={{ fontFamily: MONO }}>
                    LinkedIn
                  </span>
                </a>

                {/* Facebook */}
                <a
                  href="https://facebook.com/rebelive.official"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group flex items-center gap-2 flex-1 rounded-lg border px-3 py-2.5 transition-all hover:scale-[1.02] active:scale-[0.98] ${borderColor}`}
                  style={{ backgroundColor: isApex ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" style={{ color: accentColor }}>
                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                  </svg>
                  <span className={`font-mono text-[8.5px] uppercase tracking-[0.15em] ${textSub}`} style={{ fontFamily: MONO }}>
                    Facebook
                  </span>
                </a>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* ── Footer ── */}
      <SiteFooter borderColor={borderColor} textColor={textSub} />
    </motion.div>
  );
}
