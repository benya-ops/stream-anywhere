"""
Real media engine for Stream Anywhere.

FFmpeg-based ingest -> transcode (CPU or GPU: NVENC/VAAPI/QSV) -> live HLS ABR ladder,
with optional RTMP/SRT push egress and inline Quality-Control (black / freeze detection).

Ingest sources:
  test        generated test pattern + tone (always works)
  bars        SMPTE color bars + 1kHz tone
  <url>       pull from HLS/MP4/RTMP/RTSP/SRT URL
  srt-listen  bind an SRT listener (needs open UDP port -> deployed host only)
  rtmp-listen bind an RTMP listener (needs open TCP port -> deployed host only)

Push ingest (OBS etc.) requires open ports, so listeners are gated behind
INGEST_LISTENERS_ENABLED (set to 1 by the production installer).
"""
import asyncio
import os
import re
import shutil
import signal
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import capabilities as caps

HLS_ROOT = Path(os.environ.get("HLS_ROOT", "/app/backend/hls_output"))
HLS_ROOT.mkdir(parents=True, exist_ok=True)
LISTENERS_ENABLED = os.environ.get("INGEST_LISTENERS_ENABLED", "0") == "1"

_registry: dict = {}

LADDERS = {
    "1080p": [(1080, 6000, 128), (720, 3000, 128), (480, 1200, 96), (360, 600, 96)],
    "720p": [(720, 3000, 128), (480, 1200, 96), (360, 600, 96)],
    "480p": [(480, 1200, 96), (360, 600, 96)],
    "single": [(720, 2800, 128)],
}


def channel_dir(channel_id: str) -> Path:
    return HLS_ROOT / channel_id


def is_running(channel_id: str) -> bool:
    e = _registry.get(channel_id)
    return bool(e and e["proc"].poll() is None)


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def active_count() -> int:
    return sum(1 for cid in list(_registry) if is_running(cid))


def _has_audio(source: str) -> bool:
    if not shutil.which("ffprobe"):
        return True
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a",
             "-show_entries", "stream=index", "-of", "csv=p=0", source],
            capture_output=True, text=True, timeout=15)
        return bool(out.stdout.strip())
    except Exception:
        return True


_ANULL = ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]


def _input_args(source: str, source_url: str, ingest_port: int):
    """Return (input_args, audio_map, need_shortest)."""
    if source == "test":
        return (["-re", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30",
                 "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000"], "1:a:0", False)
    if source == "bars":
        return (["-re", "-f", "lavfi", "-i", "smptehdbars=size=1920x1080:rate=30",
                 "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000"], "1:a:0", False)
    if source == "srt-listen":
        url = f"srt://0.0.0.0:{ingest_port}?mode=listener&latency=200"
        return (["-i", url], "0:a:0", False)
    if source == "rtmp-listen":
        url = f"rtmp://0.0.0.0:{ingest_port}/live/stream"
        return (["-f", "live_flv", "-listen", "1", "-i", url], "0:a:0", False)
    # pull URL — probe for audio, synthesise a silent track if none
    url = source_url or source
    pre = ["-stream_loop", "-1", "-re"] if re.search(r"\.(mp4|mkv|mov|ts)$", url, re.I) else []
    if _has_audio(url):
        return (pre + ["-i", url], "0:a:0", False)
    return (pre + ["-i", url] + _ANULL, "1:a:0", True)


def _hw_device_args(hw: str):
    if hw == "VAAPI":
        return ["-init_hw_device", "vaapi=va:/dev/dri/renderD128", "-filter_hw_device", "va"]
    if hw == "QSV":
        return ["-init_hw_device", "qsv=hw", "-filter_hw_device", "hw"]
    return []


def _scale_suffix(hw: str):
    if hw == "VAAPI":
        return ",format=nv12,hwupload"
    if hw == "QSV":
        return ",format=nv12,hwupload=extra_hw_frames=64"
    return ""


