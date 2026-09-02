import Link from "next/link";

const MONO = "JetBrains Mono, Courier New, monospace";

interface SiteFooterProps {
  borderColor?: string;
  textColor?: string;
  className?: string;
}

/**
 * Shared Footer across all stages and pages:
 * Left: © Oxytrium Dynamics Private Limited
 * Centre: WAKE · FUEL · REBEL
 * Right: Privacy Policy · Terms of Service
 */
export default function SiteFooter({
  borderColor = "border-black/10",
  textColor = "text-black/65",
  className = "",
}: SiteFooterProps) {
  return (
    <footer
      className={`relative z-20 flex w-full items-center justify-between gap-4 px-4 py-2.5 sm:px-10 border-t ${borderColor} ${textColor} ${className}`}
    >
      {/* Left — copyright */}
      <span
        className="font-mono text-[10px] uppercase tracking-[0.18em] shrink-0 hidden sm:block"
        style={{ fontFamily: MONO }}
      >
        © Oxytrium Dynamics Private Limited
      </span>
      {/* Mobile short version */}
      <span
        className="font-mono text-[10px] uppercase tracking-[0.18em] shrink-0 sm:hidden"
        style={{ fontFamily: MONO }}
      >
        © Oxytrium Dynamics
      </span>

      {/* Centre — tagline */}
      <span
        className="font-mono text-[9px] uppercase tracking-[0.3em] shrink-0 mx-auto"
        style={{ fontFamily: MONO }}
      >
        WAKE · FUEL · REBEL
      </span>

      {/* Right — legal links */}
      <div className="flex items-center gap-3 shrink-0">
        <Link
          href="/privacy"
          className="font-mono text-[10px] uppercase tracking-[0.18em] transition-opacity hover:opacity-100"
          style={{ fontFamily: MONO }}
        >
          <span className="hidden sm:inline">Privacy Policy</span>
          <span className="sm:hidden">Privacy</span>
        </Link>
        <span className="opacity-55">·</span>
        <Link
          href="/terms"
          className="font-mono text-[10px] uppercase tracking-[0.18em] transition-opacity hover:opacity-100"
          style={{ fontFamily: MONO }}
        >
          <span className="hidden sm:inline">Terms of Service</span>
          <span className="sm:hidden">Terms</span>
        </Link>
      </div>
    </footer>
  );
}
