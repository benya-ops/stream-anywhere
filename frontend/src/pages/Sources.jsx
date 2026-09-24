import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader, Loading, StatusBadge, Readout, CodecChip } from "@/components/common";
import Modal, { TextField, SelectField, PrimaryButton, GhostButton } from "@/components/Modal";
import { toast } from "sonner";
import { Plus, Trash2, Cable } from "lucide-react";

const PROTOCOLS = ["SRT", "RTMP", "RTSP", "HLS", "WebRTC", "NDI", "RIST", "WHIP"];
const empty = { name: "", protocol: "SRT", mode: "Listener", port: 9001, url: "", latency_ms: 200, status: "standby" };

export default function Sources() {
  const [sources, setSources] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = () => api.get("/sources").then((r) => setSources(r.data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await api.post("/sources", { ...form, port: parseInt(form.port) || 0, latency_ms: parseInt(form.latency_ms) || 0 });
      toast.success("Input source added"); setOpen(false); setForm(empty); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const remove = async (id) => {
    try { await api.delete(`/sources/${id}`); toast.success("Source removed"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (!sources) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader title="Input Sources" subtitle="Ingest endpoints — SRT, RTMP, RTSP, WebRTC, NDI & more with failover rules.">
        <PrimaryButton testid="new-source-btn" onClick={() => setOpen(true)}>
          <span className="flex items-center gap-1.5"><Plus className="h-4 w-4" /> Add Input</span>
        </PrimaryButton>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sources.map((s) => (
          <div key={s.id} data-testid={`source-card-${s.id}`} className="rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5 hover:border-sky-500/40 transition-colors">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-md border border-[#1E293B] bg-slate-950/50 p-2 text-sky-400"><Cable className="h-4 w-4" /></div>
                <div>
                  <p className="font-medium text-slate-100">{s.name}</p>
                  <p className="font-mono text-[11px] text-slate-500">{s.mode} · port {s.port}</p>
                </div>
              </div>
              <StatusBadge status={s.status} />
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <CodecChip>{s.protocol}</CodecChip>
              <CodecChip>buffer {s.latency_ms}ms</CodecChip>
            </div>
            <Readout className="block truncate">{s.url}</Readout>
            <div className="mt-3 flex justify-end">
              <button data-testid={`delete-source-${s.id}`} onClick={() => remove(s.id)} className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Input Source" subtitle="Register a new ingest endpoint."
        footer={<><GhostButton testid="cancel-source" onClick={() => setOpen(false)}>Cancel</GhostButton><PrimaryButton testid="save-source" onClick={create}>Add Source</PrimaryButton></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><TextField label="Name" testid="src-name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Studio A — Main Camera" /></div>
          <SelectField label="Protocol" testid="src-protocol" value={form.protocol} onChange={(v) => setForm({ ...form, protocol: v })} options={PROTOCOLS} />
          <SelectField label="Mode" testid="src-mode" value={form.mode} onChange={(v) => setForm({ ...form, mode: v })} options={["Listener", "Caller", "Push", "Pull", "WHIP", "Discovery"]} />
          <TextField label="Port" testid="src-port" type="number" value={form.port} onChange={(v) => setForm({ ...form, port: v })} />
          <TextField label="Buffer (ms)" testid="src-latency" type="number" value={form.latency_ms} onChange={(v) => setForm({ ...form, latency_ms: v })} />
          <div className="sm:col-span-2"><TextField label="URL / Endpoint" testid="src-url" value={form.url} onChange={(v) => setForm({ ...form, url: v })} placeholder="srt://ingest.streamanywhere.io:9001" /></div>
          <SelectField label="Status" testid="src-status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={["connected", "standby", "offline"]} />
        </div>
      </Modal>
    </div>
  );
}