def build_cmd(channel_id: str, source: str, source_url: str, ingest_port: int,
              ladder_key: str, video_codec: str, audio_codec: str, hw: str,
              push_url: str = "", dvr: bool = False, fps: str = "",
              keyframe_s: float = 2.0, segment_s: int = 4, rungs=None) -> tuple:
    if rungs is None:
        rungs = LADDERS.get(ladder_key, LADDERS["720p"])
    rungs = [tuple(r) for r in rungs]
    try:
        fps_f = float(fps) if fps else 0.0
    except (ValueError, TypeError):
        fps_f = 0.0
    gop = max(2, round((fps_f or 50.0) * (keyframe_s or 2.0)))
    fps_filter = f",fps={fps}" if fps_f > 0 else ""
    venc, eff_hw = caps.resolve_encoder(video_codec, hw)
    aenc = caps.audio_encoder(audio_codec)
    in_args, audio_map, need_shortest = _input_args(source, source_url, ingest_port)

    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "info"]
    cmd += _hw_device_args(eff_hw)
    cmd += in_args

    n = len(rungs)
    # QC (black/freeze) detection at head, then split into N renditions
    head = "[0:v]blackdetect=d=0.5:pic_th=0.98,freezedetect=n=-60dB:d=0.5,"
    head += f"split={n}" + "".join(f"[v{i}]" for i in range(n)) + ";"
    scales = ";".join(f"[v{i}]scale=w=-2:h={r[0]}{fps_filter}{_scale_suffix(eff_hw)}[v{i}out]"
                      for i, r in enumerate(rungs))
    cmd += ["-filter_complex", head + scales]

    var_map = []
    for i, (h, vk, ak) in enumerate(rungs):
        cmd += ["-map", f"[v{i}out]", f"-c:v:{i}", venc]
        if venc in ("libx264", "libx265"):
            cmd += [f"-preset:v:{i}", "veryfast"]
        elif venc.endswith("nvenc"):
            cmd += [f"-preset:v:{i}", "p4", f"-rc:v:{i}", "cbr"]
        elif venc == "libsvtav1":
            cmd += [f"-preset:v:{i}", "8"]
        cmd += [f"-b:v:{i}", f"{vk}k", f"-maxrate:v:{i}", f"{int(vk*1.1)}k",
                f"-bufsize:v:{i}", f"{vk*2}k", "-g", str(gop), "-keyint_min", str(gop), "-sc_threshold", "0"]
        cmd += ["-map", audio_map, f"-c:a:{i}", aenc, f"-b:a:{i}", f"{ak}k", "-ac", "2"]
        var_map.append(f"v:{i},a:{i}")

    d = channel_dir(channel_id)
    if need_shortest:
        cmd += ["-shortest"]
    if dvr:
        # DVR: keep the whole window (seekable), event playlist, no segment deletion
        hls_flags = "independent_segments+program_date_time+append_list"
        hls_tail = ["-hls_list_size", "0", "-hls_playlist_type", "event"]
    else:
        hls_flags = "independent_segments+delete_segments+program_date_time"
        hls_tail = ["-hls_list_size", "6"]
    cmd += [
        "-f", "hls", "-hls_time", str(segment_s), *hls_tail,
        "-hls_flags", hls_flags,
        "-hls_segment_type", "mpegts",
        "-hls_segment_filename", str(d / "seg_%v_%03d.ts"),
        "-master_pl_name", "master.m3u8",
        "-var_stream_map", " ".join(var_map),
        str(d / "stream_%v.m3u8"),
    ]

    # optional push egress of the top rendition (RTMP or SRT)
    if push_url:
        fmt = "flv" if push_url.startswith("rtmp") else "mpegts"
        cmd += ["-map", "[v0out]", "-map", audio_map, "-c:v", venc, "-b:v", f"{rungs[0][1]}k",
                "-c:a", aenc, "-b:a", f"{rungs[0][2]}k", "-f", fmt, push_url]

    return cmd, eff_hw


def _preexec():
    os.setsid()
    try:
        os.nice(10)  # lower priority so encoders never starve the control plane
    except Exception:
        pass


def start_channel(channel_id: str, source: str, source_url: str, ingest_port: int,
                  ladder_key: str, video_codec: str, audio_codec: str, hw: str,
                  push_url: str = "", dvr: bool = False, fps: str = "",
                  keyframe_s: float = 2.0, segment_s: int = 4, rungs=None) -> dict:
    if not ffmpeg_available():
        raise RuntimeError("FFmpeg is not installed on this host.")
    if source in ("srt-listen", "rtmp-listen") and not LISTENERS_ENABLED:
        raise RuntimeError("Push-ingest listeners are disabled in this environment. "
                           "Deploy on a host with open ports (installer sets INGEST_LISTENERS_ENABLED=1).")
    if is_running(channel_id):
        stop_channel(channel_id)

    d = channel_dir(channel_id)
    if d.exists():
        shutil.rmtree(d, ignore_errors=True)
    d.mkdir(parents=True, exist_ok=True)

    cmd, eff_hw = build_cmd(channel_id, source, source_url, ingest_port, ladder_key,
                            video_codec, audio_codec, hw, push_url, dvr,
                            fps=fps, keyframe_s=keyframe_s, segment_s=segment_s, rungs=rungs)
    log_file = open(d / "ffmpeg.log", "wb")
    proc = subprocess.Popen(cmd, stdout=log_file, stderr=subprocess.STDOUT, preexec_fn=_preexec)
    _registry[channel_id] = {
        "proc": proc, "started": datetime.now(timezone.utc).isoformat(),
        "log": str(d / "ffmpeg.log"), "cmd": " ".join(cmd), "hw": eff_hw,
    }
    return {"pid": proc.pid, "hw": eff_hw}


