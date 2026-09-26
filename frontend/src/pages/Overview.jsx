import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth, canAccess } from "@/context/AuthContext";
import { StatCard, PageHeader, Loading, StatusBadge, Readout } from "@/components/common";
import StreamPreview from "@/components/StreamPreview";
import { Radio, Users2, ArrowUpFromLine, ArrowDownToLine, Cpu, Activity } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";

const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "K" : n);

export default function Overview() {
  const { user } = useAuth();
  const [ov, setOv] = useState(null);
  const [an, setAn] = useState(null);
  const [streams, setStreams] = useState([]);

  const canAnalytics = canAccess(user, "analytics");
  const canStreams = canAccess(user, "streams");

  const load = async () => {
    try {
      const o = await api.get("/overview");
      setOv(o.data);
    } catch (e) { /* overview is always allowed */ }
    if (canAnalytics) {
      try { const a = await api.get("/analytics?range=1h"); setAn(a.data); } catch (e) { /* ignore */ }
    }
    if (canStreams) {
      try { const s = await api.get("/streams"); setStreams(s.data); } catch (e) { /* ignore */ }
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ov) return <Loading />;

  const chartData = an ? an.egress.map((p, i) => ({
    t: new Date(p.t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    egress: p.v,
    viewers: Math.round((an.viewers[i]?.v || 0) / 20),
  })) : [];

  const live = streams.filter((s) => s.status === "live");

  return (
    <div className="space-y-6">
      <PageHeader title="Mission Control" subtitle="Real-time overview of all broadcast operations across edge nodes." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard testid="stat-live" label="Live Channels" value={ov.live_count} unit={`/ ${ov.total_streams}`} icon={Radio} accent="emerald" spark={an?.ingest} />
        <StatCard testid="stat-viewers" label="Concurrent Viewers" value={fmt(ov.total_viewers)} icon={Users2} accent="indigo" spark={an?.viewers} />
        <StatCard testid="stat-egress" label="Egress Bandwidth" value={ov.egress_mbps} unit="Mbps" icon={ArrowUpFromLine} accent="sky" spark={an?.egress} />
        <StatCard testid="stat-ingest" label="Ingest Bandwidth" value={ov.ingest_mbps} unit="Mbps" icon={ArrowDownToLine} accent="violet" spark={an?.ingest} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {an && (
        <div className="lg:col-span-2 rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">Bandwidth · Viewers (last hour)</h3>
            <Activity className="h-4 w-4 text-sky-400" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="egg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="vwr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366F1" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="t" stroke="#475569" fontSize={11} tickLine={false} minTickGap={40} />
                <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="egress" name="Egress Mbps" stroke="#10B981" strokeWidth={2} fill="url(#egg)" />
                <Area type="monotone" dataKey="viewers" name="Viewers (×20)" stroke="#6366F1" strokeWidth={2} fill="url(#vwr)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        )}

        <div className="rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">Edge Node Health</h3>
            <Cpu className="h-4 w-4 text-amber-400" />
          </div>
          <div className="space-y-3">
            {ov.nodes.map((n) => (
              <div key={n.name} className="rounded-lg border border-[#1E293B] bg-slate-950/40 p-3" data-testid={`node-${n.name}`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-200">{n.name}</span>
                  <StatusBadge status={n.status} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Meter label="CPU" value={n.cpu} color="#F59E0B" />
                  <Meter label="GPU" value={n.gpu} color="#06B6D4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {canStreams && (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">Live Preview Wall</h3>
          <Readout>{live.length} active feeds</Readout>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {live.map((s) => (
            <div key={s.id} className="overflow-hidden rounded-lg border border-[#1E293B] bg-black" data-testid={`preview-${s.id}`}>
              <div className="aspect-video">
                <StreamPreview name={s.name} resolution={s.resolution} bitrate={s.metrics.bitrate_mbps} />
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="truncate text-sm text-slate-200">{s.name}</span>
                <Readout>{fmt(s.metrics.viewers)} viewers</Readout>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

function Meter({ label, value, color }) {
  return (
    <div>
      <div className="mb-1 flex justify-between font-mono text-[10px] text-slate-400">
        <span>{label}</span><span className="tabular">{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}
