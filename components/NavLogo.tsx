import Image from "next/image";

/**
 * NavLogo — uses the real REBELIVE brand PNG from /public/brand.
 * tone="light" → use on off-white/light backgrounds (shows black logo)
 * tone="dark"  → use on dark backgrounds (inverts to white)
 */
export default function NavLogo({
  tone = "light",
  width = 180,
  className = "",
}: {
  tone?: "light" | "dark";
  width?: number;
  className?: string;
}) {
  return (
    <div className={`relative flex items-center ${className}`} style={{ width, height: width * 0.32 }}>
      <Image
        src="/brand/REBELIVE Logo Black.png"
        alt="REBELIVE"
        fill
        priority
        sizes="(max-width: 840px) 240px, 360px"
        className="object-contain object-left"
        style={tone === "dark" ? { filter: "invert(1) brightness(1.1)" } : undefined}
      />
    </div>
  );
}
