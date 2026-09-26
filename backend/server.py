import os
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional

from fastapi.responses import FileResponse

from db import db, client
from auth import auth_router, get_current_user, require_role, seed_admin, hash_password
from seed import seed_sample_data
from simulate import live_metrics, series
import engine
import storage
import capabilities as caps
import psutil

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("stream-anywhere")

app = FastAPI(title="Stream Anywhere API")
api_router = APIRouter(prefix="/api")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def new_id():
    return str(uuid.uuid4())


# Modules a non-admin user can be granted access to (super-admin has all)
MODULES = ["engine", "streams", "sources", "transcoding", "media", "analytics", "system"]


def require_module(mod: str):
    async def _checker(user: dict = Depends(get_current_user)):
        if user.get("role") == "admin":
            return user
        if mod in (user.get("permissions") or []):
            return user
        raise HTTPException(status_code=403, detail=f"No access to '{mod}'")
    return _checker


# =====================================================================
# Configurable presets (admin-managed, DB-backed — nothing hardcoded in UI)
# =====================================================================
DEFAULT_PRESETS = {
    "frame_rates": ["25", "50", "30", "60", "24", "23.976", "29.97", "59.94"],
    "resolutions": ["2160p", "1080p", "720p", "576p", "480p", "360p", "audio"],
    "regions": ["EU-West", "EU-Central", "US-East", "US-West", "AP-South", "Global"],
    "protocols_out": ["HLS", "LL-HLS", "MPEG-DASH", "RTMP", "SRT", "RTSP"],
    # ABR ladders: key -> list of [height, video_kbps, audio_kbps]
    "ladders": {
        "1080p": [[1080, 6000, 128], [720, 3000, 128], [480, 1200, 96], [360, 600, 96]],
        "720p": [[720, 3000, 128], [480, 1200, 96], [360, 600, 96]],
        "480p": [[480, 1200, 96], [360, 600, 96]],
        "single": [[720, 2800, 128]],
    },
    "defaults": {"fps": "50", "keyframe_s": 2.0, "hls_segment_s": 4, "ladder": "720p"},
}


async def get_presets() -> dict:
    doc = await db.settings.find_one({"_id": "app_presets"})
    if not doc:
        return {k: (v.copy() if isinstance(v, (list, dict)) else v) for k, v in DEFAULT_PRESETS.items()}
    doc.pop("_id", None)
    # merge with defaults so newly-added keys always exist
    merged = {**DEFAULT_PRESETS, **doc}
    return merged



# =====================================================================
# Health
# =====================================================================
@api_router.get("/")
async def root():
    return {"service": "Stream Anywhere", "status": "ok"}


# =====================================================================
# Streams
# =====================================================================
class StreamBody(BaseModel):
    name: str
    input: str = ""
    profile: str = ""
    resolution: str = "1080p"
    fps: str = "50"
    protocols_out: List[str] = Field(default_factory=lambda: ["HLS"])
    dvr: bool = False
    region: str = "EU-West"
    base_bitrate: float = 6.0
    base_viewers: int = 500


def enrich_stream(s: dict) -> dict:
    s.pop("_id", None)
    if s.get("status") == "live":
        s["metrics"] = live_metrics(s["id"], s.get("base_bitrate", 6.0), s.get("base_viewers", 500))
    else:
        s["metrics"] = {"bitrate_mbps": 0, "viewers": 0, "fps": 0, "cpu_pct": 0,
                        "gpu_pct": 0, "packet_loss_pct": 0, "latency_ms": 0}
    return s


@api_router.get("/streams")
async def list_streams(user: dict = Depends(require_module("streams"))):
    docs = await db.streams.find({}, {"_id": 0}).to_list(500)
    return [enrich_stream(d) for d in docs]


