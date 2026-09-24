import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Loader2, VideoOff } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// REAL HLS player — plays the actual FFmpeg-transcoded output via hls.js.
export default function HlsPlayer({ src, poster }) {
  const videoRef = useRef(null);
  const [state, setState] = useState("loading"); // loading | playing | error
  const [level, setLevel] = useState(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    const url = src.startsWith("http") ? src : `${BACKEND_URL}${src}`;
    let hls;
    setState("loading");

    const onOk = () => setState("playing");

    if (Hls.isSupported()) {
      hls = new Hls({ lowLatencyMode: false, backBufferLength: 30, enableWorker: true });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); onOk(); });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => {
        const lv = hls.levels[d.level];
        if (lv) setLevel(`${lv.height}p · ${Math.round(lv.bitrate / 1000)}k`);
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else setState("error");
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener("loadedmetadata", () => { video.play().catch(() => {}); onOk(); });
      video.addEventListener("error", () => setState("error"));
    } else {
      setState("error");
    }
    return () => { if (hls) hls.destroy(); };
  }, [src]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-[#1E293B] bg-black">
      <video ref={videoRef} className="h-full w-full" controls muted playsInline poster={poster} data-testid="hls-video" />
      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex items-center gap-2 text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="font-mono text-sm">Buffering encoder output…</span>
          </div>
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <VideoOff className="h-8 w-8" />
            <span className="font-mono text-sm">No signal — start the channel encoder</span>
          </div>
        </div>
      )}
      {state === "playing" && (
        <>
          <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1">
            <span className="h-2 w-2 rounded-full bg-red-500 live-dot" />
            <span className="font-mono text-[10px] font-bold tracking-wider text-white">LIVE · HLS</span>
          </div>
          {level && <div className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-emerald-400">{level}</div>}
        </>
      )}
    </div>
  );
}
