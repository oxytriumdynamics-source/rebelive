"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { PersonaProfile } from "@/data/personas";
import { RotateCcw, Share2, Check } from "lucide-react";

const MONO = "JetBrains Mono, Courier New, monospace";

function getIssuedDate(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const y = now.getFullYear();
  return `${d}.${m}.${y}`;
}

export default function MemberCard({
  persona,
  memberName = "John Oribase",
}: {
  persona: PersonaProfile;
  memberName?: string;
}) {
  const [flipped, setFlipped] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "loading" | "done">("idle");
  const issuedDate = useMemo(() => getIssuedDate(), []);
  const cardFrontRef = useRef<HTMLDivElement>(null);

  const isApex = persona.id === "APEX";
  const isCapella = persona.id === "CAPELLA";
  const isAviva = persona.id === "AVIVA";


  const [shareError, setShareError] = useState<string | null>(null);

  const shareCard = useCallback(async () => {
    if (!cardFrontRef.current || shareState === "loading") return;
    setShareState("loading");
    setShareError(null);

    try {
      /**
       * dom-to-image-more uses SVG foreignObject — the browser renders the
       * actual DOM natively so all modern CSS (oklab, oklch, color-mix, etc.)
       * works without any parsing. html2canvas was failing on Tailwind v4's
       * oklab() color output.
       */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const domToImage = (await import("dom-to-image-more")) as any;

      const el = cardFrontRef.current;
      const { width, height } = el.getBoundingClientRect();

      const blob: Blob = await domToImage.toBlob(el, {
        width,
        height,
        quality: 1,
        scale: 2,
        style: {
          // Ensure the card face is fully visible (not flipped)
          transform: "none",
          backfaceVisibility: "visible",
        },
      });

      if (!blob) throw new Error("Image export failed");

      const fileName = `rebelive-${persona.id.toLowerCase()}-card.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      // Try native share sheet (mobile — Instagram, WhatsApp, X status, etc.)
      let shared = false;
      if (
        typeof navigator !== "undefined" &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({
            files: [file],
            title: `My REBELIVE ${persona.name} Identity`,
            text: `I'm a ${persona.name} — ${persona.title}. Discover your rebel identity at rebelive.com`,
          });
          shared = true;
        } catch (shareErr: unknown) {
          if (shareErr instanceof Error && shareErr.name === "AbortError") {
            // User cancelled the share sheet — just reset
            setShareState("idle");
            return;
          }
          // Other error — fall through to download
        }
      }

      // Desktop fallback: download the PNG
      if (!shared) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      setShareState("done");
      setTimeout(() => setShareState("idle"), 2500);
    } catch (err) {
      console.error("[ShareCard] Error:", err);
      setShareError("Could not capture card. Try again.");
      setShareState("idle");
      setTimeout(() => setShareError(null), 3000);
    }
  }, [persona, shareState, isApex, isCapella]);

  return (
    <div className="relative flex flex-col items-center gap-3">
      {/* 3D Flip Card Container */}
      <div
        className="relative mx-auto cursor-pointer select-none group"
        style={{
          width: "min(340px, 86vw)",
          height: "min(530px, 66vh)",
          aspectRatio: "1 / 1.56",
          perspective: "1400px",
        }}
        onClick={() => setFlipped((f) => !f)}
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          whileHover={{ y: -6, scale: 1.015 }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          className="relative h-full w-full"
          style={{
            transformStyle: "preserve-3d",
          }}
        >
          {/* ════════════════════════════════════════════════════
              FRONT FACE (Rendered to match the card images exactly)
             ════════════════════════════════════════════════════ */}
          <div
            ref={cardFrontRef}
            className={`absolute inset-0 overflow-hidden rounded-[20px] ${isApex
                ? "bg-[#090909] text-white border border-white/10"
                : isCapella
                  ? "bg-[#f5f5f3] text-[#111110] border border-black/10"
                  : "bg-[#fcfcfc] text-[#111110] border border-black/10"
              }`}
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              boxShadow: isApex
                ? "0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08)"
                : "0 25px 60px -15px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.06)",
            }}
          >
            {/* Background Graphic Illustration from /brand/ */}
            <div className="absolute inset-0 pointer-events-none">
              {isApex && (
                <div className="relative h-full w-full opacity-90">
                    <Image
                      src="/brand/APEX.png"
                      alt="APEX Topography"
                      fill
                      priority
                    sizes="340px"
                    className="object-cover object-[20%_45%]"
                    />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#090909]/90 via-transparent to-transparent" />
                </div>
              )}

              {isCapella && (
                <div className="relative h-full w-full opacity-95">
                    <Image
                      src="/brand/Capella.png"
                      alt="Capella Constellation"
                      fill
                      priority
                    sizes="340px"
                    className="object-cover object-[22%_18%]"
                    />
                </div>
              )}

              {isAviva && (
                <div className="relative h-full w-full">
                    <Image
                      src="/brand/Aviva.png"
                    alt="Aviva Sakura & Fuji"
                      fill
                      priority
                        sizes="340px"
                    className="object-cover object-[52%_bottom]"
                      />
                  {/* Subtle fade on left bottom to ensure text clarity */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/70 via-transparent to-transparent" />
                </div>
              )}
            </div>

            {/* Front Top Bar: REBELIVE Logo + Panther Badge */}
            <div className="relative z-10 flex items-center justify-between p-6">
              {/* REBELIVE Wordmark (Bigger & Uniform) */}
              <div className="relative h-8 w-36">
                <Image
                  src="/brand/REBELIVE Logo Black.png"
                  alt="REBELIVE"
                  fill
                  priority
                  sizes="160px"
                  className="object-contain object-left"
                  style={isApex ? { filter: "invert(1) brightness(1.2)" } : undefined}
                />
              </div>

              {/* Panther Insignia Badge (Uniform as CAPELLA) */}
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full  p-1 shadow-sm ${
                  isApex
                    ? "border-white/50 bg-black/60 backdrop-blur-xs"
                    : "border-black bg-white"
                }`}
              >
                <div className="relative h-full w-full">
                  <Image
                    src={isApex ? "/brand/panther_white_icon-transparent.png" : "/brand/panther white icon.jpeg"}
                    alt="Panther Emblem"
                    fill
                    sizes="36px"
                    className="object-contain"
                    style={!isApex ? { filter: "invert(1)" } : undefined}
                  />
                </div>
              </div>
            </div>

            {/* Vertical Coordinates on the Edge (Top to Bottom) */}
            {isAviva && (
              <div
                className="absolute left-4 top-28 z-10 font-mono text-[9px] tracking-[0.25em] text-black/75"
                style={{
                  fontFamily: MONO,
                  writingMode: "vertical-rl",
                }}
              >
                35°30&apos;04.3&quot;N, 138°48&apos;05.0&quot;E
              </div>
            )}

            {isCapella && (
              <div
                className="absolute right-4 top-28 z-10 font-mono text-[9px] tracking-[0.22em] text-black/75"
                style={{
                  fontFamily: MONO,
                  writingMode: "vertical-rl",
                }}
              >
                RA 05h 16m 41.4s | Dec +45° 59&apos; 53&quot;
              </div>
            )}

            {isApex && (
              <div
                className="absolute right-4 top-28 z-10 font-mono text-[9px] tracking-[0.25em] text-white/75"
                style={{
                  fontFamily: MONO,
                  writingMode: "vertical-rl",
                }}
              >
                27°59&apos;17&quot;N 86°55&apos;31&quot;E
              </div>
            )}

            {/* Front Bottom Info: Name + Dash + Persona Name in Custom Font */}
            <div className="absolute bottom-6 left-6 z-10 flex flex-col">
              {isApex ? (
                <>
                  <p
                    className="text-[18px] font-semibold leading-snug text-white/80"
                    style={{ fontFamily: "Inter, -apple-system, sans-serif", maxWidth: "10rem" }}
                  >
                    {memberName.split(" ")[0]}<br />{memberName.split(" ").slice(1).join(" ")}
                  </p>
                  <div className="my-2.5 h-[1.5px] w-6 bg-white/70" />
                  <h2
                    className="text-4xl leading-none tracking-wider text-white"
                    style={{
                      fontFamily: persona.fontFamily,
                      textShadow: "0 2px 10px rgba(0,0,0,0.5)",
                    }}
                  >
                    APEX
                  </h2>
                </>
              ) : isCapella ? (
                <>
                  <p
                    className="text-[15px] font-medium leading-snug text-black/70"
                    style={{ fontFamily: "Inter, -apple-system, sans-serif", maxWidth: "9rem" }}
                  >
                    {memberName.split(" ")[0]}<br />{memberName.split(" ").slice(1).join(" ")}
                  </p>
                  <div className="mb-2.5 h-[1.5px] w-6 bg-black/70" />
                  <h2
                    className="mt-3 text-3xl leading-none tracking-[0.02em] text-[#111110]"
                    style={{
                      fontFamily: persona.fontFamily,
                    }}
                  >
                    CAPELLA
                  </h2>
                </>
              ) : (
                <>
                  <p
                    className="text-[15px] font-medium leading-snug text-black/70"
                    style={{ fontFamily: "Inter, -apple-system, sans-serif", maxWidth: "9rem" }}
                  >
                    {memberName.split(" ")[0]}<br />{memberName.split(" ").slice(1).join(" ")}
                  </p>
                  <div className="mb-2.5 h-[1.5px] w-6 bg-black/70" />
                  <h2
                    className="mt-2 text-4xl leading-none tracking-wider text-[#111110]"
                    style={{
                      fontFamily: persona.fontFamily,
                    }}
                  >
                    AVIVA
                  </h2>
                </>
              )}
            </div>

            {/* Subtle interactive flip hint */}
            <div className="absolute bottom-2 right-3 z-10 flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 backdrop-blur-sm">
              <RotateCcw className="h-2 w-2 text-white/70" />
              <span className="font-mono text-[7.5px] uppercase tracking-[0.2em] text-white/80" style={{ fontFamily: MONO }}>
                Flip
              </span>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════
              BACK FACE (Privileges, Exact Quotes & Fuel Tagline)
             ════════════════════════════════════════════════════ */}
          <div
            className={`absolute inset-0 flex flex-col justify-between overflow-hidden p-6 rounded-[20px] select-none transition-all duration-300 ${isApex
                ? "bg-[#090909] text-white border border-white/15"
                : isCapella
                  ? "bg-[#f5f5f3] text-[#111110] border border-black/12"
                  : "bg-[#fcfcfc] text-[#111110] border border-black/12"
              }`}
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              boxShadow: isApex
                ? "0 30px 70px -15px rgba(0, 0, 0, 0.95), 0 15px 35px -10px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.12), inset 0 1px 1px 0 rgba(255, 255, 255, 0.25)"
                : "0 30px 70px -15px rgba(0, 0, 0, 0.32), 0 15px 35px -10px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.08), inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.95)",
            }}
          >
            {/* Background Watermark Elements on Back */}
            {isApex && (
              <div className="pointer-events-none absolute inset-0 opacity-[0.08]">
                <Image
                  src="/brand/APEX.png"
                  alt="Watermark"
                  fill
                  sizes="340px"
                  className="object-cover"
                />
              </div>
            )}
            {isCapella && (
              <div className="pointer-events-none absolute inset-0 opacity-[0.06]">
                <Image
                  src="/brand/Capella.png"
                  alt="Watermark"
                  fill
                  sizes="340px"
                  className="object-cover"
                />
              </div>
            )}
            {isAviva && (
              <div className="pointer-events-none absolute inset-0 opacity-[0.06]">
                <Image
                  src="/brand/Aviva.png"
                  alt="Watermark"
                  fill
                  sizes="340px"
                  className="object-cover object-right"
                />
              </div>
            )}

            {/* Back Top Bar: REBELIVE Logo */}
            <div
              className="relative z-10 flex items-center justify-between border-b pb-2.5"
              style={{
                borderColor: isApex ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)",
              }}
            >
              <div className="relative h-7 w-32">
                <Image
                  src="/brand/REBELIVE Logo Black.png"
                  alt="REBELIVE"
                  fill
                  priority
                  sizes="140px"
                  className="object-contain object-left"
                  style={isApex ? { filter: "invert(1) brightness(1.2)" } : undefined}
                />
              </div>
            </div>

            {/* Coordinates shifted below the logo line */}
            <div className="relative z-10 flex items-center justify-between pt-1.5 pb-0.5">
              <span
                className="font-mono text-[8px] uppercase tracking-[0.2em]"
                style={{
                  fontFamily: MONO,
                  color: isApex ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
                }}
              >
                {persona.coordinate}
              </span>
            </div>

            {/* Back Body Content */}
            <div className="relative z-10 my-auto flex flex-col gap-3 py-1">
              {/* Persona Title Header */}
              <div>
                <h2 className="flex items-baseline gap-2 leading-none">
                  <span
                    className="text-2xl tracking-tight"
                    style={{
                      fontFamily: persona.fontFamily,
                      color: isApex ? "#ffffff" : "#0a0a0a",
                    }}
                  >
                    {persona.name}
                  </span>
                  <span
                    className="font-mono text-[12px] font-semibold uppercase tracking-[0.18em]"
                    style={{
                      fontFamily: MONO,
                      color: isApex ? "rgba(255,255,255,0.5)" : isCapella ? "#c8922a" : "#e8628a",
                    }}
                  >
                    : {persona.cardSubtitle}
                  </span>
                </h2>
              </div>

              {/* Quote Block */}
              <div
                className="space-y-1.5 border-l-2 pl-3 py-0.5"
                style={{
                  borderColor: isApex ? "rgba(255,255,255,0.25)" : isCapella ? "#c8922a" : "#e8628a",
                }}
              >
                <p
                  className="text-[12px] font-medium leading-snug"
                  style={{
                    color: isApex ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.85)",
                  }}
                >
                  {persona.backQuote1}
                </p>
                <p
                  className="text-[11.5px] leading-snug"
                  style={{
                    color: isApex ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)",
                  }}
                >
                  {persona.backQuote2}
                </p>
              </div>

              {/* Privilege Section */}
              <div
                className="relative rounded-lg p-3 space-y-1"
                style={{
                  backgroundColor: isApex ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                  border: isApex ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.06)",
                }}
              >
                <p
                  className="font-mono text-[8px] font-bold uppercase tracking-[0.25em]"
                  style={{
                    fontFamily: MONO,
                    color: isApex ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.45)",
                  }}
                >
                  {persona.privilegeHeader}
                </p>
                <p
                  className="font-mono text-[11px] font-bold tracking-[0.08em]"
                  style={{
                    fontFamily: MONO,
                    color: isApex ? "#ffffff" : "#0a0a0a",
                  }}
                >
                  {persona.privilegeCases}
                </p>
                <p
                  className="font-mono text-[8.5px] tracking-[0.12em] pt-0.5"
                  style={{
                    fontFamily: MONO,
                    color: isApex ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.45)",
                  }}
                >
                  {persona.formula}
                </p>
                {/* *T & C applied inside the privilege box just above its bottom border */}
                <div className="flex justify-end pt-1">
                  <span
                    className="font-mono text-[7px] uppercase tracking-[0.08em]"
                    style={{
                      fontFamily: MONO,
                      color: isApex ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
                    }}
                  >
                    *T &amp; C applied.
                  </span>
                </div>
              </div>

              {/* Issued Date */}
              <div
                className="flex items-center justify-between font-mono text-[8.5px] uppercase tracking-[0.2em]"
                style={{
                  fontFamily: MONO,
                  color: isApex ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.45)",
                }}
              >
                <span>ISSUED: {issuedDate}</span>
                <span className="opacity-40">MEMBER ID</span>
              </div>
            </div>

            {/* Back Footer Bar */}
            <div
              className="relative z-10 flex items-center justify-between border-t pt-3"
              style={{
                borderColor: isApex ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)",
              }}
            >
              <p
                className="text-[10px] font-medium tracking-[0.03em]"
                style={{
                  color: isApex ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.75)",
                }}
              >
                {persona.fuelTagline}
              </p>

              {/* Transparent Mascot Emblem */}
              <div className="relative h-6 w-6 opacity-70">
                <Image
                  src="/brand/panther_white_icon-transparent.png"
                  alt="Seal"
                  fill
                  sizes="24px"
                  className="object-contain"
                  style={!isApex ? { filter: "brightness(0)" } : undefined}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Sub-card actions row */}
      <div className="flex items-center gap-4">
        {/* Flip hint */}
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.22em] transition-opacity hover:opacity-60"
          style={{
            fontFamily: MONO,
            color: isApex ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)",
          }}
        >
          <RotateCcw className="h-3 w-3" />
          {flipped ? "View front" : "Flip card"}
        </button>

        <span
          className="h-3 w-px"
          style={{ backgroundColor: isApex ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }}
        />

        {/* Share button */}
        <button
          type="button"
          onClick={shareCard}
          disabled={shareState === "loading"}
          className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.22em] transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{
            fontFamily: MONO,
            color: shareState === "done"
              ? (isApex ? "#d8ac52" : isCapella ? "#c8922a" : "#e8628a")
              : isApex ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.65)",
          }}
        >
          {shareState === "done" ? (
            <Check className="h-3 w-3" />
          ) : shareState === "loading" ? (
            <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
          ) : (
            <Share2 className="h-3 w-3" />
          )}
          {shareState === "done" ? "Saved!" : "Share card"}
        </button>
      </div>

      {/* Share label */}
      <p
        className="font-mono text-[8px] uppercase tracking-[0.28em] -mt-1"
        style={{
          fontFamily: MONO,
          color: isApex ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)",
        }}
      >
        {shareError
          ? shareError
          : "Share to Instagram · WhatsApp · X Status"}
      </p>
    </div>
  );
}

