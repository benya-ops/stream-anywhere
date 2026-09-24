import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loading, CodecChip, Readout } from "@/components/common";
import { Server, Shield, Info, Cpu } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const [codecs, setCodecs] = useState(null);

  useEffect(() => { api.get("/codecs").then((r) => setCodecs(r.data)); }, []);
  if (!codecs) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Account, engine capabilities and platform information." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card icon={Shield} title="Account">
          <Row k="Name" v={user.name} />
          <Row k="Email" v={user.email} />
          <Row k="Role" v={user.role.toUpperCase()} />
        </Card>

        <Card icon={Server} title="Engine">
          <Row k="Version" v="Stream Anywhere v2.4.0" />
          <Row k="Cluster" v="3 edge nodes (EU / US / AP)" />
          <Row k="Uptime" v="47d 11h 22m" />
          <Row k="Scheduler" v="Adaptive ABR + failover" />
        </Card>

        <Card icon={Cpu} title="Delivery Protocols" full>
          <div className="flex flex-wrap gap-1.5">{codecs.delivery.map((d) => <CodecChip key={d}>{d}</CodecChip>)}</div>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-slate-500">Containers</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">{codecs.containers.map((d) => <CodecChip key={d}>{d}</CodecChip>)}</div>
        </Card>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5 lg:col-span-2">
          <div className="mb-2 flex items-center gap-2 text-amber-400">
            <Info className="h-4 w-4" />
            <h3 className="font-display text-sm font-semibold">Deployment Note</h3>
          </div>
          <p className="text-sm leading-relaxed text-slate-300">
            This is the <span className="text-slate-100 font-medium">control panel</span> for Stream Anywhere with full management, telemetry and analytics.
            The actual media processing layer (RTMP/SRT ingest, FFmpeg transcoding, HLS/DASH packaging) runs on dedicated
            broadcast nodes and is <span className="font-mono text-amber-400">simulated in this preview environment</span>.
            To go fully live, connect the panel to a media server backend (self-hosted FFmpeg/GStreamer cluster or Flusonic/Nimble nodes).
          </p>
        </div>
      </div>
    </div>
  );
}

function Card({ icon: Icon, title, children, full }) {
  return (
    <div className={`rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5 ${full ? "lg:col-span-1" : ""}`}>
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-md border border-[#1E293B] bg-slate-950/50 p-2 text-sky-400"><Icon className="h-4 w-4" /></div>
        <h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-center justify-between border-b border-[#1E293B]/50 py-2 last:border-0">
      <span className="text-sm text-slate-400">{k}</span>
      <Readout>{v}</Readout>
    </div>
  );
}
