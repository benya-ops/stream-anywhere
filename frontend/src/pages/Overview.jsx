import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth, canAccess } from "@/context/AuthContext";
import { StatCard, PageHeader, Loading, StatusBadge, Readout } from "@/components/common";
import HlsPlayer from "@/components/HlsPlayer";
import { Radio, Server, Cpu, MemoryStick, HardDrive, Activity } from "lucide-react";

export default function Overview() {
  const { user } = useAuth();
  const [ov, setOv] = useState(null);

  const canStreams = canAccess(user, "streams") || canAccess(user, "engine");

  const load = async () => {
    try { const o = await api.get("/overview"); setOv(o.data); } catch (e) { /* allowed for all */ }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ov) return <Loading />;

  const liveChannels = ov.channels.filter((c) => c.has_master);

  return (
    <div className="space-y-6">
      <PageHeader title="Mission Control" subtitle="Live status of this broadcast server — real channels and real host load." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard testid="stat-live" label="Live Channels" value={ov.live_count} unit={`/ ${ov.total_channels}`} icon={Radio} accent="emerald" />
        <StatCard testid="stat-encoders" label="Active Encoders" value={ov.active_encoders} unit={`· ${ov.total_renditions} renditions`} icon={Server} accent="indigo" />
        <StatCard testid="stat-cpu" label="Host CPU" value={ov.cpu_pct} unit="%" icon={Cpu} accent={ov.cpu_pct > 85 ? "red" : "sky"} />
        <StatCard testid="stat-mem" label="Host Memory" value={ov.mem_pct} unit="%" icon={MemoryStick} accent={ov.mem_pct > 85 ? "red" : "violet"} />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#1E293B] bg-[#0F172A]/60 px-4 py-3">
        <Activity className="h-4 w-4 text-sky-400" />
        <StatusBadge status={ov.ffmpeg_available ? "connected" : "offline"} label={ov.ffmpeg_available ? "FFMPEG ONLINE" : "FFMPEG OFFLINE"} />
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400"><HardDrive className="h-3.5 w-3.5" /> Disk {ov.disk_pct}%</span>
        <span className="font-mono text-[11px] text-slate-500">Single-node · self-hosted</span>
      </div>

      {canStreams && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">Channels</h3>
            <Readout>{liveChannels.length} live · {ov.channels.length} total</Readout>
          </div>

          {ov.channels.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#1E293B] text-slate-500">
              <Radio className="h-7 w-7" />
              <span className="font-mono text-sm">No channels yet — create one in Live Streams or Media Server</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {ov.channels.map((c) => (
                <div key={c.id} className="overflow-hidden rounded-lg border border-[#1E293B] bg-[#0F172A]/80" data-testid={`ov-channel-${c.id}`}>
                  <div className="aspect-video bg-black">
                    {c.has_master ? (
                      <HlsPlayer src={`${c.playback_url}?t=${c.id}`} />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-600">
                        <span className="font-mono text-xs">{c.running ? "starting…" : "idle"}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100">{c.name}</p>
                      <p className="font-mono text-[10px] text-slate-500">{c.ladder} · {c.fps || "—"}fps{c.dvr ? " · DVR" : ""}</p>
                    </div>
                    <StatusBadge status={c.has_master ? "live" : c.running ? "warning" : "standby"} label={(c.has_master ? "LIVE" : c.running ? "START" : "IDLE")} />
                  </div>
                  {c.running && c.qc && (
                    <div className="flex flex-wrap gap-1 border-t border-[#1E293B] px-3 py-2">
                      <StatusBadge status={c.qc.healthy ? "healthy" : "warning"} label={c.qc.healthy ? "SIGNAL OK" : "CHECK"} />
                      {c.qc.black && <StatusBadge status="error" label="BLACK" />}
                      {c.qc.freeze && <StatusBadge status="warning" label="FROZEN" />}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
