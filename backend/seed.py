import uuid
from datetime import datetime, timezone

from db import db


def _now():
    return datetime.now(timezone.utc).isoformat()


def _id():
    return str(uuid.uuid4())


SAMPLE_PROFILES = [
    {"name": "1080p60 Broadcast", "video_codec": "H.264", "hw": "NVENC", "audio_codec": "AAC",
     "ladder": ["1080p60@6M", "720p60@3M", "480p30@1.2M", "360p30@0.6M"], "keyframe_s": 2.0, "gpu": True},
    {"name": "HEVC HDR 4K", "video_codec": "H.265/HEVC", "hw": "NVENC", "audio_codec": "AAC",
     "ladder": ["2160p60@18M", "1080p60@8M", "720p60@4M"], "keyframe_s": 2.0, "gpu": True},
    {"name": "AV1 Low-Latency", "video_codec": "AV1", "hw": "QSV", "audio_codec": "Opus",
     "ladder": ["1080p60@4.5M", "720p60@2.4M", "480p30@1M"], "keyframe_s": 1.0, "gpu": True},
    {"name": "Audio-Only Radio", "video_codec": "—", "hw": "CPU", "audio_codec": "Opus",
     "ladder": ["audio@128k", "audio@64k"], "keyframe_s": 0.0, "gpu": False},
]

SAMPLE_SOURCES = [
    {"name": "Studio A — Main Camera", "protocol": "SRT", "mode": "Listener", "port": 9001,
     "url": "srt://ingest.streamanywhere.io:9001", "latency_ms": 200, "status": "connected"},
    {"name": "Field Unit 1", "protocol": "RTMP", "mode": "Push", "port": 1935,
     "url": "rtmp://ingest.streamanywhere.io/live", "latency_ms": 1200, "status": "connected"},
    {"name": "Backup Satellite Feed", "protocol": "RTSP", "mode": "Pull", "port": 554,
     "url": "rtsp://cam-backup.local:554/stream1", "latency_ms": 800, "status": "standby"},
    {"name": "Remote Guest (WebRTC)", "protocol": "WebRTC", "mode": "WHIP", "port": 8443,
     "url": "https://ingest.streamanywhere.io/whip", "latency_ms": 120, "status": "connected"},
    {"name": "NDI Graphics Bus", "protocol": "NDI", "mode": "Discovery", "port": 5960,
     "url": "ndi://GFX-WORKSTATION (Titler)", "latency_ms": 40, "status": "connected"},
]

SAMPLE_STREAMS = [
    {"name": "News Channel HD", "input": "Studio A — Main Camera", "profile": "1080p60 Broadcast",
     "status": "live", "base_bitrate": 6.2, "base_viewers": 12400, "resolution": "1080p60",
     "protocols_out": ["HLS", "DASH", "LL-HLS"], "dvr": True, "region": "EU-West"},
    {"name": "Sports 4K", "input": "Field Unit 1", "profile": "HEVC HDR 4K",
     "status": "live", "base_bitrate": 17.8, "base_viewers": 30800, "resolution": "2160p60",
     "protocols_out": ["HLS", "DASH"], "dvr": True, "region": "US-East"},
    {"name": "Music Festival Live", "input": "Remote Guest (WebRTC)", "profile": "AV1 Low-Latency",
     "status": "live", "base_bitrate": 4.4, "base_viewers": 8600, "resolution": "1080p60",
     "protocols_out": ["LL-HLS", "WebRTC"], "dvr": False, "region": "EU-Central"},
    {"name": "24/7 Radio Stream", "input": "NDI Graphics Bus", "profile": "Audio-Only Radio",
     "status": "live", "base_bitrate": 0.13, "base_viewers": 2100, "resolution": "audio",
     "protocols_out": ["HLS", "ICY"], "dvr": False, "region": "Global"},
    {"name": "Backup Encoder", "input": "Backup Satellite Feed", "profile": "1080p60 Broadcast",
     "status": "standby", "base_bitrate": 6.0, "base_viewers": 0, "resolution": "1080p60",
     "protocols_out": ["HLS"], "dvr": True, "region": "US-West"},
    {"name": "Conference Room B", "input": "Field Unit 1", "profile": "AV1 Low-Latency",
     "status": "offline", "base_bitrate": 0.0, "base_viewers": 0, "resolution": "720p30",
     "protocols_out": ["HLS"], "dvr": False, "region": "AP-South"},
]

SAMPLE_VOD = [
    {"title": "Championship Final — Full Replay", "duration_s": 8100, "size_gb": 14.2,
     "codec": "HEVC / AAC", "resolution": "2160p", "status": "ready", "views": 45200},
    {"title": "Morning News — 2026-06-14", "duration_s": 3600, "size_gb": 3.1,
     "codec": "H.264 / AAC", "resolution": "1080p", "status": "ready", "views": 12800},
    {"title": "Product Launch Keynote", "duration_s": 5400, "size_gb": 6.7,
     "codec": "AV1 / Opus", "resolution": "1080p", "status": "transcoding", "views": 0},
    {"title": "Concert Highlights Reel", "duration_s": 1200, "size_gb": 2.4,
     "codec": "H.264 / AAC", "resolution": "1080p", "status": "ready", "views": 88900},
]


async def seed_sample_data():
    if await db.profiles.count_documents({}) == 0:
        for p in SAMPLE_PROFILES:
            await db.profiles.insert_one({"id": _id(), "created_at": _now(), **p})
    if await db.sources.count_documents({}) == 0:
        for s in SAMPLE_SOURCES:
            await db.sources.insert_one({"id": _id(), "created_at": _now(), **s})
    if await db.streams.count_documents({}) == 0:
        for st in SAMPLE_STREAMS:
            await db.streams.insert_one({
                "id": _id(), "created_at": _now(),
                "stream_key": uuid.uuid4().hex[:20], **st,
            })
    if await db.vod.count_documents({}) == 0:
        for v in SAMPLE_VOD:
            await db.vod.insert_one({"id": _id(), "created_at": _now(), **v})
    if await db.playlists.count_documents({}) == 0:
        await db.playlists.insert_one({
            "id": _id(), "created_at": _now(),
            "name": "Overnight Playout Loop", "items": [
                "Championship Final — Full Replay",
                "Concert Highlights Reel",
                "Morning News — 2026-06-14",
            ], "loop": True, "status": "scheduled", "start_at": "00:00",
        })