def stop_channel(channel_id: str):
    e = _registry.get(channel_id)
    if e and e["proc"].poll() is None:
        try:
            os.killpg(os.getpgid(e["proc"].pid), signal.SIGTERM)
        except Exception:
            try:
                e["proc"].terminate()
            except Exception:
                pass
    _registry.pop(channel_id, None)


async def wait_for_master(channel_id: str, timeout: float = 25.0) -> bool:
    master = channel_dir(channel_id) / "master.m3u8"
    loop = asyncio.get_event_loop()
    deadline = loop.time() + timeout
    while loop.time() < deadline:
        if master.exists() and list(channel_dir(channel_id).glob("seg_*.ts")):
            return True
        if not is_running(channel_id):
            return False
        await asyncio.sleep(0.5)
    return master.exists()


def tail_log(channel_id: str, lines: int = 40) -> str:
    e = _registry.get(channel_id)
    log = Path(e["log"]) if e else channel_dir(channel_id) / "ffmpeg.log"
    if not log.exists():
        return ""
    return "\n".join(log.read_text(errors="ignore").splitlines()[-lines:])


def _qc_from_log(text: str) -> dict:
    black = text.count("black_start") - text.count("black_end")
    freeze = text.count("freeze_start") - text.count("freeze_end")
    return {"black": black > 0, "freeze": freeze > 0}


def channel_stats(channel_id: str) -> dict:
    running = is_running(channel_id)
    d = channel_dir(channel_id)
    segs = list(d.glob("seg_*.ts")) if d.exists() else []
    total = sum(s.stat().st_size for s in segs) if segs else 0
    e = _registry.get(channel_id)
    log = tail_log(channel_id, 60) if running else ""
    qc = _qc_from_log(log) if running else {"black": False, "freeze": False}
    has_master = (d / "master.m3u8").exists()
    return {
        "running": running,
        "has_master": has_master,
        "started": e["started"] if e else None,
        "pid": e["proc"].pid if e and running else None,
        "hw": e["hw"] if e else None,
        "segments": len(segs),
        "variants": len(list(d.glob("stream_*.m3u8"))) if d.exists() else 0,
        "buffer_bytes": total,
        "qc": {**qc, "stalled": running and not has_master,
               "healthy": running and has_master and not qc["black"] and not qc["freeze"]},
    }


def probe(source: str) -> dict:
    if not shutil.which("ffprobe"):
        return {"error": "ffprobe not available"}
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries",
             "stream=codec_type,codec_name,width,height,bit_rate,sample_rate,channels,r_frame_rate",
             "-of", "default=noprint_wrappers=1", source],
            capture_output=True, text=True, timeout=15)
        return {"ok": out.returncode == 0, "info": out.stdout or out.stderr}
    except subprocess.TimeoutExpired:
        return {"error": "probe timed out"}
    except Exception as e:
        return {"error": str(e)}


def stop_all():
    for cid in list(_registry):
        stop_channel(cid)


# =====================================================================
# VOD: transcode a file/URL to a seekable VOD-HLS ladder, and capture DVR
# =====================================================================
VOD_STORE = Path(os.environ.get("VOD_STORE", "/app/backend/vod_store"))
VOD_STORE.mkdir(parents=True, exist_ok=True)
_vod_procs: dict = {}


def vod_dir(vid: str) -> Path:
    return VOD_STORE / vid


