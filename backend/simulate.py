"""
MOCKED broadcast engine metrics generator.

Real RTMP/SRT ingest and FFmpeg transcoding cannot run inside this web sandbox,
so live metrics (bitrate, viewers, cpu, packet loss) are synthesized here in a
realistic, time-varying way so the control panel behaves like a live system.
"""
import hashlib
import math
import time


def _seed(key: str) -> float:
    h = hashlib.md5(key.encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def live_metrics(stream_id: str, base_bitrate: float = 6.0, base_viewers: int = 800):
    """Return synthesized live metrics that drift smoothly over time."""
    t = time.time()
    s = _seed(stream_id)
    phase = s * math.tau
    slow = math.sin(t / 30.0 + phase)
    fast = math.sin(t / 6.0 + phase * 2)

    bitrate = round(base_bitrate * (1 + 0.10 * slow + 0.04 * fast), 2)
    viewers = max(0, int(base_viewers * (1 + 0.18 * slow) + 40 * fast))
    fps = round(60 - abs(fast) * 1.2, 1)
    cpu = round(28 + 22 * (0.5 + 0.5 * slow) + 6 * abs(fast), 1)
    gpu = round(40 + 30 * (0.5 + 0.5 * math.sin(t / 24.0 + phase)), 1)
    packet_loss = round(max(0.0, 0.4 * (0.5 + 0.5 * fast) - 0.15), 3)
    latency_ms = int(220 + 120 * (0.5 + 0.5 * slow))
    return {
        "bitrate_mbps": bitrate,
        "viewers": viewers,
        "fps": fps,
        "cpu_pct": cpu,
        "gpu_pct": gpu,
        "packet_loss_pct": packet_loss,
        "latency_ms": latency_ms,
    }


def series(stream_key: str, points: int = 48, base: float = 6.0, spread: float = 0.25):
    """Return a smooth time-series list for charts (per-minute buckets)."""
    now = int(time.time() // 60 * 60)
    s = _seed(stream_key)
    out = []
    for i in range(points):
        ts = now - (points - 1 - i) * 60
        phase = s * math.tau
        v = base * (1 + spread * math.sin((ts / 300.0) + phase) + 0.08 * math.sin(ts / 60.0 + phase * 3))
        out.append({"t": ts, "v": round(max(0, v), 3)})
    return out
