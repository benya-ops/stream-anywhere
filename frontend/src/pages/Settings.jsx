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

        <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-5 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2 text-sky-400">
            <Server className="h-4 w-4" />
            <h3 className="font-display text-sm font-semibold">Deploy on your own Linux server — one command</h3>
          </div>
          <p className="mb-3 text-sm leading-relaxed text-slate-300">
            Get the full production stack (MongoDB + FFmpeg media engine + web panel) running with a single command.
            The installer sets up Docker, generates secrets, sizes resource limits to your host, opens ingest ports,
            and starts everything — <span className="text-slate-100 font-medium">nothing to configure by hand</span>.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-[#1E293B] bg-slate-950/70 p-3 font-mono text-sm text-emerald-400">sudo bash deploy/install.sh</pre>
          <div className="mt-3 grid grid-cols-1 gap-2 font-mono text-[11px] text-slate-400 sm:grid-cols-3">
            <div className="rounded border border-[#1E293B] bg-slate-950/40 p-2">Web: <span className="text-sky-400">http://&lt;server-ip&gt;/</span></div>
            <div className="rounded border border-[#1E293B] bg-slate-950/40 p-2">RTMP in: <span className="text-emerald-400">rtmp://&lt;ip&gt;:1935/live/stream</span></div>
            <div className="rounded border border-[#1E293B] bg-slate-950/40 p-2">SRT in: <span className="text-emerald-400">srt://&lt;ip&gt;:9000</span></div>
          </div>
          <p className="mt-3 font-mono text-[11px] text-slate-500">Full guide: deploy/README.md · auto-restart on crash/reboot · container CPU/RAM caps protect the host.</p>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5 lg:col-span-2">
          <div className="mb-2 flex items-center gap-2 text-amber-400">
            <Info className="h-4 w-4" />
            <h3 className="font-display text-sm font-semibold">About this preview</h3>
          </div>
          <p className="text-sm leading-relaxed text-slate-300">
            The <span className="text-slate-100 font-medium">Media Server</span> page runs a <span className="text-emerald-400">real FFmpeg engine</span>
            {" "}here (test patterns, URL pull, VOD, real HLS ABR output). External push ingest (OBS via RTMP/SRT) needs open
            ports, so it activates once you run the one-command deployment above on your own server. The <span className="text-slate-100 font-medium">Live Streams</span>
            {" "}page uses simulated telemetry for demo channels.
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
