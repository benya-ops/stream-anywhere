"""Detect real FFmpeg capabilities: encoders, hardware acceleration, protocols."""
import os
import re
import shutil
import subprocess
from functools import lru_cache


def _run(args, timeout=10):
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=timeout).stdout
    except Exception:
        return ""


@lru_cache(maxsize=1)
def ffmpeg_version() -> str:
    out = _run(["ffmpeg", "-hide_banner", "-version"])
    return out.splitlines()[0] if out else "not installed"


@lru_cache(maxsize=1)
def _encoders_raw() -> str:
    return _run(["ffmpeg", "-hide_banner", "-encoders"])


@lru_cache(maxsize=1)
def _protocols_raw() -> str:
    return _run(["ffmpeg", "-hide_banner", "-protocols"])


def has_encoder(name: str) -> bool:
    return bool(re.search(rf"\b{re.escape(name)}\b", _encoders_raw()))


def has_gpu_nvidia() -> bool:
    return shutil.which("nvidia-smi") is not None and _run(["nvidia-smi", "-L"]).strip() != ""


def has_vaapi_device() -> bool:
    return os.path.exists("/dev/dri/renderD128")


@lru_cache(maxsize=1)
def hardware_accels() -> list:
    """Return available, *usable* hardware acceleration backends."""
    accels = ["CPU"]
    if has_encoder("h264_nvenc") and has_gpu_nvidia():
        accels.append("NVENC")
    if has_encoder("h264_qsv"):
        accels.append("QSV")
    if has_encoder("h264_vaapi") and has_vaapi_device():
        accels.append("VAAPI")
    return accels


def auto_hw() -> str:
    a = hardware_accels()
    for pref in ("NVENC", "QSV", "VAAPI"):
        if pref in a:
            return pref
    return "CPU"


# codec + hw -> ffmpeg encoder name
_ENCODER_MATRIX = {
    "H.264": {"CPU": "libx264", "NVENC": "h264_nvenc", "QSV": "h264_qsv", "VAAPI": "h264_vaapi"},
    "H.265/HEVC": {"CPU": "libx265", "NVENC": "hevc_nvenc", "QSV": "hevc_qsv", "VAAPI": "hevc_vaapi"},
    "AV1": {"CPU": "libsvtav1", "NVENC": "av1_nvenc", "QSV": "av1_qsv", "VAAPI": "av1_vaapi"},
    "VP9": {"CPU": "libvpx-vp9", "VAAPI": "vp9_vaapi"},
}
_AUDIO_ENCODERS = {"AAC": "aac", "Opus": "libopus", "MP3": "libmp3lame", "AC-3": "ac3"}


def resolve_encoder(video_codec: str, hw: str) -> tuple:
    """Return (ffmpeg_video_encoder, effective_hw). Falls back to CPU safely."""
    if hw in ("auto", "", None):
        hw = auto_hw()
    matrix = _ENCODER_MATRIX.get(video_codec, _ENCODER_MATRIX["H.264"])
    enc = matrix.get(hw)
    if not enc or not has_encoder(enc):
        # fall back to CPU encoder for this codec
        enc = matrix.get("CPU", "libx264")
        hw = "CPU"
    return enc, hw


def audio_encoder(name: str) -> str:
    return _AUDIO_ENCODERS.get(name, "aac")


def input_protocols() -> list:
    keys = ["srt", "rtmp", "rtsp", "hls", "http", "https", "udp", "rtp", "rist", "tcp", "file"]
    raw = _protocols_raw().lower()
    return [k.upper() for k in keys if re.search(rf"\b{k}\b", raw)]


def output_protocols() -> list:
    # delivery/egress formats supported by the pipeline
    base = ["HLS", "MPEG-DASH"]
    raw = _protocols_raw().lower()
    if "rtmp" in raw:
        base.append("RTMP (push)")
    if "srt" in raw:
        base.append("SRT (push)")
    if "rtp" in raw:
        base.append("RTP/UDP (push)")
    return base


def summary() -> dict:
    return {
        "ffmpeg": ffmpeg_version(),
        "ffmpeg_available": shutil.which("ffmpeg") is not None,
        "hardware_accels": hardware_accels(),
        "auto_hw": auto_hw(),
        "gpu_nvidia": has_gpu_nvidia(),
        "vaapi_device": has_vaapi_device(),
        "video_codecs": list(_ENCODER_MATRIX.keys()),
        "audio_codecs": list(_AUDIO_ENCODERS.keys()),
        "input_protocols": input_protocols(),
        "output_protocols": output_protocols(),
    }
