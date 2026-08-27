export default function ProgressRail({
  total,
  current,
  tone = "dark",
}: {
  total: number;
  current: number; // 0-indexed
  tone?: "dark" | "light";
}) {
  const idle = tone === "dark" ? "bg-white/15" : "bg-black/15";
  const done = tone === "dark" ? "bg-white" : "bg-black";
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-[3px] w-6 rounded-full transition-colors duration-300 sm:w-8 ${
            i <= current ? done : idle
          }`}
        />
      ))}
    </div>
  );
}
