import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader, Loading, StatusBadge, CodecChip, Readout } from "@/components/common";
import Modal, { TextField, SelectField, PrimaryButton, GhostButton } from "@/components/Modal";
import { toast } from "sonner";
import { Plus, Trash2, Film, ListVideo, Clock, Eye } from "lucide-react";

const dur = (s) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "K" : n);

export default function Media() {
  const [vod, setVod] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", duration_s: 3600, size_gb: 2.0, codec: "H.264 / AAC", resolution: "1080p", status: "ready" });

  const load = async () => {
    const [v, p] = await Promise.all([api.get("/vod"), api.get("/playlists")]);
    setVod(v.data); setPlaylists(p.data);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await api.post("/vod", { ...form, duration_s: parseInt(form.duration_s) || 0, size_gb: parseFloat(form.size_gb) || 0, views: 0 });
      toast.success("Asset added"); setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const remove = async (id) => {
    try { await api.delete(`/vod/${id}`); toast.success("Asset deleted"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (!vod) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader title="VOD & Playout" subtitle="On-demand library, DVR archive and scheduled 24/7 playout loops.">
        <PrimaryButton testid="new-vod-btn" onClick={() => setOpen(true)}>
          <span className="flex items-center gap-1.5"><Plus className="h-4 w-4" /> Add Asset</span>
        </PrimaryButton>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h3 className="mb-3 font-mono text-xs uppercase tracking-widest text-slate-400">VOD Library</h3>
          <div className="overflow-x-auto rounded-lg border border-[#1E293B]">
            <table className="w-full text-left text-sm" data-testid="vod-table">
              <thead>
                <tr className="bg-[#141E33] font-mono text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3">Title</th><th className="px-4 py-3">Codec</th>
                  <th className="px-4 py-3">Duration</th><th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Views</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {vod.map((v) => (
                  <tr key={v.id} data-testid={`vod-row-${v.id}`} className="border-t border-[#1E293B]/60 text-slate-300 hover:bg-[#1E293B]/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Film className="h-4 w-4 text-sky-400" />
                        <span className="font-medium text-slate-100">{v.title}</span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500">{v.resolution}</span>
                    </td>
                    <td className="px-4 py-3"><CodecChip>{v.codec}</CodecChip></td>
                    <td className="px-4 py-3 font-mono tabular text-slate-400"><Clock className="mr-1 inline h-3 w-3" />{dur(v.duration_s)}</td>
                    <td className="px-4 py-3 font-mono tabular text-slate-400">{v.size_gb} GB</td>
                    <td className="px-4 py-3 font-mono tabular text-slate-300"><Eye className="mr-1 inline h-3 w-3" />{fmt(v.views)}</td>
                    <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <button data-testid={`delete-vod-${v.id}`} onClick={() => remove(v.id)} className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="mb-3 font-mono text-xs uppercase tracking-widest text-slate-400">Playout Schedules</h3>
          <div className="space-y-4">
            {playlists.map((p) => (
              <div key={p.id} data-testid={`playlist-${p.id}`} className="rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ListVideo className="h-4 w-4 text-indigo-400" />
                    <span className="font-medium text-slate-100">{p.name}</span>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <div className="mb-2 flex gap-2">
                  <Readout>start {p.start_at}</Readout>
                  {p.loop && <CodecChip>LOOP</CodecChip>}
                </div>
                <ol className="space-y-1">
                  {p.items.map((it, i) => (
                    <li key={i} className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                      <span className="text-slate-600">{String(i + 1).padStart(2, "0")}</span> {it}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add VOD Asset" subtitle="Register a recorded or uploaded asset."
        footer={<><GhostButton testid="cancel-vod" onClick={() => setOpen(false)}>Cancel</GhostButton><PrimaryButton testid="save-vod" onClick={create}>Add Asset</PrimaryButton></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><TextField label="Title" testid="vod-title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="Championship Final — Replay" /></div>
          <TextField label="Duration (s)" testid="vod-duration" type="number" value={form.duration_s} onChange={(v) => setForm({ ...form, duration_s: v })} />
          <TextField label="Size (GB)" testid="vod-size" type="number" value={form.size_gb} onChange={(v) => setForm({ ...form, size_gb: v })} />
          <SelectField label="Codec" testid="vod-codec" value={form.codec} onChange={(v) => setForm({ ...form, codec: v })} options={["H.264 / AAC", "HEVC / AAC", "AV1 / Opus", "VP9 / Opus"]} />
          <SelectField label="Resolution" testid="vod-res" value={form.resolution} onChange={(v) => setForm({ ...form, resolution: v })} options={["2160p", "1080p", "720p", "480p"]} />
          <SelectField label="Status" testid="vod-status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={["ready", "transcoding"]} />
        </div>
      </Modal>
    </div>
  );
}
