import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader, Loading, StatusBadge, Readout, CodecChip } from "@/components/common";
import Modal, { TextField, SelectField, PrimaryButton, GhostButton } from "@/components/Modal";
import HlsPlayer from "@/components/HlsPlayer";
import { toast } from "sonner";
import { Plus, Play, Square, Trash2, Server, Radio, Terminal, Search, Loader2, Save, Pencil } from "lucide-react";

const empty = { name: "", source: "test", source_url: "", ingest_port: 9000, ladder: "720p", fps: "50", keyframe_s: 2, video_codec: "H.264", audio_codec: "AAC", hw: "auto", push_url: "", dvr: false, region: "EU-West" };

export default function Engine() {
  const [channels, setChannels] = useState(null);
  const [status, setStatus] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null); // null=closed, "new"=create, id=edit
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState(empty);
  const [probeText, setProbeText] = useState("");
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState("");

  const load = async () => {
    const [c, s] = await Promise.all([api.get("/channels"), api.get("/engine/status")]);
    setChannels(c.data); setStatus(s.data);
    setSelected((prev) => c.data.find((x) => x.id === prev?.id) || prev);
  };

  useEffect(() => {
    load();
    const id = setInterval(() => api.get("/channels").then((r) => {
      setChannels(r.data);
      setSelected((prev) => prev ? r.data.find((x) => x.id === prev.id) || prev : prev);
    }), 4000);
    return () => clearInterval(id);
  }, []);

  const openCreate = () => {
    setForm({ ...empty, fps: status?.frame_rates?.[0] || "50", ladder: status?.ladders?.[0] || "720p" });
    setEditing("new");
  };

  const openEdit = (ch) => {
    setForm({
      name: ch.name, source: ch.source || "test", source_url: ch.source_url || "",
      ingest_port: ch.ingest_port || 9000, ladder: ch.ladder || "720p",
      fps: String(ch.fps || "50"), keyframe_s: ch.keyframe_s ?? 2,
      video_codec: ch.video_codec || "H.264", audio_codec: ch.audio_codec || "AAC",
      hw: ch.hw || "auto", push_url: ch.push_url || "", dvr: !!ch.dvr, region: ch.region || "EU-West",
    });
    setEditing(ch.id);
  };

  const save = async () => {
    try {
      const payload = { ...form, ingest_port: parseInt(form.ingest_port) || 9000, keyframe_s: parseFloat(form.keyframe_s) || 2 };
      if (editing === "new") {
        const { data } = await api.post("/channels", payload);
        toast.success("Channel created"); setEditing(null); setForm(empty);
        await load(); setSelected(data);
      } else {
        const { data } = await api.put(`/channels/${editing}`, payload);
        toast.success("Channel updated"); setEditing(null); setForm(empty);
        await load(); setSelected(data);
      }
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const act = async (ch, action) => {
    setBusy(ch.id);
    try {
      const { data } = await api.post(`/channels/${ch.id}/${action}`);
      toast.success(action === "start" ? "Encoder started — live output ready" : "Encoder stopped");
      setSelected(data); load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setBusy(null); }
  };

  const remove = async (id) => {
    try { await api.delete(`/channels/${id}`); toast.success("Channel deleted"); if (selected?.id === id) setSelected(null); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const record = async (ch) => {
    try { const { data } = await api.post(`/channels/${ch.id}/record`); toast.success(`Saved DVR recording (${data.duration_s}s) to VOD library`); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const doProbe = async () => {
    setProbing(true);
    try {
      const { data } = await api.post("/engine/probe", { source: probeText });
      if (data.error) toast.error(data.error);
      else toast.success("Source probed — see result");
      setProbeResult(data.info || data.error);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setProbing(false); }
  };

  if (!channels || !status) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader title="Media Server" subtitle="Real FFmpeg transcoding engine — live HLS ABR output that plays in the browser.">
        <PrimaryButton testid="new-channel-btn" onClick={openCreate}>
          <span className="flex items-center gap-1.5"><Plus className="h-4 w-4" /> New Channel</span>
        </PrimaryButton>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#1E293B] bg-[#0F172A]/60 px-4 py-3">
        <Server className="h-4 w-4 text-sky-400" />
        <span className="font-mono text-xs text-slate-400">ENGINE</span>
        <StatusBadge status={status.ffmpeg_available ? "connected" : "offline"} label={status.ffmpeg_available ? "FFMPEG ONLINE" : "FFMPEG OFFLINE"} />
        <span className="font-mono text-[11px] text-slate-500">HW: {(status.hardware_accels || ["CPU"]).join(" · ")}</span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {(status.video_codecs || []).map((c) => <CodecChip key={c}>{c}</CodecChip>)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-[#1E293B] bg-[#0F172A]/60 p-3">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-emerald-400">Ingest protocols</p>
          <div className="flex flex-wrap gap-1.5">{(status.input_protocols || []).map((p) => <CodecChip key={p}>{p}</CodecChip>)}</div>
        </div>
        <div className="rounded-lg border border-[#1E293B] bg-[#0F172A]/60 p-3">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-sky-400">Delivery protocols</p>
          <div className="flex flex-wrap gap-1.5">{(status.output_protocols || []).map((p) => <CodecChip key={p}>{p}</CodecChip>)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* channel list */}
        <div className="space-y-3 lg:col-span-4">
          {channels.map((ch) => (
            <button
              key={ch.id}
              data-testid={`channel-${ch.id}`}
              onClick={() => setSelected(ch)}
              className={`w-full rounded-lg border p-4 text-left transition-colors ${
                selected?.id === ch.id ? "border-sky-500/50 bg-sky-500/5" : "border-[#1E293B] bg-[#0F172A]/80 hover:border-sky-500/30"
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="font-medium text-slate-100">{ch.name}</span>
                <StatusBadge status={ch.status === "live" ? "live" : "standby"} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <CodecChip>{ch.source === "test" ? "TEST PATTERN" : ch.source === "bars" ? "SMPTE BARS" : "PULL"}</CodecChip>
                <CodecChip>{ch.ladder} ABR</CodecChip>
                <CodecChip>{ch.video_codec}</CodecChip>
              </div>
              {ch.stats?.running && (
                <div className="mt-2 flex gap-2">
                  <Readout>{ch.stats.variants} renditions</Readout>
                  <Readout>{(ch.stats.buffer_bytes / 1048576).toFixed(1)} MB</Readout>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* player + controls */}
        <div className="lg:col-span-8">
          {!selected ? (
            <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-[#1E293B] text-slate-500">
              <div className="flex flex-col items-center gap-2"><Radio className="h-8 w-8" /><span className="font-mono text-sm">Select a channel</span></div>
            </div>
          ) : (
            <div className="space-y-4">
              {selected.stats?.has_master
                ? <HlsPlayer src={`${selected.playback_url}?t=${selected.id}`} />
                : (
                  <div className="flex aspect-video items-center justify-center rounded-lg border border-[#1E293B] bg-black text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      {selected.stats?.running ? <Loader2 className="h-8 w-8 animate-spin" /> : <Square className="h-8 w-8" />}
                      <span className="font-mono text-sm">{selected.stats?.running ? "Encoder starting…" : "Encoder idle — press Start"}</span>
                    </div>
                  </div>
                )}

              <div className="flex flex-wrap items-center gap-2">
                {selected.stats?.running ? (
                  <button data-testid="stop-channel-btn" onClick={() => act(selected, "stop")} disabled={busy === selected.id}
                    className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-60">
                    <Square className="h-4 w-4" /> Stop Encoder
                  </button>
                ) : (
                  <PrimaryButton testid="start-channel-btn" onClick={() => act(selected, "start")} disabled={busy === selected.id}>
                    <span className="flex items-center gap-1.5"><Play className="h-4 w-4" /> {busy === selected.id ? "Starting…" : "Start Encoder"}</span>
                  </PrimaryButton>
                )}
                <button data-testid="edit-channel-btn" onClick={() => openEdit(selected)}
                  className="flex items-center gap-1.5 rounded-lg border border-[#1E293B] px-4 py-2 text-sm text-slate-300 hover:bg-[#1E293B]">
                  <Pencil className="h-4 w-4" /> Edit
                </button>
                <button data-testid="delete-channel-btn" onClick={() => remove(selected.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-[#1E293B] px-4 py-2 text-sm text-slate-400 hover:bg-[#1E293B]">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
                {selected.stats?.has_master && (
                  <button data-testid="record-channel-btn" onClick={() => record(selected)}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20">
                    <Save className="h-4 w-4" /> Save Recording → VOD
                  </button>
                )}
                {selected.stats?.has_master && (
                  <a data-testid="playback-link" href={`${process.env.REACT_APP_BACKEND_URL}${selected.playback_url}`} target="_blank" rel="noreferrer"
                    className="ml-auto font-mono text-xs text-sky-400 hover:underline">open .m3u8 ↗</a>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Status" value={selected.status.toUpperCase()} />
                <Metric label="Hardware" value={selected.stats?.hw || "—"} />
                <Metric label="Renditions" value={selected.stats?.variants ?? 0} />
                <Metric label="Buffer" value={`${((selected.stats?.buffer_bytes || 0) / 1048576).toFixed(1)} MB`} />
              </div>

              {selected.stats?.running && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#1E293B] bg-[#0F172A]/60 px-4 py-3">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">Quality Control</span>
                  <StatusBadge status={selected.stats.qc?.healthy ? "healthy" : "warning"} label={selected.stats.qc?.healthy ? "SIGNAL OK" : "CHECK"} />
                  <StatusBadge status={selected.stats.qc?.black ? "error" : "standby"} label={selected.stats.qc?.black ? "BLACK FRAME" : "NO BLACK"} />
                  <StatusBadge status={selected.stats.qc?.freeze ? "warning" : "standby"} label={selected.stats.qc?.freeze ? "FROZEN" : "MOTION OK"} />
                  <StatusBadge status={selected.stats.qc?.stalled ? "error" : "standby"} label={selected.stats.qc?.stalled ? "STALLED" : "STREAMING"} />
                </div>
              )}

              {selected.ingest_endpoint && (
                <div className="rounded-lg border border-[#1E293B] bg-slate-950/50 p-3 font-mono text-xs text-slate-400">
                  ingest: <span className="text-emerald-400">{selected.ingest_endpoint}</span>
                </div>
              )}

              {selected.stats?.running && (
                <div className="rounded-lg border border-[#1E293B] bg-slate-950/60 p-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-slate-400"><Terminal className="h-3.5 w-3.5" /><span className="font-mono text-[11px] uppercase tracking-wider">FFmpeg log</span></div>
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-emerald-400/80">{selected.log || "…"}</pre>
                </div>
              )}
            </div>
          )}

          {/* source probe */}
          <div className="mt-6 rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-4">
            <h3 className="mb-3 font-mono text-xs uppercase tracking-widest text-slate-400">Probe Source (real ffprobe)</h3>
            <div className="flex gap-2">
              <input data-testid="probe-input" value={probeText} onChange={(e) => setProbeText(e.target.value)}
                placeholder="https://…/stream.m3u8 or .mp4"
                className="flex-1 rounded-lg border border-[#1E293B] bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-sky-500/50" />
              <button data-testid="probe-btn" onClick={doProbe} disabled={!probeText || probing}
                className="flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-slate-950/40 px-4 text-sm text-slate-300 hover:bg-[#1E293B] disabled:opacity-60">
                <Search className="h-4 w-4" /> Probe
              </button>
            </div>
            {probeResult && <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950/60 p-3 font-mono text-[11px] text-slate-300">{probeResult}</pre>}
          </div>
        </div>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)}
        title={editing === "new" ? "New Channel" : "Edit Channel"}
        subtitle="Configure a real transcoding channel — ingest, codec, frame rate, hardware & delivery."
        footer={<><GhostButton testid="cancel-channel" onClick={() => setEditing(null)}>Cancel</GhostButton><PrimaryButton testid="save-channel" onClick={save}>{editing === "new" ? "Create Channel" : "Save Changes"}</PrimaryButton></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><TextField label="Channel Name" testid="ch-name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Studio A Live" /></div>
          <SelectField label="Ingest Source" testid="ch-source" value={form.source} onChange={(v) => setForm({ ...form, source: v })}
            options={[
              { value: "test", label: "Generated Test Pattern" },
              { value: "bars", label: "SMPTE Color Bars" },
              { value: "url", label: "Pull from URL (HLS/RTSP/MP4/RTMP)" },
              { value: "srt-listen", label: "SRT Listener (push-in)" },
              { value: "rtmp-listen", label: "RTMP Listener (push-in)" },
            ]} />
          <SelectField label="ABR Ladder" testid="ch-ladder" value={form.ladder} onChange={(v) => setForm({ ...form, ladder: v })} options={status.ladders} />
          <SelectField label="Frame Rate (fps)" testid="ch-fps" value={form.fps} onChange={(v) => setForm({ ...form, fps: v })} options={status.frame_rates || ["50", "25", "60", "30"]} />
          <TextField label="Keyframe (s)" testid="ch-keyframe" type="number" value={form.keyframe_s} onChange={(v) => setForm({ ...form, keyframe_s: v })} />
          {form.source === "url" && (
            <div className="sm:col-span-2"><TextField label="Pull URL" testid="ch-url" value={form.source_url} onChange={(v) => setForm({ ...form, source_url: v })} placeholder="https://…/index.m3u8 · rtsp://… · srt://…" /></div>
          )}
          {(form.source === "srt-listen" || form.source === "rtmp-listen") && (
            <TextField label="Ingest Port" testid="ch-port" type="number" value={form.ingest_port} onChange={(v) => setForm({ ...form, ingest_port: v })} />
          )}
          <SelectField label="Video Codec" testid="ch-video" value={form.video_codec} onChange={(v) => setForm({ ...form, video_codec: v })} options={status.video_codecs} />
          <SelectField label="Audio Codec" testid="ch-audio" value={form.audio_codec} onChange={(v) => setForm({ ...form, audio_codec: v })} options={status.audio_codecs} />
          <SelectField label="Transcoding Hardware" testid="ch-hw" value={form.hw} onChange={(v) => setForm({ ...form, hw: v })} options={["auto", ...(status.hardware_accels || ["CPU"])]} />
          <TextField label="Push Egress (optional)" testid="ch-push" value={form.push_url} onChange={(v) => setForm({ ...form, push_url: v })} placeholder="rtmp://cdn/live/key · srt://…" />
          <label className="sm:col-span-2 flex items-center gap-2.5 rounded-lg border border-[#1E293B] bg-slate-950/40 px-3 py-2.5 cursor-pointer">
            <input type="checkbox" data-testid="ch-dvr" checked={form.dvr} onChange={(e) => setForm({ ...form, dvr: e.target.checked })} className="h-4 w-4 accent-sky-500" />
            <span className="text-sm text-slate-300">Enable <span className="font-medium text-slate-100">DVR</span> — keep the full seekable window so you can rewind & save recordings</span>
          </label>
        </div>
        <p className="mt-3 font-mono text-[11px] text-slate-500">
          {status.listeners_enabled ? "Listeners enabled — push from OBS to the ingest port." : "Test Pattern / Bars / URL pull work here. SRT/RTMP listeners require the one-command deployment (open ports)."}
        </p>
      </Modal>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-[#1E293B] bg-slate-950/40 p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold text-slate-100 tabular">{value}</p>
    </div>
  );
}
