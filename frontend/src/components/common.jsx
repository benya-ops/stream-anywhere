import { cn } from "@/lib/utils";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";

const STATUS = {
  live: { label: "LIVE", dot: "bg-emerald-500 live-dot", text: "text-emerald-400", bd: "border-emerald-500/30", bg: "bg-emerald-500/10" },
  connected: { label: "CONNECTED", dot: "bg-emerald-500", text: "text-emerald-400", bd: "border-emerald-500/30", bg: "bg-emerald-500/10" },
  ready: { label: "READY", dot: "bg-emerald-500", text: "text-emerald-400", bd: "border-emerald-500/30", bg: "bg-emerald-500/10" },
  healthy: { label: "HEALTHY", dot: "bg-emerald-500", text: "text-emerald-400", bd: "border-emerald-500/30", bg: "bg-emerald-500/10" },
  degraded: { label: "DEGRADED", dot: "bg-amber-500", text: "text-amber-400", bd: "border-amber-500/30", bg: "bg-amber-500/10" },
  transcoding: { label: "TRANSCODING", dot: "bg-amber-500 live-dot", text: "text-amber-400", bd: "border-amber-500/30", bg: "bg-amber-500/10" },
  warning: { label: "WARNING", dot: "bg-amber-500", text: "text-amber-400", bd: "border-amber-500/30", bg: "bg-amber-500/10" },
  standby: { label: "STANDBY", dot: "bg-slate-500", text: "text-slate-400", bd: "border-slate-500/30", bg: "bg-slate-500/10" },
  scheduled: { label: "SCHEDULED", dot: "bg-sky-500", text: "text-sky-400", bd: "border-sky-500/30", bg: "bg-sky-500/10" },
  offline: { label: "OFFLINE", dot: "bg-red-500", text: "text-red-400", bd: "border-red-500/30", bg: "bg-red-500/10" },
  error: { label: "ERROR", dot: "bg-red-500", text: "text-red-400", bd: "border-red-500/30", bg: "bg-red-500/10" },
};

export function StatusBadge({ status, label }) {
  const s = STATUS[status] || STATUS.standby;
  return (
    <span
      data-testid={`status-badge-${status}`}
      className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold border tracking-wider", s.text, s.bd, s.bg)}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {label || s.label}
    </span>
  );
}

export function Readout({ children, className }) {
  return (
    <span className={cn("font-mono text-xs md:text-sm tracking-wide text-emerald-400 bg-slate-950/70 px-2 py-0.5 rounded border border-emerald-500/20 tabular", className)}>
      {children}
    </span>
  );
}

export function CodecChip({ children }) {
  return <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono text-[11px]">{children}</span>;
}

export function StatCard({ label, value, unit, icon: Icon, accent = "sky", spark, delta, testid }) {
  const accents = {
    sky: "text-sky-400", emerald: "text-emerald-400", indigo: "text-indigo-400",
    amber: "text-amber-400", violet: "text-violet-400", red: "text-red-400",
  };
  const stroke = { sky: "#38BDF8", emerald: "#10B981", indigo: "#6366F1", amber: "#F59E0B", violet: "#8B5CF6", red: "#EF4444" }[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      data-testid={testid}
      className="relative overflow-hidden rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5 hover:border-sky-500/40 transition-colors group"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-slate-500">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold text-slate-100 tabular">
            {value}
            {unit && <span className="ml-1 text-base font-medium text-slate-500">{unit}</span>}
          </p>
        </div>
        {Icon && (
          <div className={cn("rounded-md border border-[#1E293B] bg-slate-950/50 p-2", accents[accent])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      {delta != null && (
        <p className={cn("mt-1 font-mono text-xs", delta >= 0 ? "text-emerald-400" : "text-red-400")}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs prev
        </p>
      )}
      {spark && (
        <div className="mt-3 h-10 -mx-1 opacity-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark}>
              <defs>
                <linearGradient id={`g-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={stroke} strokeWidth={1.5} fill={`url(#g-${label})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-100">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function Loading({ label = "Loading engine data…" }) {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="flex items-center gap-3 text-slate-400">
        <span className="h-2.5 w-2.5 rounded-full bg-sky-500 live-dot" />
        <span className="font-mono text-sm">{label}</span>
      </div>
    </div>
  );
}
