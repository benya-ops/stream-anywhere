import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loading, CodecChip, Readout, StatusBadge } from "@/components/common";
import { toast } from "sonner";
import { Cpu, MemoryStick, HardDrive, Activity, Gauge, RefreshCw, Shield, Server, Cloud, Save } from "lucide-react";

function Ring({ label, value, sub, icon: Icon, danger }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 85 ? "#EF4444" : pct >= 65 ? "#F59E0B" : "#10B981";
  const dash = 2 * Math.PI * 42;
  return (
    <div className="flex items-center gap-4 rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5">
      <div className="relative h-24 w-24 shrink-0">
        <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#1E293B" strokeWidth="8" />
          <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={dash} strokeDashoffset={dash * (1 - pct / 100)} style={{ transition: "stroke-dashoffset 0.6s ease" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display text-xl font-bold text-slate-100 tabular">{Math.round(pct)}<span className="text-xs">%</span></span>
        </div>
      </div>
      <div>
        <div className="flex items-center gap-1.5 text-slate-400"><Icon className="h-4 w-4" /><span className="font-mono text-[11px] uppercase tracking-wider">{label}</span></div>
        <p className="mt-1 text-sm text-slate-300">{sub}</p>
      </div>
    </div>
  );
}

export default function System() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [caps, setCaps] = useState(null);
  const [guard, setGuard] = useState({ max_encoders: 4, cpu_limit_pct: 85 });
  const [s3, setS3] = useState(null);

  const load = async () => {
    const [s, c, st] = await Promise.all([api.get("/system/stats"), api.get("/system/capabilities"), api.get("/system/storage")]);
    setStats(s.data); setCaps(c.data); setGuard(s.data.guard); setS3(st.data);
  };
  useEffect(() => {
    load();
    const id = setInterval(() => api.get("/system/stats").then((r) => setStats(r.data)), 3000);
    return () => clearInterval(id);
  }, []);

  const saveGuard = async () => {
    try { const { data } = await api.put("/system/guard", { max_encoders: parseInt(guard.max_encoders), cpu_limit_pct: parseInt(guard.cpu_limit_pct) }); setGuard(data); toast.success("Resource guard updated"); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const restart = async () => {
    try { const { data } = await api.post("/system/engine/restart"); toast.success(`Engine reset — ${data.stopped} encoder(s) stopped`); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const saveS3 = async () => {
    try { const { data } = await api.put("/system/storage", s3); setS3(data); toast.success("Storage settings saved"); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const testS3 = async () => {
    try { const { data } = await api.post("/system/storage/test", s3); data.ok ? toast.success(data.message) : toast.error(data.error); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (!stats || !caps || !s3) return <Loading />;
  const upH = Math.floor(stats.uptime_s / 3600), upM = Math.floor((stats.uptime_s % 3600) / 60);
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader title="System & Server Control" subtitle="Live host telemetry, media-engine resource guard and safe engine restart.">
        {isAdmin && (
          <button data-testid="restart-engine-btn" onClick={restart}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/20">
            <RefreshCw className="h-4 w-4" /> Restart Engine
          </button>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Ring label="CPU" value={stats.cpu_pct} sub={`${stats.cpu_cores} cores · load ${stats.load_avg?.[0] ?? 0}`} icon={Cpu} />
        <Ring label="Memory" value={stats.mem_used_pct} sub={`${stats.mem_used_gb} / ${stats.mem_total_gb} GB`} icon={MemoryStick} />
        <Ring label="Disk" value={stats.disk_used_pct} sub={`${stats.disk_free_gb} GB free`} icon={HardDrive} />
        <div className="flex flex-col justify-center gap-3 rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-400"><Activity className="h-4 w-4" /><span className="font-mono text-[11px] uppercase tracking-wider">Active Encoders</span></div>
            <span className="font-display text-2xl font-bold text-sky-400 tabular">{stats.active_encoders}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">Uptime</span>
            <Readout>{upH}h {upM}m</Readout>
          </div>
        </div>
      </div>

      {stats.gpu && stats.gpu.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {stats.gpu.map((g, i) => (
            <div key={i} className="rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5">
              <div className="mb-2 flex items-center gap-2"><Gauge className="h-4 w-4 text-emerald-400" /><span className="font-medium text-slate-100">{g.name}</span></div>
              <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                <Readout>{g.util_pct}% GPU</Readout>
                <Readout>{Math.round(g.mem_used_mb)}/{Math.round(g.mem_total_mb)}MB</Readout>
                <Readout>{g.temp_c}°C</Readout>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* resource guard */}
        <div className="rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5">
          <div className="mb-4 flex items-center gap-2"><Shield className="h-4 w-4 text-sky-400" /><h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">Resource Guard</h3></div>
          <p className="mb-4 text-sm text-slate-400">The engine refuses to start new encoders past these limits — protecting the server from overload and crashes.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-slate-400">Max Concurrent Encoders</label>
              <input data-testid="guard-max" type="number" disabled={!isAdmin} value={guard.max_encoders} onChange={(e) => setGuard({ ...guard, max_encoders: e.target.value })}
                className="w-full rounded-lg border border-[#1E293B] bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500/50 disabled:opacity-50" />
            </div>
            <div>
              <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-slate-400">CPU Limit (%)</label>
              <input data-testid="guard-cpu" type="number" disabled={!isAdmin} value={guard.cpu_limit_pct} onChange={(e) => setGuard({ ...guard, cpu_limit_pct: e.target.value })}
                className="w-full rounded-lg border border-[#1E293B] bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500/50 disabled:opacity-50" />
            </div>
          </div>
          {isAdmin && (
            <button data-testid="save-guard-btn" onClick={saveGuard} className="mt-4 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 px-4 py-2 font-display text-sm font-semibold text-white shadow-lg shadow-sky-500/20 hover:scale-[1.02] transition-transform">Save Guard</button>
          )}
        </div>

        {/* capabilities */}
        <div className="rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5">
          <div className="mb-4 flex items-center gap-2"><Server className="h-4 w-4 text-sky-400" /><h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">Engine Capabilities</h3></div>
          <p className="mb-3 font-mono text-[11px] text-emerald-400">{caps.ffmpeg}</p>
          <Group title="Hardware" items={caps.hardware_accels} />
          <Group title="Video codecs" items={caps.video_codecs} />
          <Group title="Audio codecs" items={caps.audio_codecs} />
          <Group title="Ingest" items={caps.input_protocols} />
          <Group title="Delivery" items={caps.output_protocols} />
        </div>
      </div>

      {/* S3 object storage */}
      <div className="rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Cloud className="h-4 w-4 text-emerald-400" />
          <h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">S3 Object Storage (VOD / Recordings)</h3>
          <StatusBadge status={s3.enabled ? "connected" : "standby"} label={s3.enabled ? "ENABLED" : "DISABLED"} />
        </div>
        <p className="mb-4 text-sm text-slate-400">Connect any S3-compatible bucket (AWS S3, MinIO, Backblaze, Wasabi…). When enabled, saved DVR recordings are offloaded to your bucket and served from there.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SField label="Endpoint URL (blank = AWS)" testid="s3-endpoint" value={s3.endpoint_url} on={(v) => setS3({ ...s3, endpoint_url: v })} ph="https://s3.eu-central-1.amazonaws.com" admin={isAdmin} />
          <SField label="Region" testid="s3-region" value={s3.region} on={(v) => setS3({ ...s3, region: v })} ph="us-east-1" admin={isAdmin} />
          <SField label="Bucket" testid="s3-bucket" value={s3.bucket} on={(v) => setS3({ ...s3, bucket: v })} ph="my-vod-bucket" admin={isAdmin} />
          <SField label="Public Base URL (CDN, optional)" testid="s3-public" value={s3.public_base} on={(v) => setS3({ ...s3, public_base: v })} ph="https://cdn.example.com" admin={isAdmin} />
          <SField label="Access Key" testid="s3-access" value={s3.access_key} on={(v) => setS3({ ...s3, access_key: v })} ph="AKIA…" admin={isAdmin} />
          <SField label="Secret Key" testid="s3-secret" value={s3.secret_key} on={(v) => setS3({ ...s3, secret_key: v })} ph="••••••" admin={isAdmin} type="password" />
        </div>
        {isAdmin && (
          <div className="mt-4 flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" data-testid="s3-enabled" checked={s3.enabled} onChange={(e) => setS3({ ...s3, enabled: e.target.checked })} className="h-4 w-4 accent-emerald-500" /> Enabled
            </label>
            <button data-testid="s3-test-btn" onClick={testS3} className="ml-auto rounded-lg border border-[#1E293B] px-4 py-2 text-sm text-slate-300 hover:bg-[#1E293B]">Test Connection</button>
            <button data-testid="s3-save-btn" onClick={saveS3} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 font-display text-sm font-semibold text-white hover:scale-[1.02] transition-transform"><Save className="h-4 w-4" /> Save Storage</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Group({ title, items }) {
  return (
    <div className="mb-3">
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">{title}</p>
      <div className="flex flex-wrap gap-1.5">{(items || []).map((x) => <CodecChip key={x}>{x}</CodecChip>)}</div>
    </div>
  );
}

function SField({ label, value, on, ph, admin, testid, type = "text" }) {
  return (
    <div>
      <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-slate-400">{label}</label>
      <input data-testid={testid} type={type} value={value || ""} disabled={!admin} placeholder={ph}
        onChange={(e) => on(e.target.value)}
        className="w-full rounded-lg border border-[#1E293B] bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50 disabled:opacity-50 placeholder:text-slate-600" />
    </div>
  );
}
