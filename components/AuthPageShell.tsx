"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NavLogo from "./NavLogo";
import HalftoneField from "./HalftoneField";
import EverestPattern from "./EverestPattern";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  ArrowLeft,
  Phone,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  registerUser,
  loginUser,
  sendOtp,
  verifyOtp,
  googleLogin,
  clearError,
  claimPersona,
} from "@/store/slices/authslice";

const MONO = "JetBrains Mono, Courier New, monospace";
const DISPLAY = "Anton, Arial Narrow, sans-serif";
const SANS = "Inter, -apple-system, sans-serif";

// ── Stage types ──────────────────────────────────────────
type Mode = "signup" | "login";
type Stage = "form" | "otp" | "done";

// ── Glow rings canvas ────────────────────────────────────
function GlowRings() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = 280;
    canvas.height = 280;
    let frame = 0;
    let raf: number;
    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const t = frame * 0.016;
      for (let ring = 0; ring < 5; ring++) {
        const r = 30 + ring * 24 + Math.sin(t * 0.8 + ring * 1.1) * 6;
        const alpha = (0.18 - ring * 0.032) * (0.5 + 0.5 * Math.sin(t * 0.6 + ring));
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(216,172,82,${Math.max(0, alpha)})`;
        ctx.lineWidth = ring === 0 ? 1.5 : 1;
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.25);
      ctx.beginPath();
      ctx.arc(0, 0, 46, 0, Math.PI * 1.4);
      ctx.strokeStyle = `rgba(255,255,255,${0.06 + 0.04 * Math.sin(t)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-t * 0.18);
      ctx.beginPath();
      ctx.arc(0, 0, 64, 0, Math.PI * 0.9);
      ctx.strokeStyle = `rgba(216,172,82,${0.05 + 0.03 * Math.sin(t * 1.2)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      for (let p = 0; p < 10; p++) {
        const angle = (p / 10) * Math.PI * 2 + t * (p % 2 === 0 ? 0.3 : -0.25);
        const radius = 52 + (p % 3) * 18 + Math.sin(t + p * 0.8) * 5;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        ctx.beginPath();
        ctx.arc(px, py, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(216,172,82,${0.12 + 0.1 * Math.sin(t * 1.4 + p)})`;
        ctx.fill();
      }
      frame++;
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas ref={canvasRef} style={{ width: 220, height: 220 }} className="absolute inset-0 m-auto" />
  );
}

