import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader, Loading, StatusBadge, Readout, CodecChip } from "@/components/common";
import Modal, { TextField, SelectField, PrimaryButton, GhostButton } from "@/components/Modal";
import StreamPreview from "@/components/StreamPreview";
import { toast } from "sonner";
import { Play, Square, Repeat, Trash2, Plus, Eye, Radio } from "lucide-react";

const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "K" : n);

export default function Streams() {
  const [streams, setStreams] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [sources, setSources] = useState([]);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState({ name: "", input: "", profile: "", resolution: "1080p60", region: "EU-West", base_bitrate: 6, base_viewers: 500 });

  const load = async () => {
    const [s, p, src] = await Promise.all([api.get("/streams"), api.get("/profiles"), api.get("/sources")]);
    setStreams(s.data); setProfiles(p.data); setSources(src.data);
  };

  useEffect(() => {
    load();
    const id = setInterval(() => api.get("/streams").then((r) => setStreams(r.data)), 4000);
    return () => clearInterval(id);
  }, []);

  const action = async (id, act) => {
    try {
      await api.post(`/streams/${id}/action`, { action: act });
      toast.success(`Stream ${act} executed`);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const remove = async (id) => {
    try { await api.delete(`/streams/${id}`); toast.success("Stream deleted"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const create = async () => {
    try {
      await api.post("/streams", {
        ...form,
        base_bitrate: parseFloat(form.base_bitrate) || 6,
        base_viewers: parseInt(form.base_viewers) || 500,
        protocols_out: ["HLS", "DASH", "LL-HLS"],
      });
      toast.success("Stream created");
      setCreating(false);
      setForm({ name: "", input: "", profile: "", resolution: "1080p60", region: "EU-West", base_bitrate: 6, base_viewers: 500 });
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (!streams) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader title="Live Streams" subtitle="Publish points, adaptive bitrate ladders and real-time channel telemetry.">
        <PrimaryButton testid="new-stream-btn" onClick={() => setCreating(true)}>
          <span className="flex items-center gap-1.5"><Plus className="h-4 w-4" /> New Stream</span>
        </PrimaryButton>
      </PageHeader>

      <div className="overflow-x-auto rounded-lg border border-[#1E293B]">
        <table className="w-full text-left text-sm" data-testid="streams-table">
          <thead>
            <tr className="bg-[#141E33] font-mono text-[11px] uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Bitrate</th>
              <th className="px-4 py-3">Viewers</th>
              <th className="px-4 py-3">FPS</th>
              <th className="px-4 py-3">Loss</th>
              <th className="px-4 py-3">Delivery</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {streams.map((s) => (
              <tr key={s.id} className="border-t border-[#1E293B]/60 text-slate-300 hover:bg-[#1E293B]/30" data-testid={`stream-row-${s.id}`}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-100">{s.name}</div>
                  <div className="font-mono text-[11px] text-slate-500">{s.resolution} · {s.region} · {s.input || "no input"}</div>
                </td>
                <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                <td className="px-4 py-3"><Readout>{s.metrics.bitrate_mbps} Mbps</Readout></td>
                <td className="px-4 py-3 font-mono tabular text-slate-200">{fmt(s.metrics.viewers)}</td>
                <td className="px-4 py-3 font-mono tabular text-slate-400">{s.metrics.fps}</td>
                <td className="px-4 py-3 font-mono tabular text-slate-400">{s.metrics.packet_loss_pct}%</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">{s.protocols_out?.map((p) => <CodecChip key={p}>{p}</CodecChip>)}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <IconBtn title="Preview" testid={`preview-btn-${s.id}`} onClick={() => setPreview(s)}><Eye className="h-4 w-4" /></IconBtn>
                    {s.status === "live" ? (
                      <IconBtn title="Stop" testid={`stop-btn-${s.id}`} onClick={() => action(s.id, "stop")} tone="red"><Square className="h-4 w-4" /></IconBtn>
                    ) : (
                      <IconBtn title="Start" testid={`start-btn-${s.id}`} onClick={() => action(s.id, "start")} tone="green"><Play className="h-4 w-4" /></IconBtn>
                    )}
                    <IconBtn title="Failover" testid={`failover-btn-${s.id}`} onClick={() => action(s.id, "failover")} tone="amber"><Repeat className="h-4 w-4" /></IconBtn>
                    <IconBtn title="Delete" testid={`delete-btn-${s.id}`} onClick={() => remove(s.id)} tone="red"><Trash2 className="h-4 w-4" /></IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Create Live Stream" subtitle="Configure a new publish point and ABR ladder."
        footer={<><GhostButton testid="cancel-create" onClick={() => setCreating(false)}>Cancel</GhostButton><PrimaryButton testid="save-stream" onClick={create}>Create Stream</PrimaryButton></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><TextField label="Channel Name" testid="field-name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="News Channel HD" /></div>
          <SelectField label="Input Source" testid="field-input" value={form.input} onChange={(v) => setForm({ ...form, input: v })} options={["", ...sources.map((s) => s.name)]} />
          <SelectField label="Transcoding Profile" testid="field-profile" value={form.profile} onChange={(v) => setForm({ ...form, profile: v })} options={["", ...profiles.map((p) => p.name)]} />
          <SelectField label="Resolution" testid="field-res" value={form.resolution} onChange={(v) => setForm({ ...form, resolution: v })} options={["2160p60", "1080p60", "1080p30", "720p60", "720p30", "480p30", "audio"]} />
          <SelectField label="Region" testid="field-region" value={form.region} onChange={(v) => setForm({ ...form, region: v })} options={["EU-West", "EU-Central", "US-East", "US-West", "AP-South", "Global"]} />
        </div>
      </Modal>

      <Modal open={!!preview} onClose={() => setPreview(null)} wide title={preview?.name} subtitle={`${preview?.resolution} · ${preview?.region}`}>
        {preview && (
          <div className="space-y-4">
            <div className="aspect-video overflow-hidden rounded-lg border border-[#1E293B]">
              <StreamPreview name={preview.name} resolution={preview.resolution} bitrate={preview.metrics.bitrate_mbps} />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Bitrate" value={`${preview.metrics.bitrate_mbps} Mbps`} />
              <Stat label="Viewers" value={fmt(preview.metrics.viewers)} />
              <Stat label="FPS" value={preview.metrics.fps} />
              <Stat label="Latency" value={`${preview.metrics.latency_ms} ms`} />
            </div>
            <div className="rounded-lg border border-[#1E293B] bg-slate-950/50 p-3 font-mono text-xs text-slate-400">
              <div>stream_key: <span className="text-sky-400">{preview.stream_key}</span></div>
              <div className="mt-1">playback: <span className="text-emerald-400">https://cdn.streamanywhere.io/{preview.stream_key}/index.m3u8</span></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function IconBtn({ children, onClick, title, tone = "slate", testid }) {
  const tones = {
    slate: "text-slate-400 hover:bg-[#1E293B] hover:text-slate-200",
    green: "text-emerald-400 hover:bg-emerald-500/10",
    red: "text-red-400 hover:bg-red-500/10",
    amber: "text-amber-400 hover:bg-amber-500/10",
  };
  return <button title={title} data-testid={testid} onClick={onClick} className={`rounded-md p-2 transition-colors ${tones[tone]}`}>{children}</button>;
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-[#1E293B] bg-slate-950/40 p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold text-slate-100 tabular">{value}</p>
    </div>
  );
}
