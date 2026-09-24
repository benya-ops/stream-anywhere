import { useEffect, useRef, useState } from "react";

// MOCKED live video preview: SMPTE-style bars + moving scanline + audio meter.
// Real decoded video is not available in this sandbox.
export default function StreamPreview({ name, resolution, bitrate, height = "h-full" }) {
  const [level, setLevel] = useState(0.5);
  const ref = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setLevel(0.35 + Math.random() * 0.6), 180);
    return () => clearInterval(id);
  }, []);

  const bars = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];

  return (
    <div className={`relative w-full ${height} overflow-hidden rounded-lg bg-black`}>
      <div className="absolute inset-0 flex">
        {bars.map((c, i) => (
          <div key={i} className="h-full flex-1" style={{ background: c, opacity: 0.55 }} />
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
      <div
        className="pointer-events-none absolute inset-x-0 h-16"
        style={{
          background: "linear-gradient(180deg, transparent, rgba(56,189,248,0.15), transparent)",
          animation: "scan 4s linear infinite",
        }}
      />
      <style>{`@keyframes scan {0%{top:-20%}100%{top:120%}}`}</style>

      <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1">
        <span className="h-2 w-2 rounded-full bg-red-500 live-dot" />
        <span className="font-mono text-[10px] font-bold tracking-wider text-white">REC</span>
      </div>
      <div className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-emerald-400">
        {resolution}
      </div>

      <div className="absolute inset-x-2 bottom-2">
        <div className="mb-1 flex items-end justify-between">
          <span className="truncate font-mono text-[11px] text-white/90">{name}</span>
          <span className="font-mono text-[10px] text-sky-300">{bitrate} Mbps</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[9px] text-white/60">AUD</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full transition-all duration-150"
              style={{
                width: `${level * 100}%`,
                background: level > 0.85 ? "#EF4444" : level > 0.65 ? "#F59E0B" : "#10B981",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
