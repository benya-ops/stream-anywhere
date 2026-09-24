import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader, Loading, CodecChip } from "@/components/common";
import Modal, { TextField, SelectField, PrimaryButton, GhostButton } from "@/components/Modal";
import { toast } from "sonner";
import { Plus, Trash2, Cpu, Zap, Volume2, Film } from "lucide-react";

const empty = { name: "", video_codec: "H.264", hw: "NVENC", audio_codec: "AAC", ladder: [], keyframe_s: 2.0, gpu: true };

export default function Transcoding() {
  const [profiles, setProfiles] = useState(null);
  const [codecs, setCodecs] = useState(null);
  const [open, setOpen] = useState(false);
  const [ladderText, setLadderText] = useState("1080p60@6M\n720p60@3M\n480p30@1.2M");
  const [form, setForm] = useState(empty);

  const load = async () => {
    const [p, c] = await Promise.all([api.get("/profiles"), api.get("/codecs")]);
    setProfiles(p.data); setCodecs(c.data);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await api.post("/profiles", {
        ...form,
        keyframe_s: parseFloat(form.keyframe_s) || 2,
        ladder: ladderText.split("\n").map((l) => l.trim()).filter(Boolean),
        gpu: form.hw !== "CPU (x264/x265)",
      });
      toast.success("Profile created"); setOpen(false); setForm(empty); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const remove = async (id) => {
    try { await api.delete(`/profiles/${id}`); toast.success("Profile deleted"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (!profiles || !codecs) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader title="Transcoding & Codecs" subtitle="Adaptive bitrate ladders, hardware acceleration and codec targets.">
        <PrimaryButton testid="new-profile-btn" onClick={() => setOpen(true)}>
          <span className="flex items-center gap-1.5"><Plus className="h-4 w-4" /> New Profile</span>
        </PrimaryButton>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {profiles.map((p) => (
          <div key={p.id} data-testid={`profile-card-${p.id}`} className="rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5 hover:border-sky-500/40 transition-colors">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-md border border-[#1E293B] bg-slate-950/50 p-2 text-violet-400"><Zap className="h-4 w-4" /></div>
                <p className="font-display text-base font-semibold text-slate-100">{p.name}</p>
              </div>
              <button data-testid={`delete-profile-${p.id}`} onClick={() => remove(p.id)} className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <CodecChip><Film className="mr-1 inline h-3 w-3" />{p.video_codec}</CodecChip>
              <CodecChip><Volume2 className="mr-1 inline h-3 w-3" />{p.audio_codec}</CodecChip>
              <CodecChip><Cpu className="mr-1 inline h-3 w-3" />{p.hw}</CodecChip>
              <CodecChip>GOP {p.keyframe_s}s</CodecChip>
            </div>
            <div className="space-y-1.5">
              {p.ladder.map((rung, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-1.5 rounded-full bg-gradient-to-r from-sky-500 to-indigo-500" style={{ width: `${Math.max(20, 100 - i * 22)}%` }} />
                  <span className="font-mono text-[11px] text-slate-400">{rung}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5">
        <h3 className="mb-4 font-mono text-xs uppercase tracking-widest text-slate-400">Supported Codec Matrix</h3>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(codecs).map(([k, list]) => (
            <div key={k}>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-sky-400">{k}</p>
              <div className="flex flex-wrap gap-1.5">{list.map((x) => <CodecChip key={x}>{x}</CodecChip>)}</div>
            </div>
          ))}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New Transcoding Profile" subtitle="Define codec targets and the ABR ladder."
        footer={<><GhostButton testid="cancel-profile" onClick={() => setOpen(false)}>Cancel</GhostButton><PrimaryButton testid="save-profile" onClick={create}>Create Profile</PrimaryButton></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><TextField label="Profile Name" testid="prof-name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="1080p60 Broadcast" /></div>
          <SelectField label="Video Codec" testid="prof-video" value={form.video_codec} onChange={(v) => setForm({ ...form, video_codec: v })} options={codecs.video} />
          <SelectField label="Audio Codec" testid="prof-audio" value={form.audio_codec} onChange={(v) => setForm({ ...form, audio_codec: v })} options={codecs.audio} />
          <SelectField label="Hardware" testid="prof-hw" value={form.hw} onChange={(v) => setForm({ ...form, hw: v })} options={codecs.hardware} />
          <TextField label="Keyframe (s)" testid="prof-gop" type="number" value={form.keyframe_s} onChange={(v) => setForm({ ...form, keyframe_s: v })} />
          <div className="sm:col-span-2">
            <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-slate-400">ABR Ladder (one rung per line)</label>
            <textarea data-testid="prof-ladder" value={ladderText} onChange={(e) => setLadderText(e.target.value)} rows={4}
              className="w-full rounded-lg border border-[#1E293B] bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-sky-500/50" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