def start_vod_transcode(vid: str, source: str, ladder_key: str = "720p",
                        video_codec: str = "H.264", audio_codec: str = "AAC",
                        hw: str = "auto") -> dict:
    if not ffmpeg_available():
        raise RuntimeError("FFmpeg not installed.")
    rungs = LADDERS.get(ladder_key, LADDERS["720p"])
    venc, eff_hw = caps.resolve_encoder(video_codec, hw)
    aenc = caps.audio_encoder(audio_codec)
    d = vod_dir(vid)
    if d.exists():
        shutil.rmtree(d, ignore_errors=True)
    d.mkdir(parents=True, exist_ok=True)

    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "info"] + _hw_device_args(eff_hw)
    cmd += ["-i", source]
    has_audio = _has_audio(source)
    if not has_audio:
        cmd += _ANULL
        audio_in = "1:a:0"
    else:
        audio_in = "0:a:0"
    n = len(rungs)
    head = f"[0:v]split={n}" + "".join(f"[v{i}]" for i in range(n)) + ";"
    scales = ";".join(f"[v{i}]scale=w=-2:h={r[0]}{_scale_suffix(eff_hw)}[v{i}out]"
                      for i, r in enumerate(rungs))
    cmd += ["-filter_complex", head + scales]
    var_map = []
    for i, (h, vk, ak) in enumerate(rungs):
        cmd += ["-map", f"[v{i}out]", f"-c:v:{i}", venc]
        if venc in ("libx264", "libx265"):
            cmd += [f"-preset:v:{i}", "veryfast"]
        elif venc.endswith("nvenc"):
            cmd += [f"-preset:v:{i}", "p4"]
        cmd += [f"-b:v:{i}", f"{vk}k", "-g", "60", "-keyint_min", "60", "-sc_threshold", "0"]
        cmd += ["-map", audio_in, f"-c:a:{i}", aenc, f"-b:a:{i}", f"{ak}k", "-ac", "2"]
        var_map.append(f"v:{i},a:{i}")
    if not has_audio:
        cmd += ["-shortest"]
    cmd += [
        "-f", "hls", "-hls_time", "6", "-hls_list_size", "0",
        "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
        "-hls_segment_type", "mpegts",
        "-hls_segment_filename", str(d / "seg_%v_%03d.ts"),
        "-master_pl_name", "master.m3u8",
        "-var_stream_map", " ".join(var_map),
        str(d / "stream_%v.m3u8"),
    ]
    log = open(d / "ffmpeg.log", "wb")
    proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, preexec_fn=_preexec)
    _vod_procs[vid] = proc
    return {"pid": proc.pid, "hw": eff_hw}


def vod_status(vid: str) -> dict:
    d = vod_dir(vid)
    has_master = (d / "master.m3u8").exists()
    proc = _vod_procs.get(vid)
    running = bool(proc and proc.poll() is None)
    if running:
        status = "transcoding"
    elif has_master:
        status = "ready"
    elif proc is not None:
        status = "error"
    else:
        status = "ready" if has_master else "unknown"
    segs = list(d.glob("seg_*.ts")) if d.exists() else []
    return {"status": status, "has_master": has_master, "segments": len(segs),
            "size_gb": round(sum(s.stat().st_size for s in segs) / 1073741824, 3) if segs else 0.0}


def _finalize_vod_playlists(d: Path):
    """Turn live/event HLS playlists into seekable VOD playlists."""
    for pl in d.glob("stream_*.m3u8"):
        txt = pl.read_text(errors="ignore")
        if "#EXT-X-PLAYLIST-TYPE:EVENT" in txt:
            txt = txt.replace("#EXT-X-PLAYLIST-TYPE:EVENT", "#EXT-X-PLAYLIST-TYPE:VOD")
        elif "#EXT-X-PLAYLIST-TYPE" not in txt:
            txt = txt.replace("#EXT-X-VERSION:6", "#EXT-X-VERSION:6\n#EXT-X-PLAYLIST-TYPE:VOD", 1)
        if "#EXT-X-ENDLIST" not in txt:
            txt = txt.rstrip() + "\n#EXT-X-ENDLIST\n"
        pl.write_text(txt)


def record_channel_to_vod(channel_id: str, vid: str) -> dict:
    """Snapshot a running channel's HLS window into a permanent VOD asset."""
    src = channel_dir(channel_id)
    if not (src / "master.m3u8").exists():
        raise RuntimeError("Channel has no output to record yet.")
    dst = vod_dir(vid)
    if dst.exists():
        shutil.rmtree(dst, ignore_errors=True)
    shutil.copytree(src, dst)
    _finalize_vod_playlists(dst)
    segs = list(dst.glob("seg_*.ts"))
    variants = len(list(dst.glob("stream_*.m3u8")))
    # approx duration = segments per variant * 4s
    per_variant = max(1, len(segs) // max(1, variants))
    return {"duration_s": per_variant * 4,
            "size_gb": round(sum(s.stat().st_size for s in segs) / 1073741824, 3)}

