import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader, Loading } from "@/components/common";
import { PrimaryButton, GhostButton, TextField, SelectField } from "@/components/Modal";
import { toast } from "sonner";
import { Plus, X, Save, RotateCcw, ListChecks } from "lucide-react";

export default function Presets() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rev, setRev] = useState(0);

  const load = async () => {
    const { data } = await api.get("/config/presets");
    setCfg(data); setRev((r) => r + 1);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      // normalise ladders to numeric arrays
      const ladders = {};
      Object.entries(cfg.ladders || {}).forEach(([k, rows]) => {
        ladders[k] = (rows || []).map((r) => r.map((n) => Number(n)).filter((n) => !Number.isNaN(n))).filter((r) => r.length === 3);
      });
      const payload = {
        frame_rates: cfg.frame_rates, resolutions: cfg.resolutions, regions: cfg.regions,
        protocols_out: cfg.protocols_out, ladders, defaults: cfg.defaults,
      };
      const { data } = await api.put("/config/presets", payload);
      setCfg(data); toast.success("Presets saved — dropdowns across the app now use these values");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const reset = async () => {
    if (!window.confirm("Reset all presets back to factory defaults?")) return;
    try { const { data } = await api.post("/config/presets/reset"); setCfg(data); setRev((r) => r + 1); toast.success("Presets reset to defaults"); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (!cfg) return <Loading />;

  const setKey = (k, v) => setCfg({ ...cfg, [k]: v });
  const setDefault = (k, v) => setCfg({ ...cfg, defaults: { ...cfg.defaults, [k]: v } });

  return (
    <div className="space-y-6" data-testid="presets-page">
      <PageHeader title="Presets" subtitle="Everything the operators can pick is configured here — nothing is hardcoded.">
        <div className="flex gap-2">
          <GhostButton testid="reset-presets" onClick={reset}><span className="flex items-center gap-1.5"><RotateCcw className="h-4 w-4" /> Reset</span></GhostButton>
          <PrimaryButton testid="save-presets" onClick={save} disabled={saving}><span className="flex items-center gap-1.5"><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Presets"}</span></PrimaryButton>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChipCard title="Frame rates (fps)" testid="fps" items={cfg.frame_rates} onChange={(v) => setKey("frame_rates", v)} placeholder="e.g. 25" />
        <ChipCard title="Resolutions" testid="res" items={cfg.resolutions} onChange={(v) => setKey("resolutions", v)} placeholder="e.g. 1080p" />
        <ChipCard title="Regions / Edge locations" testid="regions" items={cfg.regions} onChange={(v) => setKey("regions", v)} placeholder="e.g. EU-West" />
        <ChipCard title="Delivery protocols" testid="proto" items={cfg.protocols_out} onChange={(v) => setKey("protocols_out", v)} placeholder="e.g. HLS" />
      </div>

      <LadderEditor key={rev} ladders={cfg.ladders} onChange={(v) => setKey("ladders", v)} />

      <div className="rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5">
        <div className="mb-4 flex items-center gap-2"><ListChecks className="h-4 w-4 text-sky-400" /><h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">Defaults for new streams & channels</h3></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField label="Default frame rate" testid="def-fps" value={String(cfg.defaults.fps)} onChange={(v) => setDefault("fps", v)} options={cfg.frame_rates} />
          <SelectField label="Default ABR ladder" testid="def-ladder" value={cfg.defaults.ladder} onChange={(v) => setDefault("ladder", v)} options={Object.keys(cfg.ladders || {})} />
          <TextField label="Keyframe interval (s)" testid="def-keyframe" type="number" value={cfg.defaults.keyframe_s} onChange={(v) => setDefault("keyframe_s", parseFloat(v) || 2)} />
          <TextField label="HLS segment (s)" testid="def-seg" type="number" value={cfg.defaults.hls_segment_s} onChange={(v) => setDefault("hls_segment_s", parseInt(v) || 4)} />
        </div>
      </div>

      <p className="font-mono text-[11px] text-slate-500">
        Codecs & hardware acceleration (NVENC/QSV/VAAPI, MPEG-2, AAC/MP2…) are auto-detected from this server's FFmpeg and cannot be faked — see the Media Server page.
      </p>
    </div>
  );
}

function ChipCard({ title, items, onChange, placeholder, testid }) {
  const [text, setText] = useState("");
  const add = () => {
    const v = text.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setText("");
  };
  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5" data-testid={`chipcard-${testid}`}>
      <h3 className="mb-3 font-mono text-xs uppercase tracking-widest text-slate-400">{title}</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        {items.map((it) => (
          <span key={it} className="flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 font-mono text-xs text-sky-300">
            {it}
            <button data-testid={`chip-remove-${testid}-${it}`} onClick={() => onChange(items.filter((x) => x !== it))} className="text-sky-400/70 hover:text-red-400"><X className="h-3 w-3" /></button>
          </span>
        ))}
        {items.length === 0 && <span className="font-mono text-xs text-slate-600">— empty —</span>}
      </div>
      <div className="flex gap-2">
        <input data-testid={`chip-input-${testid}`} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()} placeholder={placeholder}
          className="flex-1 rounded-lg border border-[#1E293B] bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-sky-500/50" />
        <button data-testid={`chip-add-${testid}`} onClick={add} className="flex items-center gap-1 rounded-lg border border-[#1E293B] bg-slate-950/40 px-3 text-sm text-slate-300 hover:bg-[#1E293B]"><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function LadderEditor({ ladders, onChange }) {
  const [newKey, setNewKey] = useState("");
  const toText = (rows) => (rows || []).map((r) => r.join(",")).join("\n");
  const fromText = (t) => t.split("\n").map((l) => l.split(",").map((s) => s.trim())).filter((r) => r.length >= 3);

  const [texts, setTexts] = useState(() =>
    Object.fromEntries(Object.entries(ladders || {}).map(([k, rows]) => [k, toText(rows)])));

  // resync when ladder keys change externally (e.g. after Reset or add/remove)
  useEffect(() => {
    setTexts((prev) => {
      const next = {};
      Object.entries(ladders || {}).forEach(([k, rows]) => {
        next[k] = k in prev ? prev[k] : toText(rows);
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(ladders || {}).join("|")]);

  const editRows = (key, text) => {
    setTexts((p) => ({ ...p, [key]: text }));
    onChange({ ...ladders, [key]: fromText(text) });
  };
  const addLadder = () => {
    const k = newKey.trim();
    if (k && !ladders[k]) { onChange({ ...ladders, [k]: [[720, 3000, 128]] }); }
    setNewKey("");
  };
  const removeLadder = (key) => {
    const next = { ...ladders }; delete next[key]; onChange(next);
  };

  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5" data-testid="ladder-editor">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-mono text-xs uppercase tracking-widest text-slate-400">ABR ladders — one rung per line: <span className="text-slate-500">height,videoKbps,audioKbps</span></h3>
        <div className="flex gap-2">
          <input data-testid="ladder-newkey" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="new ladder name"
            className="rounded-lg border border-[#1E293B] bg-slate-950/60 px-3 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-sky-500/50" />
          <button data-testid="ladder-add" onClick={addLadder} className="flex items-center gap-1 rounded-lg border border-[#1E293B] bg-slate-950/40 px-3 text-sm text-slate-300 hover:bg-[#1E293B]"><Plus className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Object.keys(ladders || {}).map((key) => (
          <div key={key} className="rounded-lg border border-[#1E293B] bg-slate-950/40 p-3" data-testid={`ladder-${key}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-sm font-semibold text-sky-300">{key}</span>
              <button data-testid={`ladder-remove-${key}`} onClick={() => removeLadder(key)} className="rounded-md p-1 text-red-400 hover:bg-red-500/10"><X className="h-4 w-4" /></button>
            </div>
            <textarea data-testid={`ladder-text-${key}`} value={texts[key] ?? ""} onChange={(e) => editRows(key, e.target.value)} rows={4}
              className="w-full rounded-lg border border-[#1E293B] bg-slate-950/60 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-sky-500/50" />
          </div>
        ))}
      </div>
    </div>
  );
}