@api_router.get("/streams/{stream_id}")
async def get_stream(stream_id: str, user: dict = Depends(require_module("streams"))):
    doc = await db.streams.find_one({"id": stream_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Stream not found")
    stream = enrich_stream(doc)
    stream["timeseries"] = {
        "bitrate": series(stream_id + "b", base=stream.get("base_bitrate", 6.0) or 1),
        "viewers": series(stream_id + "v", base=max(stream.get("base_viewers", 100), 1), spread=0.3),
    }
    return stream


@api_router.post("/streams")
async def create_stream(body: StreamBody, user: dict = Depends(require_module("streams"))):
    doc = {"id": new_id(), "created_at": now_iso(), "status": "standby",
           "stream_key": uuid.uuid4().hex[:20], **body.model_dump()}
    await db.streams.insert_one(doc)
    return enrich_stream({k: v for k, v in doc.items() if k != "_id"})


@api_router.put("/streams/{stream_id}")
async def update_stream(stream_id: str, body: StreamBody,
                        user: dict = Depends(require_module("streams"))):
    res = await db.streams.update_one({"id": stream_id}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Stream not found")
    doc = await db.streams.find_one({"id": stream_id}, {"_id": 0})
    return enrich_stream(doc)


class ActionBody(BaseModel):
    action: str  # start | stop | failover


@api_router.post("/streams/{stream_id}/action")
async def stream_action(stream_id: str, body: ActionBody,
                        user: dict = Depends(require_module("streams"))):
    doc = await db.streams.find_one({"id": stream_id})
    if not doc:
        raise HTTPException(404, "Stream not found")
    status_map = {"start": "live", "stop": "offline", "failover": "live"}
    if body.action not in status_map:
        raise HTTPException(400, "Unknown action")
    update = {"status": status_map[body.action]}
    if body.action == "failover":
        update["input"] = "Backup Satellite Feed"
    await db.streams.update_one({"id": stream_id}, {"$set": update})
    doc = await db.streams.find_one({"id": stream_id}, {"_id": 0})
    return enrich_stream(doc)


@api_router.delete("/streams/{stream_id}")
async def delete_stream(stream_id: str, user: dict = Depends(require_module("streams"))):
    res = await db.streams.delete_one({"id": stream_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Stream not found")
    return {"ok": True}


# =====================================================================
# Sources (inputs)
# =====================================================================
class SourceBody(BaseModel):
    name: str
    protocol: str = "SRT"
    mode: str = "Listener"
    port: int = 9001
    url: str = ""
    latency_ms: int = 200
    status: str = "standby"


@api_router.get("/sources")
async def list_sources(user: dict = Depends(require_module("sources"))):
    return await db.sources.find({}, {"_id": 0}).to_list(500)


@api_router.post("/sources")
async def create_source(body: SourceBody, user: dict = Depends(require_module("sources"))):
    doc = {"id": new_id(), "created_at": now_iso(), **body.model_dump()}
    await db.sources.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/sources/{source_id}")
async def update_source(source_id: str, body: SourceBody,
                        user: dict = Depends(require_module("sources"))):
    res = await db.sources.update_one({"id": source_id}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Source not found")
    return await db.sources.find_one({"id": source_id}, {"_id": 0})


@api_router.delete("/sources/{source_id}")
async def delete_source(source_id: str, user: dict = Depends(require_module("sources"))):
    res = await db.sources.delete_one({"id": source_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Source not found")
    return {"ok": True}


# =====================================================================
# Transcoding profiles
# =====================================================================
class ProfileBody(BaseModel):
    name: str
    video_codec: str = "H.264"
    hw: str = "NVENC"
    audio_codec: str = "AAC"
    ladder: List[str] = Field(default_factory=list)
    keyframe_s: float = 2.0
    gpu: bool = True


@api_router.get("/profiles")
async def list_profiles(user: dict = Depends(require_module("transcoding"))):
    return await db.profiles.find({}, {"_id": 0}).to_list(500)


@api_router.post("/profiles")
async def create_profile(body: ProfileBody, user: dict = Depends(require_module("transcoding"))):
    doc = {"id": new_id(), "created_at": now_iso(), **body.model_dump()}
    await db.profiles.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/profiles/{profile_id}")
async def update_profile(profile_id: str, body: ProfileBody,
                         user: dict = Depends(require_module("transcoding"))):
    res = await db.profiles.update_one({"id": profile_id}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Profile not found")
    return await db.profiles.find_one({"id": profile_id}, {"_id": 0})


@api_router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: str, user: dict = Depends(require_module("transcoding"))):
    res = await db.profiles.delete_one({"id": profile_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Profile not found")
    return {"ok": True}


@api_router.get("/codecs")
async def supported_codecs(user: dict = Depends(get_current_user)):
    """Catalogue of codecs / containers — video/audio are auto-detected from this server's FFmpeg."""
    return {
        "video": caps.available_video_codecs(),
        "audio": caps.available_audio_codecs(),
        "hardware": caps.hardware_accels(),
        "containers": ["fMP4", "TS", "WebM", "MKV", "MOV"],
        "delivery": caps.output_protocols(),
    }


# =====================================================================
# Configurable presets API
# =====================================================================
class PresetsBody(BaseModel):
    frame_rates: List[str]
    resolutions: List[str]
    regions: List[str]
    protocols_out: List[str]
    ladders: dict
    defaults: dict


@api_router.get("/config/presets")
async def read_presets(user: dict = Depends(get_current_user)):
    return await get_presets()


@api_router.put("/config/presets")
async def write_presets(body: PresetsBody, user: dict = Depends(require_role("admin"))):
    data = body.model_dump()
    await db.settings.update_one({"_id": "app_presets"}, {"$set": data}, upsert=True)
    return await get_presets()


@api_router.post("/config/presets/reset")
async def reset_presets(user: dict = Depends(require_role("admin"))):
    await db.settings.delete_one({"_id": "app_presets"})
    return await get_presets()



# =====================================================================
# VOD + Playlists
# =====================================================================
class VodBody(BaseModel):
    title: str
    duration_s: int = 0
    size_gb: float = 0.0
    codec: str = "H.264 / AAC"
    resolution: str = "1080p"
    status: str = "ready"
    views: int = 0


def _enrich_vod(v: dict) -> dict:
    v.pop("_id", None)
    if v.get("playable") and v.get("storage") != "s3":
        st = engine.vod_status(v["id"])
        v["status"] = st["status"]
        if not v.get("hls_url"):
            v["hls_url"] = f"/api/vod-hls/{v['id']}/master.m3u8"
    return v


@api_router.get("/vod")
async def list_vod(user: dict = Depends(require_module("media"))):
    docs = await db.vod.find({}, {"_id": 0}).to_list(500)
    return [_enrich_vod(d) for d in docs]


@api_router.post("/vod")
async def create_vod(body: VodBody, user: dict = Depends(require_module("media"))):
    doc = {"id": new_id(), "created_at": now_iso(), "playable": False, **body.model_dump()}
    await db.vod.insert_one(doc)
    doc.pop("_id", None)
    return doc


class VodImportBody(BaseModel):
    title: str
    source_url: str
    ladder: str = "720p"
    video_codec: str = "H.264"
    audio_codec: str = "AAC"


@api_router.post("/vod/import")
async def import_vod(body: VodImportBody, user: dict = Depends(require_module("media"))):
    """Transcode a remote file/stream URL into a seekable, playable VOD-HLS asset."""
    vid = new_id()
    try:
        engine.start_vod_transcode(vid, body.source_url, body.ladder, body.video_codec, body.audio_codec)
    except Exception as e:
        raise HTTPException(500, f"Transcode failed to start: {e}")
    doc = {"id": vid, "created_at": now_iso(), "title": body.title, "duration_s": 0,
           "size_gb": 0.0, "codec": f"{body.video_codec} / {body.audio_codec}",
           "resolution": body.ladder, "status": "transcoding", "views": 0,
           "playable": True, "storage": "local", "hls_url": f"/api/vod-hls/{vid}/master.m3u8",
           "source": body.source_url}
    await db.vod.insert_one(doc)
    doc.pop("_id", None)
    return _enrich_vod(doc)


@api_router.delete("/vod/{vod_id}")
async def delete_vod(vod_id: str, user: dict = Depends(require_module("media"))):
    import shutil as _sh
    res = await db.vod.delete_one({"id": vod_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Asset not found")
    _sh.rmtree(engine.vod_dir(vod_id), ignore_errors=True)
    return {"ok": True}


@api_router.post("/channels/{channel_id}/record")
async def record_channel(channel_id: str, user: dict = Depends(require_module("engine"))):
    """Capture the current DVR window of a live channel into a permanent, playable VOD."""
    doc = await db.channels.find_one({"id": channel_id})
    if not doc:
        raise HTTPException(404, "Channel not found")
    vid = new_id()
    try:
        meta = engine.record_channel_to_vod(channel_id, vid)
    except Exception as e:
        raise HTTPException(400, str(e))
    vdoc = {"id": vid, "created_at": now_iso(), "title": f"{doc['name']} — Recording",
            "duration_s": meta["duration_s"], "size_gb": meta["size_gb"],
            "codec": f"{doc.get('video_codec','H.264')} / {doc.get('audio_codec','AAC')}",
            "resolution": doc.get("ladder", "720p"), "status": "ready", "views": 0,
            "playable": True, "storage": "local", "hls_url": f"/api/vod-hls/{vid}/master.m3u8"}
    # optional S3 offload
    s3cfg = await db.settings.find_one({"_id": "s3"})
    if s3cfg and s3cfg.get("enabled"):
        try:
            url = storage.upload_dir(s3cfg, str(engine.vod_dir(vid)), f"vod/{vid}")
            vdoc["storage"] = "s3"; vdoc["hls_url"] = url
        except Exception as e:
            logger.warning("S3 upload failed: %s", e)
    await db.vod.insert_one(vdoc)
    vdoc.pop("_id", None)
    return _enrich_vod(vdoc)


class PlaylistBody(BaseModel):
    name: str
    items: List[str] = Field(default_factory=list)
    loop: bool = True
    status: str = "scheduled"
    start_at: str = "00:00"


@api_router.get("/playlists")
async def list_playlists(user: dict = Depends(require_module("media"))):
    return await db.playlists.find({}, {"_id": 0}).to_list(500)


@api_router.post("/playlists")
async def create_playlist(body: PlaylistBody, user: dict = Depends(require_module("media"))):
    doc = {"id": new_id(), "created_at": now_iso(), **body.model_dump()}
    await db.playlists.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str, user: dict = Depends(require_module("media"))):
    res = await db.playlists.delete_one({"id": playlist_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Playlist not found")
    return {"ok": True}


# =====================================================================
# Overview + Analytics
# =====================================================================
@api_router.get("/overview")
async def overview(user: dict = Depends(get_current_user)):
    streams = await db.streams.find({}, {"_id": 0}).to_list(500)
    live = [enrich_stream(s) for s in streams if s.get("status") == "live"]
    total_viewers = sum(s["metrics"]["viewers"] for s in live)
    total_ingest = sum(s["metrics"]["bitrate_mbps"] for s in live)
    total_egress = round(total_ingest * 1.35 + total_viewers * 0.0025, 1)
    avg_cpu = round(sum(s["metrics"]["cpu_pct"] for s in live) / len(live), 1) if live else 0
    sources_count = await db.sources.count_documents({})
    connected = await db.sources.count_documents({"status": "connected"})
    return {
        "live_count": len(live),
        "total_streams": len(streams),
        "total_viewers": total_viewers,
        "ingest_mbps": round(total_ingest, 1),
        "egress_mbps": total_egress,
        "avg_cpu_pct": avg_cpu,
        "sources_total": sources_count,
        "sources_connected": connected,
        "nodes": [
            {"name": "edge-eu-west-01", "region": "EU-West", "cpu": live_metrics("node-eu")["cpu_pct"],
             "gpu": live_metrics("node-eu")["gpu_pct"], "status": "healthy"},
            {"name": "edge-us-east-01", "region": "US-East", "cpu": live_metrics("node-us")["cpu_pct"],
             "gpu": live_metrics("node-us")["gpu_pct"], "status": "healthy"},
            {"name": "edge-ap-south-01", "region": "AP-South", "cpu": live_metrics("node-ap")["cpu_pct"],
             "gpu": live_metrics("node-ap")["gpu_pct"], "status": "degraded"},
        ],
    }


@api_router.get("/analytics")
async def analytics(range: str = Query("1h"), user: dict = Depends(require_module("analytics"))):
    points = {"1h": 60, "6h": 72, "24h": 96}.get(range, 60)
    return {
        "range": range,
        "viewers": series("global-viewers", points=points, base=42000, spread=0.35),
        "egress": series("global-egress", points=points, base=880, spread=0.28),
        "ingest": series("global-ingest", points=points, base=210, spread=0.22),
        "packet_loss": series("global-loss", points=points, base=0.35, spread=0.6),
        "top_streams": sorted(
            [enrich_stream(s) for s in await db.streams.find({"status": "live"}, {"_id": 0}).to_list(100)],
            key=lambda s: s["metrics"]["viewers"], reverse=True,
        )[:5],
    }


# =====================================================================
# Users management (admin)
# =====================================================================
class UserCreateBody(BaseModel):
    email: str
    password: str
    name: str = ""
    role: str = "user"                 # "admin" (full) or "user" (module-scoped)
    permissions: List[str] = Field(default_factory=list)


class UserUpdateBody(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    permissions: Optional[List[str]] = None


def _user_public(d: dict) -> dict:
    return {"id": str(d["_id"]), "email": d["email"], "name": d.get("name", ""),
            "role": d.get("role", "user"), "permissions": d.get("permissions", []),
            "superadmin": bool(d.get("superadmin")), "created_at": d.get("created_at")}


@api_router.get("/modules")
async def list_modules(user: dict = Depends(get_current_user)):
    return {"modules": MODULES}


@api_router.get("/users")
async def list_users(user: dict = Depends(require_role("admin"))):
    docs = await db.users.find({}).to_list(500)
    return [_user_public(d) for d in docs]


@api_router.post("/users")
async def create_user(body: UserCreateBody, user: dict = Depends(require_role("admin"))):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already exists")
    role = body.role if body.role in ("admin", "user") else "user"
    perms = MODULES if role == "admin" else [p for p in body.permissions if p in MODULES]
    doc = {"email": email, "password_hash": hash_password(body.password),
           "name": body.name or email.split("@")[0], "role": role,
           "permissions": perms, "superadmin": False, "created_at": now_iso()}
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _user_public(doc)


@api_router.put("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdateBody, user: dict = Depends(require_role("admin"))):
    from bson import ObjectId
    from bson.errors import InvalidId
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        raise HTTPException(404, "User not found")
    target = await db.users.find_one({"_id": oid})
    if not target:
        raise HTTPException(404, "User not found")
    update = {}
    if body.name is not None:
        update["name"] = body.name
    if body.password:
        update["password_hash"] = hash_password(body.password)
    if not target.get("superadmin"):
        if body.role in ("admin", "user"):
            update["role"] = body.role
        if body.permissions is not None:
            update["permissions"] = [p for p in body.permissions if p in MODULES]
        if update.get("role") == "admin":
            update["permissions"] = MODULES
    await db.users.update_one({"_id": oid}, {"$set": update})
    doc = await db.users.find_one({"_id": oid})
    return _user_public(doc)


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_role("admin"))):
    from bson import ObjectId
    from bson.errors import InvalidId
    if str(user["_id"]) == user_id:
        raise HTTPException(400, "Cannot delete yourself")
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        raise HTTPException(404, "User not found")
    target = await db.users.find_one({"_id": oid})
    if target and target.get("superadmin"):
        raise HTTPException(400, "Cannot delete the super admin")
    res = await db.users.delete_one({"_id": oid})
    if res.deleted_count == 0:
        raise HTTPException(404, "User not found")
    return {"ok": True}


# =====================================================================
# Real Media Engine — FFmpeg transcoding + live HLS ABR
# =====================================================================
class ChannelBody(BaseModel):
    name: str
    source: str = "test"          # test | bars | url | srt-listen | rtmp-listen
    source_url: str = ""          # used when source is a pull URL
    ingest_port: int = 9000       # used by srt-listen / rtmp-listen
    ladder: str = "720p"          # 1080p | 720p | 480p | single
    fps: str = "50"               # output frame rate (transcode/convert to this)
    keyframe_s: float = 2.0       # keyframe (GOP) interval in seconds
    video_codec: str = "H.264"
    audio_codec: str = "AAC"
    hw: str = "auto"              # auto | CPU | NVENC | VAAPI | QSV
    push_url: str = ""            # optional RTMP/SRT push egress
    dvr: bool = False             # keep full seekable window for DVR
    region: str = "EU-West"


class ProbeBody(BaseModel):
    source: str


def _chan_public(c: dict) -> dict:
    c.pop("_id", None)
    stats = engine.channel_stats(c["id"])
    c["stats"] = stats
    # only report live once the manifest + first segment exist (avoids player 404 race)
    c["status"] = "live" if (stats["running"] and stats["has_master"]) else \
        ("starting" if stats["running"] else c.get("status", "idle"))
    if c["source"] == "srt-listen":
        c["ingest_endpoint"] = f"srt://<server-ip>:{c.get('ingest_port', 9000)}?mode=caller"
    elif c["source"] == "rtmp-listen":
        c["ingest_endpoint"] = f"rtmp://<server-ip>:{c.get('ingest_port', 9000)}/live/stream"
    c["playback_url"] = f"/api/hls/{c['id']}/master.m3u8"
    return c


@api_router.get("/engine/status")
async def engine_status(user: dict = Depends(require_module("engine"))):
    s = caps.summary()
    presets = await get_presets()
    s.update({"ladders": list(presets.get("ladders", {}).keys()) or list(engine.LADDERS.keys()),
              "frame_rates": presets.get("frame_rates", []),
              "active_encoders": engine.active_count(),
              "listeners_enabled": engine.LISTENERS_ENABLED})
    return s


@api_router.get("/channels")
async def list_channels(user: dict = Depends(require_module("engine"))):
    docs = await db.channels.find({}, {"_id": 0}).to_list(200)
    return [_chan_public(d) for d in docs]


@api_router.get("/channels/{channel_id}")
async def get_channel(channel_id: str, user: dict = Depends(require_module("engine"))):
    doc = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Channel not found")
    out = _chan_public(doc)
    out["log"] = engine.tail_log(channel_id)
    return out


@api_router.post("/channels")
async def create_channel(body: ChannelBody, user: dict = Depends(require_module("engine"))):
    doc = {"id": new_id(), "created_at": now_iso(), "status": "idle", **body.model_dump()}
    await db.channels.insert_one(doc)
    return _chan_public({k: v for k, v in doc.items() if k != "_id"})


@api_router.put("/channels/{channel_id}")
async def update_channel(channel_id: str, body: ChannelBody,
                         user: dict = Depends(require_module("engine"))):
    res = await db.channels.update_one({"id": channel_id}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Channel not found")
    doc = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    return _chan_public(doc)


@api_router.post("/channels/{channel_id}/start")
async def start_channel(channel_id: str, user: dict = Depends(require_module("engine"))):
    doc = await db.channels.find_one({"id": channel_id})
    if not doc:
        raise HTTPException(404, "Channel not found")
    if not engine.ffmpeg_available():
        raise HTTPException(503, "FFmpeg not available on host")
    # resource guard — refuse to start if the host is overloaded (protects the server)
    guard = await _get_guard()
    if engine.active_count() >= guard["max_encoders"]:
        raise HTTPException(429, f"Encoder limit reached ({guard['max_encoders']}). Stop a channel first.")
    cpu = psutil.cpu_percent(interval=0.3)
    if cpu >= guard["cpu_limit_pct"]:
        raise HTTPException(429, f"CPU too high ({cpu:.0f}% ≥ {guard['cpu_limit_pct']}%). Refusing to start to protect the server.")
    try:
        presets = await get_presets()
        pdef = presets.get("defaults", {})
        ladder_key = doc.get("ladder", pdef.get("ladder", "720p"))
        rungs = presets.get("ladders", {}).get(ladder_key)
        fps = str(doc.get("fps") or pdef.get("fps", "50"))
        keyframe_s = float(doc.get("keyframe_s") or pdef.get("keyframe_s", 2.0))
        segment_s = int(pdef.get("hls_segment_s", 4))
        engine.start_channel(channel_id, doc.get("source", "test"), doc.get("source_url", ""),
                             int(doc.get("ingest_port", 9000)), ladder_key,
                             doc.get("video_codec", "H.264"), doc.get("audio_codec", "AAC"),
                             doc.get("hw", "auto"), doc.get("push_url", ""), bool(doc.get("dvr", False)),
                             fps=fps, keyframe_s=keyframe_s, segment_s=segment_s, rungs=rungs)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to start encoder: {e}")
    ready = await engine.wait_for_master(channel_id, timeout=25)
    if not ready:
        log = engine.tail_log(channel_id, 15)
        engine.stop_channel(channel_id)
        raise HTTPException(500, f"Encoder did not produce output. {log[-400:]}")
    await db.channels.update_one({"id": channel_id}, {"$set": {"status": "live"}})
    doc = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    return _chan_public(doc)


@api_router.post("/channels/{channel_id}/stop")
async def stop_channel(channel_id: str, user: dict = Depends(require_module("engine"))):
    engine.stop_channel(channel_id)
    await db.channels.update_one({"id": channel_id}, {"$set": {"status": "idle"}})
    doc = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Channel not found")
    return _chan_public(doc)


@api_router.get("/channels/{channel_id}/stats")
async def channel_stats(channel_id: str, user: dict = Depends(require_module("engine"))):
    return {**engine.channel_stats(channel_id), "log": engine.tail_log(channel_id, 25)}


@api_router.delete("/channels/{channel_id}")
async def delete_channel(channel_id: str, user: dict = Depends(require_module("engine"))):
    engine.stop_channel(channel_id)
    res = await db.channels.delete_one({"id": channel_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Channel not found")
    return {"ok": True}


@api_router.post("/engine/probe")
async def probe_source(body: ProbeBody, user: dict = Depends(require_module("engine"))):
    return engine.probe(body.source)


# ---------- System control & resource guard ----------
DEFAULT_GUARD = {"max_encoders": 4, "cpu_limit_pct": 85}


async def _get_guard() -> dict:
    doc = await db.settings.find_one({"_id": "guard"})
    if not doc:
        return dict(DEFAULT_GUARD)
    return {"max_encoders": doc.get("max_encoders", DEFAULT_GUARD["max_encoders"]),
            "cpu_limit_pct": doc.get("cpu_limit_pct", DEFAULT_GUARD["cpu_limit_pct"])}


class GuardBody(BaseModel):
    max_encoders: int = 4
    cpu_limit_pct: int = 85


def _gpu_stats():
    import shutil as _sh
    import subprocess as _sp
    if not _sh.which("nvidia-smi"):
        return None
    try:
        out = _sp.run(["nvidia-smi", "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
                       "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=5)
        gpus = []
        for line in out.stdout.strip().splitlines():
            p = [x.strip() for x in line.split(",")]
            if len(p) >= 5:
                gpus.append({"name": p[0], "util_pct": float(p[1]), "mem_used_mb": float(p[2]),
                             "mem_total_mb": float(p[3]), "temp_c": float(p[4])})
        return gpus
    except Exception:
        return None


@api_router.get("/system/stats")
async def system_stats(user: dict = Depends(require_module("system"))):
    vm = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    try:
        load = psutil.getloadavg()
    except Exception:
        load = (0, 0, 0)
    import time as _t
    return {
        "cpu_pct": psutil.cpu_percent(interval=0.3),
        "cpu_cores": psutil.cpu_count(),
        "load_avg": [round(x, 2) for x in load],
        "mem_used_pct": vm.percent,
        "mem_used_gb": round(vm.used / 1073741824, 2),
        "mem_total_gb": round(vm.total / 1073741824, 2),
        "disk_used_pct": disk.percent,
        "disk_free_gb": round(disk.free / 1073741824, 1),
        "uptime_s": int(_t.time() - psutil.boot_time()),
        "gpu": _gpu_stats(),
        "active_encoders": engine.active_count(),
        "guard": await _get_guard(),
    }


@api_router.get("/system/capabilities")
async def system_capabilities(user: dict = Depends(require_module("system"))):
    return caps.summary()


@api_router.get("/system/guard")
async def get_guard(user: dict = Depends(require_module("system"))):
    return await _get_guard()


@api_router.put("/system/guard")
async def set_guard(body: GuardBody, user: dict = Depends(require_role("admin"))):
    await db.settings.update_one({"_id": "guard"},
                                 {"$set": {"max_encoders": body.max_encoders,
                                           "cpu_limit_pct": body.cpu_limit_pct}}, upsert=True)
    return await _get_guard()


@api_router.post("/system/engine/restart")
async def restart_engine(user: dict = Depends(require_role("admin"))):
    """Safe engine reset — stops all encoders without touching the control plane."""
    n = engine.active_count()
    engine.stop_all()
    await db.channels.update_many({"status": "live"}, {"$set": {"status": "idle"}})
    return {"ok": True, "stopped": n}


# ---------- S3-compatible object storage ----------
class StorageBody(BaseModel):
    enabled: bool = False
    endpoint_url: str = ""
    region: str = "us-east-1"
    bucket: str = ""
    access_key: str = ""
    secret_key: str = ""
    public_base: str = ""


@api_router.get("/system/storage")
async def get_storage(user: dict = Depends(require_module("system"))):
    cfg = await db.settings.find_one({"_id": "s3"})
    return storage.masked(cfg)


@api_router.put("/system/storage")
async def set_storage(body: StorageBody, user: dict = Depends(require_role("admin"))):
    existing = await db.settings.find_one({"_id": "s3"}) or {}
    data = body.model_dump()
    # keep previously-saved secret if the UI submits the masked placeholder / blank
    if not data["secret_key"] and existing.get("secret_key"):
        data["secret_key"] = existing["secret_key"]
    if data["access_key"].endswith("…") and existing.get("access_key"):
        data["access_key"] = existing["access_key"]
    await db.settings.update_one({"_id": "s3"}, {"$set": data}, upsert=True)
    return storage.masked({**existing, **data})


@api_router.post("/system/storage/test")
async def test_storage(body: StorageBody, user: dict = Depends(require_role("admin"))):
    existing = await db.settings.find_one({"_id": "s3"}) or {}
    data = body.model_dump()
    if not data["secret_key"]:
        data["secret_key"] = existing.get("secret_key", "")
    if data["access_key"].endswith("…"):
        data["access_key"] = existing.get("access_key", "")
    return storage.test_connection(data)


# HLS delivery (public playback so the browser player can fetch segments)
_MEDIA_TYPES = {".m3u8": "application/vnd.apple.mpegurl", ".ts": "video/mp2t",
                ".m4s": "video/iso.segment", ".mp4": "video/mp4"}


@app.get("/api/hls/{channel_id}/{filename}")
async def serve_hls(channel_id: str, filename: str):
    if ".." in filename or "/" in filename:
        raise HTTPException(400, "Invalid path")
    path = engine.channel_dir(channel_id) / filename
    if not path.exists():
        raise HTTPException(404, "Not found")
    ext = path.suffix.lower()
    media = _MEDIA_TYPES.get(ext, "application/octet-stream")
    headers = {"Access-Control-Allow-Origin": "*"}
    if ext == ".m3u8":
        headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return FileResponse(str(path), media_type=media, headers=headers)


@app.get("/api/vod-hls/{vod_id}/{filename}")
async def serve_vod_hls(vod_id: str, filename: str):
    if ".." in filename or "/" in filename:
        raise HTTPException(400, "Invalid path")
    path = engine.vod_dir(vod_id) / filename
    if not path.exists():
        raise HTTPException(404, "Not found")
    ext = path.suffix.lower()
    media = _MEDIA_TYPES.get(ext, "application/octet-stream")
    headers = {"Access-Control-Allow-Origin": "*"}
    if ext == ".m3u8":
        headers["Cache-Control"] = "no-cache"
    return FileResponse(str(path), media_type=media, headers=headers)


# =====================================================================
# Register routers + startup
# =====================================================================
api_router.include_router(auth_router)
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.password_reset_tokens.create_index("token")
    await db.login_attempts.create_index("identifier")
    await db.streams.create_index("id")
    await seed_admin()
    await seed_sample_data()
    if await db.channels.count_documents({}) == 0:
        await db.channels.insert_one({
            "id": new_id(), "created_at": now_iso(), "status": "idle",
            "name": "Demo — Test Pattern (1080p ABR)", "source": "test",
            "ladder": "720p", "video_codec": "H.264", "audio_codec": "AAC", "region": "EU-West",
        })
    logger.info("Stream Anywhere API ready. FFmpeg=%s", engine.ffmpeg_available())


@app.on_event("shutdown")
async def shutdown():
    for cid in list(engine._registry.keys()):
        engine.stop_channel(cid)
    client.close()