// ── OTP Input ────────────────────────────────────────────
function OtpInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, " ").split("").slice(0, 6).map(d => d.trim());

  function handleChange(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const char = e.target.value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[idx] = char;
    onChange(next.join(""));
    if (char && idx < 5) inputsRef.current[idx + 1]?.focus();
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    onChange(pasted.padEnd(6, "").slice(0, 6));
    inputsRef.current[Math.min(pasted.length, 5)]?.focus();
  }

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {digits.map((d, idx) => (
        <input
          key={idx}
          ref={(el) => { inputsRef.current[idx] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={(e) => handleChange(idx, e)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          className="w-10 h-12 text-center text-xl font-mono border border-black/20 bg-white/70 text-ink outline-none transition-all focus:border-ink focus:bg-white focus:scale-105"
          style={{ fontFamily: MONO }}
          aria-label={`OTP digit ${idx + 1}`}
          id={`otp-digit-${idx + 1}`}
        />
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────
export default function AuthPageShell() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { loading, error, otpSent, otpVerifying, otpError, user, isAuthenticated } =
    useAppSelector((s) => s.auth);

  const [mode, setMode] = useState<Mode>("login");
  const [stage, setStage] = useState<Stage>("form");

  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);

  // OTP
  const [otp, setOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Redirect on successful auth + auto-claim pending persona
  useEffect(() => {
    if (isAuthenticated && user) {
      // If they came from the quiz result page, claim their pending persona
      if (typeof window !== 'undefined') {
        const pending = sessionStorage.getItem('pendingPersona');
        if (pending) {
          sessionStorage.removeItem('pendingPersona');
          dispatch(claimPersona(pending.toLowerCase()));
        }
      }
      router.push("/");
    }
  }, [isAuthenticated, user, router, dispatch]);

  // Go to OTP stage when backend confirms OTP was sent
  useEffect(() => {
    if (otpSent && stage === "form") {
      setStage("otp");
    }
  }, [otpSent, stage]);

  // Clear errors when switching modes/stages
  useEffect(() => {
    dispatch(clearError());
  }, [mode, stage, dispatch]);

  // Resend countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // ── Handlers ──────────────────────────────────────────
  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup") {
      dispatch(
        registerUser({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password,
          phone: phone.trim(),
        })
      );
    } else {
      dispatch(loginUser({ email: email.trim(), password }));
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) return;
    dispatch(verifyOtp({ email: email.trim(), otp }));
  }

  const handleResend = useCallback(() => {
    if (resendCooldown > 0) return;
    dispatch(sendOtp(email.trim()));
    setResendCooldown(60);
    setOtp("");
  }, [dispatch, email, resendCooldown]);

  function switchMode(m: Mode) {
    setMode(m);
    setStage("form");
    setOtp("");
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setPassword("");
  }

  // ── Right panel ─────────────────────────────────────────
  const RightPanel = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.12 }}
      className="relative hidden h-full flex-col justify-between p-8 md:flex md:w-2/5 lg:w-1/3 lg:p-10 xl:p-12 overflow-hidden bg-[#0a0a0a]"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 65% at 50% 48%, rgba(216,172,82,0.1), transparent 70%)",
          animation: "glowPulse 4s ease-in-out infinite",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)",
        }}
      />
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-5 text-center my-auto">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="relative"
          style={{ width: 220, height: 220, animation: "floatY 7s ease-in-out infinite" }}
        >
          <GlowRings />
          <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 2 }}>
            <div style={{ position: "relative", width: 150, height: 150 }}>
              <Image
                src="/brand/panther_white_icon-transparent.png"
                alt="REBELIVE Mascot"
                fill
                sizes="150px"
                className="object-contain"
                style={{ opacity: 0.95 }}
              />
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.5 }}
        >
          <h2
            className="font-display text-white"
            style={{ fontFamily: DISPLAY, fontSize: "clamp(1.2rem, 2.2vw, 1.6rem)", lineHeight: 1.15 }}
          >
            Wake. Fuel. Rebel.
          </h2>
          <p
            className="mt-2.5 text-[11px] leading-relaxed text-white/40 mx-auto"
            style={{ fontFamily: SANS, maxWidth: "16rem" }}
          >
            Five questions. Thirty possible paths. One version of you, revealed.
          </p>
        </motion.div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.65 }}
        className="relative z-10 flex items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.04] p-3.5"
      >
        <div className="flex -space-x-2">
          {[{ bg: "#d8ac52", l: "A" }, { bg: "#5a6070", l: "C" }, { bg: "#c0c0ba", l: "V" }].map(({ bg, l }) => (
            <div
              key={l}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 font-display text-[10px]"
              style={{ backgroundColor: bg, color: "#0a0a0a" }}
            >
              {l}
            </div>
          ))}
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 font-mono text-[9px] text-white/40"
            style={{ backgroundColor: "rgba(255,255,255,0.07)" }}
          >
            +2
          </div>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/40" style={{ fontFamily: MONO }}>
            Join the pack
          </p>
          <p className="font-mono text-[8.5px] text-white/20 mt-0.5" style={{ fontFamily: MONO }}>
            Claim your annual rebel drop
          </p>
        </div>
      </motion.div>
    </motion.div>
  );

  // ── OTP Stage ────────────────────────────────────────────
  const OtpStage = (
    <div className="w-full max-w-[420px]">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-5 w-5 text-amber-600" />
          <h1
            className="font-display leading-none text-ink text-3xl sm:text-4xl"
            style={{ fontFamily: DISPLAY }}
          >
            Verify Your Email
          </h1>
        </div>
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ash" style={{ fontFamily: MONO }}>
          Enter the 6-digit code sent to
        </p>
        <p className="font-mono text-[11px] text-ink mt-1" style={{ fontFamily: MONO }}>
          {email || "your email"}
        </p>
      </div>

      <form onSubmit={handleVerifyOtp} className="flex flex-col gap-5">
        <OtpInput value={otp} onChange={setOtp} />

        {otpError && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center text-[11px] text-red-600"
            style={{ fontFamily: SANS }}
          >
            {otpError}
          </motion.p>
        )}

        <button
          type="submit"
          disabled={otp.length !== 6 || otpVerifying}
          id="verify-otp-btn"
          className="group flex items-center justify-center gap-2 bg-ink py-3 sm:py-3.5 font-mono text-[10.5px] uppercase tracking-[0.2em] text-paper transition-all duration-200 hover:bg-ink/85 active:scale-[0.98] disabled:opacity-50 shadow-md"
          style={{ fontFamily: MONO }}
        >
          {otpVerifying ? (
            "VERIFYING…"
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              VERIFY & CONTINUE
            </>
          )}
        </button>

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => { setStage("form"); setOtp(""); dispatch(clearError()); }}
            className="font-mono text-[9px] uppercase tracking-[0.15em] text-ash hover:text-ink transition-colors flex items-center gap-1"
            style={{ fontFamily: MONO }}
          >
            <ArrowLeft className="h-3 w-3" />
            Back
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="font-mono text-[9px] uppercase tracking-[0.15em] text-ash hover:text-ink transition-colors flex items-center gap-1.5 disabled:opacity-40"
            style={{ fontFamily: MONO }}
          >
            <RefreshCw className="h-3 w-3" />
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
          </button>
        </div>
      </form>
    </div>
  );

  // ── Form Stage ───────────────────────────────────────────
  const FormStage = (
    <div className="w-full max-w-[420px]">
      {/* Heading */}
      <div className="mb-3 text-left">
        <AnimatePresence mode="wait">
          <motion.h1
            key={mode}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="font-display leading-none text-ink text-2xl sm:text-3xl"
            style={{ fontFamily: DISPLAY }}
          >
            {mode === "signup" ? "Create Account" : "Sign In"}
          </motion.h1>
        </AnimatePresence>
        <p className="font-mono mt-1 text-[8.5px] uppercase tracking-[0.22em] text-ash" style={{ fontFamily: MONO }}>
          {mode === "signup" ? "Join the rebel pack." : "Welcome back, rebel."}
        </p>
      </div>

      <form onSubmit={handleFormSubmit} className="flex flex-col gap-2">
        <AnimatePresence>
          {mode === "signup" && (
            <>
              {/* First + Last name row */}
              <motion.div
                key="names"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="flex gap-2 overflow-hidden"
              >
                <div className="relative flex-1">
                  <User className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ash" />
                  <input
                    id="first-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    aria-label="First name"
                    className="w-full border border-black/15 bg-white/60 py-2 sm:py-2.5 pl-9 pr-3 text-[12px] text-ink placeholder:text-ash/50 outline-none transition-all focus:border-ink focus:bg-white"
                    style={{ fontFamily: SANS }}
                    required
                  />
                </div>
                <div className="relative flex-1">
                  <input
                    id="last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    aria-label="Last name"
                    className="w-full border border-black/15 bg-white/60 py-2 sm:py-2.5 px-3 text-[12px] text-ink placeholder:text-ash/50 outline-none transition-all focus:border-ink focus:bg-white"
                    style={{ fontFamily: SANS }}
                    required
                  />
                </div>
              </motion.div>

              {/* Phone */}
              <motion.div
                key="phone"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, delay: 0.04 }}
                className="relative overflow-hidden"
              >
                <Phone className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ash" />
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number"
                  aria-label="Phone number"
                  className="w-full border border-black/15 bg-white/60 py-2 sm:py-2.5 pl-9 pr-4 text-[12px] text-ink placeholder:text-ash/50 outline-none transition-all focus:border-ink focus:bg-white"
                  style={{ fontFamily: SANS }}
                  required
                  minLength={10}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Email */}
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ash" />
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            aria-label="Email address"
            className="w-full border border-black/15 bg-white/60 py-2 sm:py-2.5 pl-9 pr-4 text-[12px] text-ink placeholder:text-ash/50 outline-none transition-all focus:border-ink focus:bg-white"
            style={{ fontFamily: SANS }}
            required
          />
        </div>

        {/* Password */}
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ash" />
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 chars)"
            aria-label="Password"
            className="w-full border border-black/15 bg-white/60 py-2 sm:py-2.5 pl-9 pr-10 text-[12px] text-ink placeholder:text-ash/50 outline-none transition-all focus:border-ink focus:bg-white"
            style={{ fontFamily: SANS }}
            required
            minLength={8}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ash hover:text-ink transition-colors"
            aria-label="Toggle password visibility"
          >
            {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Remember / Forgot */}
        {mode === "login" && (
          <div className="flex items-center justify-between pt-0.5">
            <label className="flex cursor-pointer items-center gap-2">
              <div
                onClick={() => setRemember(!remember)}
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border transition-colors ${remember ? "border-ink bg-ink" : "border-black/25"}`}
              >
                {remember && (
                  <svg className="h-2 w-2 text-paper" viewBox="0 0 10 10" fill="none">
                    <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-ash" style={{ fontFamily: MONO }}>
                Remember me
              </span>
            </label>
            <button type="button" className="font-mono text-[9px] uppercase tracking-[0.15em] text-ash hover:text-ink transition-colors" style={{ fontFamily: MONO }}>
              Forgot password?
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[11px] text-red-600"
            style={{ fontFamily: SANS }}
          >
            {error}
          </motion.p>
        )}

        {/* Submit */}
        <button
          type="submit"
          id="auth-submit-btn"
          disabled={loading}
          className="group mt-0.5 flex items-center justify-center gap-2 bg-ink py-2.5 font-mono text-[10.5px] uppercase tracking-[0.2em] text-paper transition-all duration-200 hover:bg-ink/85 active:scale-[0.98] disabled:opacity-60 shadow-md"
          style={{ fontFamily: MONO }}
        >
          {loading
            ? "PROCESSING…"
            : mode === "signup"
            ? "CREATE MY REBEL ID"
            : "SIGN IN"}
          {!loading && <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />}
        </button>
      </form>

      {/* Mode toggle */}
      <div className="mt-2.5 text-center">
        <span className="font-mono text-[10px] text-ash" style={{ fontFamily: MONO }}>
          {mode === "signup" ? "Already have an account? " : "Don't have an account? "}
        </span>
        <button
          onClick={() => switchMode(mode === "signup" ? "login" : "signup")}
          className="font-mono text-[10px] text-ink underline underline-offset-2 hover:opacity-70 transition-opacity"
          style={{ fontFamily: MONO }}
        >
          {mode === "signup" ? "Sign in" : "Sign up"}
        </button>
      </div>

      {/* Divider */}
      <div className="relative flex items-center gap-3 mt-2">
        <div className="h-px flex-1 bg-black/10" />
        <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-ash" style={{ fontFamily: MONO }}>
          or
        </span>
        <div className="h-px flex-1 bg-black/10" />
      </div>

      {/* Google OAuth */}
      <div className="mt-2">
        <button
          type="button"
          id="google-login-btn"
          onClick={googleLogin}
          className="flex w-full items-center justify-center gap-2.5 border border-black/15 bg-white/70 py-2 px-4 font-mono text-[10px] uppercase tracking-[0.16em] text-ink transition-all hover:bg-white hover:border-black/30 shadow-xs"
          style={{ fontFamily: MONO }}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span>Continue with Google</span>
        </button>
      </div>
    </div>
  );

  // ── Shell ─────────────────────────────────────────────────
  return (
    <div className="relative h-[100dvh] w-full flex flex-col md:flex-row overflow-hidden bg-[#f0efeb]">

      {/* LEFT — Form pane */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="relative flex h-full w-full flex-1 flex-col justify-between overflow-hidden p-4 sm:p-6 md:w-3/5 md:p-8 lg:w-2/3 lg:p-10 xl:p-12"
        style={{ backgroundColor: "#f0efeb" }}
      >
        <HalftoneField />
        <EverestPattern opacity={0.18} />

        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between gap-4 pb-2">
          <Link
            href="/"
            className="group flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ash transition-colors hover:text-ink"
            style={{ fontFamily: MONO }}
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            Back
          </Link>
          <NavLogo tone="light" width={160} />
        </div>

        {/* Centre */}
        <div className="relative z-10 flex w-full flex-1 min-h-0 items-center justify-center py-2">
          <AnimatePresence mode="wait">
            {stage === "form" && (
              <motion.div
                key="form-stage"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.25 }}
                className="w-full flex justify-center"
              >
                {FormStage}
              </motion.div>
            )}
            {stage === "otp" && (
              <motion.div
                key="otp-stage"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="w-full flex justify-center"
              >
                {OtpStage}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between pt-2 border-t border-black/5">
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-ash/60" style={{ fontFamily: MONO }}>
            Wake · Fuel · Rebel
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-ash/60" style={{ fontFamily: MONO }}>
            © REBELIVE
          </span>
        </div>
      </motion.div>

      {/* RIGHT — Dark branded panel */}
      {RightPanel}
    </div>
  );
}
