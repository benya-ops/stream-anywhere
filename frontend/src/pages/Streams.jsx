import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loading, StatusBadge, Readout, CodecChip } from "@/components/common";
import Modal, { TextField, SelectField, PrimaryButton, GhostButton } from "@/components/Modal";
import HlsPlayer from "@/components/HlsPlayer";
import { toast } from "sonner";
import { Play, Square, Trash2, Plus, Eye, Pencil, Radio, Globe, Save, Loader2, Copy } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const emptyForm = { name: "", source: "test", source_url: "", ingest_port: 9000, source_id: "", profile_id: "", ladder: "720p", fps: "50", keyframe_s: 2, video_codec: "H.264", audio_codec: "AAC", hw: "auto", push_url: "", dvr: false, region: "EU-West" };

export default function Streams() {
  const { user } = useAuth();
  const [channels, setChannels] = useState(null);
  const [status, setStatus] = useState(null);
  const [presets, setPresets] = useState(null);
  const [sources, setSources] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [delivery, setDelivery] = useState({ cdn_base: "" });
  const [editing, setEditing] = useState(null); // null | "new" | id
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [cdnInput, setCdnInput] = useState("");

  const load = async () => {
    const [c, s, cfg, del, src, prof] = await Promise.all([
      api.get("/channels"), api.get("/engine/status"), api.get("/config/presets"),
      api.get("/config/delivery"), api.get("/sources"), api.get("/profiles"),
    ]);
    setChannels(c.data); setStatus(s.data); setPresets(cfg.data);
    setDelivery(del.data); setCdnInput(del.data.cdn_base || "");
    setSources(src.data); setProfiles(prof.data);
    setPreview((prev) => prev ? c.data.find((x) => x.id === prev.id) || prev : prev);
  };

  useEffect(() => {
    load();
    const id = setInterval(() => api.get("/channels").then((r) => {
      setChannels(r.data);
      setPreview((prev) => prev ? r.data.find((x) => x.id === prev.id) || prev : prev);
    }), 4000);
    return () => clearInterval(id);
  }, []);

  const act = async (ch, action) => {
    setBusy(ch.id);
    try { await api.post(`/channels/${ch.id}/${action}`); toast.success(action === "start" ? "Encoder started — live output ready" : "Encoder stopped"); await load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(null); }
  };
  const remove = async (id) => {
    try { await api.delete(`/channels/${id}`); toast.success("Stream deleted"); if (preview?.id === id) setPreview(null); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const openCreate = () => {
    setForm({ ...emptyForm, fps: status?.frame_rates?.[0] || "50", ladder: status?.ladders?.[0] || "720p", region: presets?.regions?.[0] || "EU-West" });
    setEditing("new");
  };
  const openEdit = (ch) => {
    setForm({
      name: ch.name, source: ch.source || "test", source_url: ch.source_url || "", ingest_port: ch.ingest_port || 9000,
      source_id: ch.source_id || "", profile_id: ch.profile_id || "",
      ladder: ch.ladder || "720p", fps: String(ch.fps || "50"), keyframe_s: ch.keyframe_s ?? 2,
      video_codec: ch.video_codec || "H.264", audio_codec: ch.audio_codec || "AAC", hw: ch.hw || "auto",
      push_url: ch.push_url || "", dvr: !!ch.dvr, region: ch.region || "EU-West",
    });
    setEditing(ch.id);
  };
  const save = async () => {
    try {
      const payload = { ...form, ingest_port: parseInt(form.ingest_port) || 9000, keyframe_s: parseFloat(form.keyframe_s) || 2 };
      if (editing === "new") { const { data } = await api.post("/channels", payload); toast.success("Stream created"); await load(); setPreview(data); }
      else { await api.put(`/channels/${editing}`, payload); toast.success("Stream updated"); await load(); }
      setEditing(null); setForm(emptyForm);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const saveCdn = async () => {
    try { const { data } = await api.put("/config/delivery", { cdn_base: cdnInput }); setDelivery(data); setCdnInput(data.cdn_base); toast.success("CDN saved — distribution URLs updated"); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const purge = async () => {
    if (!window.confirm("Delete ALL demo/sample data (streams, channels, sources, VOD, playlists, profiles)? This cannot be undone.")) return;
    try { const { data } = await api.post("/admin/purge-demo"); toast.success(`Demo data cleared (${Object.values(data.deleted).reduce((a, b) => a + b, 0)} records)`); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (!channels || !status) return <Loading />;

  const isAdmin = user?.role === "admin";
  const originUrl = (ch) => `${BACKEND_URL}${ch.playback_url}`;
  const cdnUrl = (ch) => (delivery.cdn_base ? `${delivery.cdn_base}/${ch.id}/master.m3u8` : null);
  const copy = (t) => { navigator.clipboard?.writeText(t); toast.success("Copied"); };

  return (
    <div className="space-y-6">
      <PageHeader title="Live Streams" subtitle="Real broadcast channels — live HLS you can preview directly from this server.">
        <div className="flex gap-2">
          {isAdmin && <GhostButton testid="purge-demo-btn" onClick={purge}><span className="flex items-center gap-1.5"><Trash2 className="h-4 w-4" /> Clear demo data</span></GhostButton>}
          <PrimaryButton testid="new-stream-btn" onClick={openCreate}><span className="flex items-center gap-1.5"><Plus className="h-4 w-4" /> New Stream</span></PrimaryButton>
        </div>
      </PageHeader>

      {isAdmin && (
        <div className="rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5" data-testid="cdn-config">
          <div className="mb-3 flex items-center gap-2"><Globe className="h-4 w-4 text-sky-400" /><h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">CDN / Distribution (optional)</h3></div>
          <p className="mb-3 text-sm text-slate-400">Leave empty to serve directly from this server. Set your own CDN base (that pulls from this origin) to get public distribution URLs. Preview always plays from the origin, never the CDN.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input data-testid="cdn-input" value={cdnInput} onChange={(e) => setCdnInput(e.target.value)} placeholder="https://cdn.your-domain.com  (empty = serve from this server)"
              className="flex-1 rounded-lg border border-[#1E293B] bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-sky-500/50" />
            <PrimaryButton testid="cdn-save" onClick={saveCdn}><span className="flex items-center gap-1.5"><Save className="h-4 w-4" /> Save CDN</span></PrimaryButton>
          </div>
        </div>
      )}

      {channels.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[#1E293B] text-slate-500">
          <Radio className="h-8 w-8" />
          <span className="font-mono text-sm">No streams yet — create your first real channel</span>
          <PrimaryButton testid="empty-new-stream" onClick={openCreate}><span className="flex items-center gap-1.5"><Plus className="h-4 w-4" /> New Stream</span></PrimaryButton>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#1E293B]">
          <table className="w-full text-left text-sm" data-testid="streams-table">
            <thead>
              <tr className="bg-[#141E33] font-mono text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Renditions</th>
                <th className="px-4 py-3">Delivery</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((ch) => (
                <tr key={ch.id} className="border-t border-[#1E293B]/60 text-slate-300 hover:bg-[#1E293B]/30" data-testid={`stream-row-${ch.id}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-100">{ch.name}</div>
                    <div className="font-mono text-[11px] text-slate-500">{ch.ladder} · {ch.fps || "—"}fps · {ch.video_codec}/{ch.audio_codec} · {ch.region}</div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={ch.status === "live" ? "live" : ch.status === "starting" ? "warning" : "standby"} label={ch.status?.toUpperCase()} /></td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{ch.source === "test" ? "TEST PATTERN" : ch.source === "bars" ? "SMPTE BARS" : ch.source === "url" ? "URL PULL" : ch.source?.toUpperCase()}</td>
                  <td className="px-4 py-3 font-mono tabular text-slate-400">{ch.stats?.variants ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1"><CodecChip>HLS</CodecChip>{delivery.cdn_base && <CodecChip>CDN</CodecChip>}{ch.dvr && <CodecChip>DVR</CodecChip>}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <IconBtn title="Preview" testid={`preview-btn-${ch.id}`} onClick={() => setPreview(ch)}><Eye className="h-4 w-4" /></IconBtn>
                      <IconBtn title="Edit" testid={`edit-btn-${ch.id}`} onClick={() => openEdit(ch)}><Pencil className="h-4 w-4" /></IconBtn>
                      {ch.stats?.running ? (
                        <IconBtn title="Stop" testid={`stop-btn-${ch.id}`} onClick={() => act(ch, "stop")} tone="red" disabled={busy === ch.id}><Square className="h-4 w-4" /></IconBtn>
                      ) : (
                        <IconBtn title="Start" testid={`start-btn-${ch.id}`} onClick={() => act(ch, "start")} tone="green" disabled={busy === ch.id}>{busy === ch.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}</IconBtn>
                      )}
                      <IconBtn title="Delete" testid={`delete-btn-${ch.id}`} onClick={() => remove(ch.id)} tone="red"><Trash2 className="h-4 w-4" /></IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)}
        title={editing === "new" ? "Create Live Stream" : "Edit Live Stream"}
        subtitle="Real transcoding channel — ingest, codec, frame rate, delivery."
        footer={<><GhostButton testid="cancel-create" onClick={() => setEditing(null)}>Cancel</GhostButton><PrimaryButton testid="save-stream" onClick={save}>{editing === "new" ? "Create Stream" : "Save Changes"}</PrimaryButton></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><TextField label="Channel Name" testid="field-name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="News Channel HD" /></div>

          <SelectField label="Input Source" testid="field-source-id" value={form.source_id}
            onChange={(v) => setForm({ ...form, source_id: v })}
            options={[{ value: "", label: "Built-in (test / bars / URL)" }, ...sources.map((s) => ({ value: s.id, label: `${s.name} (${s.protocol})` }))]} />

          <SelectField label="Transcoding Profile" testid="field-profile-id" value={form.profile_id}
            onChange={(v) => setForm({ ...form, profile_id: v })}
            options={[{ value: "", label: "Manual settings (below)" }, ...profiles.map((p) => ({ value: p.id, label: p.name }))]} />

          {/* Built-in ingest fields — only when no saved Source is selected */}
          {!form.source_id && (
            <>
              <SelectField label="Built-in Source" testid="field-source" value={form.source} onChange={(v) => setForm({ ...form, source: v })}
                options={[
                  { value: "test", label: "Generated Test Pattern" },
                  { value: "bars", label: "SMPTE Color Bars" },
                  { value: "url", label: "Pull from URL (HLS/RTSP/MP4/RTMP)" },
                  { value: "srt-listen", label: "SRT Listener (push-in)" },
                  { value: "rtmp-listen", label: "RTMP Listener (push-in)" },
                ]} />
              {form.source === "url" && (
                <div className="sm:col-span-2"><TextField label="Pull URL" testid="field-url" value={form.source_url} onChange={(v) => setForm({ ...form, source_url: v })} placeholder="https://…/index.m3u8 · rtsp://… · srt://…" /></div>
              )}
              {(form.source === "srt-listen" || form.source === "rtmp-listen") && (
                <TextField label="Ingest Port" testid="field-port" type="number" value={form.ingest_port} onChange={(v) => setForm({ ...form, ingest_port: v })} />
              )}
            </>
          )}

          {/* Manual transcode fields — only when no saved Profile is selected */}
          {!form.profile_id ? (
            <>
              <SelectField label="ABR Ladder" testid="field-ladder" value={form.ladder} onChange={(v) => setForm({ ...form, ladder: v })} options={status.ladders} />
              <SelectField label="Frame Rate (fps)" testid="field-fps" value={form.fps} onChange={(v) => setForm({ ...form, fps: v })} options={status.frame_rates || ["50", "25", "60", "30"]} />
              <TextField label="Keyframe (s)" testid="field-keyframe" type="number" value={form.keyframe_s} onChange={(v) => setForm({ ...form, keyframe_s: v })} />
              <SelectField label="Video Codec" testid="field-video" value={form.video_codec} onChange={(v) => setForm({ ...form, video_codec: v })} options={status.video_codecs} />
              <SelectField label="Audio Codec" testid="field-audio" value={form.audio_codec} onChange={(v) => setForm({ ...form, audio_codec: v })} options={status.audio_codecs} />
              <SelectField label="Hardware" testid="field-hw" value={form.hw} onChange={(v) => setForm({ ...form, hw: v })} options={["auto", ...(status.hardware_accels || ["CPU"])]} />
            </>
          ) : (
            <div className="sm:col-span-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 font-mono text-[11px] text-sky-300">
              Codecs, ABR ladder, frame rate & keyframe come from the selected transcoding profile.
            </div>
          )}

          <SelectField label="Region" testid="field-region" value={form.region} onChange={(v) => setForm({ ...form, region: v })} options={presets?.regions || ["EU-West"]} />
          <TextField label="Push Egress (optional)" testid="field-push" value={form.push_url} onChange={(v) => setForm({ ...form, push_url: v })} placeholder="rtmp://cdn/live/key · srt://…" />
          <label className="sm:col-span-2 flex items-center gap-2.5 rounded-lg border border-[#1E293B] bg-slate-950/40 px-3 py-2.5 cursor-pointer">
            <input type="checkbox" data-testid="field-dvr" checked={form.dvr} onChange={(e) => setForm({ ...form, dvr: e.target.checked })} className="h-4 w-4 accent-sky-500" />
            <span className="text-sm text-slate-300">Enable <span className="font-medium text-slate-100">DVR</span> — keep the full seekable window so you can rewind & save recordings</span>
          </label>
        </div>
      </Modal>

      {/* Preview modal — REAL HLS from the origin server */}
      <Modal open={!!preview} onClose={() => setPreview(null)} wide title={preview?.name} subtitle={`${preview?.ladder} · ${preview?.fps || "—"}fps · ${preview?.region}`}>
        {preview && (
          <div className="space-y-4">
            {preview.stats?.has_master ? (
              <HlsPlayer src={`${preview.playback_url}?t=${preview.id}`} />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-lg border border-[#1E293B] bg-black text-slate-500">
                <div className="flex flex-col items-center gap-2">
                  {preview.stats?.running ? <Loader2 className="h-8 w-8 animate-spin" /> : <Square className="h-8 w-8" />}
                  <span className="font-mono text-sm">{preview.stats?.running ? "Encoder starting…" : "Encoder idle — press Start"}</span>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {preview.stats?.running ? (
                <button data-testid="preview-stop" onClick={() => act(preview, "stop")} className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20"><Square className="h-4 w-4" /> Stop</button>
              ) : (
                <PrimaryButton testid="preview-start" onClick={() => act(preview, "start")}><span className="flex items-center gap-1.5"><Play className="h-4 w-4" /> Start Encoder</span></PrimaryButton>
              )}
            </div>
            {preview.ingest_endpoint && (
              <UrlRow label="ingest" value={preview.ingest_endpoint} onCopy={copy} />
            )}
            <UrlRow label="playback (origin)" value={originUrl(preview)} onCopy={copy} accent="emerald" />
            {cdnUrl(preview)
              ? <UrlRow label="playback (CDN)" value={cdnUrl(preview)} onCopy={copy} accent="sky" />
              : <p className="font-mono text-[11px] text-slate-500">No CDN configured — distribute the origin URL above, or set your CDN in the Live Streams settings.</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}

function UrlRow({ label, value, onCopy, accent = "slate" }) {
  const colors = { slate: "text-slate-300", emerald: "text-emerald-400", sky: "text-sky-400" };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-slate-950/50 p-3">
      <span className="font-mono text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`flex-1 truncate font-mono text-xs ${colors[accent]}`}>{value}</span>
      <button data-testid={`copy-${label}`} onClick={() => onCopy(value)} className="rounded-md p-1.5 text-slate-400 hover:bg-[#1E293B] hover:text-slate-200"><Copy className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function IconBtn({ children, onClick, title, tone = "slate", testid, disabled }) {
  const tones = {
    slate: "text-slate-400 hover:bg-[#1E293B] hover:text-slate-200",
    green: "text-emerald-400 hover:bg-emerald-500/10",
    red: "text-red-400 hover:bg-red-500/10",
  };
  return <button title={title} data-testid={testid} onClick={onClick} disabled={disabled} className={`rounded-md p-2 transition-colors disabled:opacity-50 ${tones[tone]}`}>{children}</button>;
}
