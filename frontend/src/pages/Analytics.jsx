import { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, Loading, Readout, StatusBadge } from "@/components/common";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const RANGES = ["1h", "6h", "24h"];
const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "K" : n);

export default function Analytics() {
  const [range, setRange] = useState("1h");
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api.get(`/analytics?range=${range}`).then((r) => setData(r.data));
  }, [range]);

  if (!data) return <Loading />;

  const label = (t) => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const viewers = data.viewers.map((p) => ({ t: label(p.t), v: Math.round(p.v) }));
  const bw = data.egress.map((p, i) => ({ t: label(p.t), egress: p.v, ingest: data.ingest[i]?.v || 0 }));
  const loss = data.packet_loss.map((p) => ({ t: label(p.t), v: p.v }));

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics & Diagnostics" subtitle="Audience trends, delivery throughput and network quality metrics.">
        <div className="flex rounded-lg border border-[#1E293B] p-1">
          {RANGES.map((r) => (
            <button key={r} data-testid={`range-${r}`} onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${range === r ? "bg-sky-500/15 text-sky-300" : "text-slate-400 hover:text-slate-200"}`}>
              {r}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Concurrent Viewers (CCU)" color="#6366F1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={viewers}>
              <defs><linearGradient id="v1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366F1" stopOpacity={0.4} /><stop offset="100%" stopColor="#6366F1" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis dataKey="t" stroke="#475569" fontSize={11} minTickGap={40} tickLine={false} />
              <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={fmt} />
              <Tooltip contentStyle={tip} />
              <Area type="monotone" dataKey="v" stroke="#6366F1" strokeWidth={2} fill="url(#v1)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Ingest vs Egress (Mbps)" color="#10B981">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={bw}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis dataKey="t" stroke="#475569" fontSize={11} minTickGap={40} tickLine={false} />
              <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tip} />
              <Line type="monotone" dataKey="egress" stroke="#10B981" strokeWidth={2} dot={false} name="Egress" />
              <Line type="monotone" dataKey="ingest" stroke="#06B6D4" strokeWidth={2} dot={false} name="Ingest" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Packet Loss (%)" color="#EF4444">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={loss}>
              <defs><linearGradient id="l1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#EF4444" stopOpacity={0.4} /><stop offset="100%" stopColor="#EF4444" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis dataKey="t" stroke="#475569" fontSize={11} minTickGap={40} tickLine={false} />
              <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tip} />
              <Area type="monotone" dataKey="v" stroke="#EF4444" strokeWidth={2} fill="url(#l1)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5">
          <h3 className="mb-4 font-mono text-xs uppercase tracking-widest text-slate-400">Top Channels by Audience</h3>
          <div className="space-y-3">
            {data.top_streams.map((s, i) => (
              <div key={s.id} data-testid={`top-${s.id}`} className="flex items-center gap-3">
                <span className="font-display text-lg font-bold text-slate-600">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm text-slate-200">{s.name}</span>
                    <Readout>{fmt(s.metrics.viewers)}</Readout>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-500"
                      style={{ width: `${Math.min(100, (s.metrics.viewers / (data.top_streams[0].metrics.viewers || 1)) * 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const tip = { background: "#0F172A", border: "1px solid #1E293B", borderRadius: 8, fontSize: 12 };

function ChartCard({ title, children }) {
  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5">
      <h3 className="mb-4 font-mono text-xs uppercase tracking-widest text-slate-400">{title}</h3>
      <div className="h-56">{children}</div>
    </div>
  );
}
