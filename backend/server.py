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

from db import db, client
from auth import auth_router, get_current_user, require_role, seed_admin, hash_password
from seed import seed_sample_data
from simulate import live_metrics, series

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("stream-anywhere")

app = FastAPI(title="Stream Anywhere API")
api_router = APIRouter(prefix="/api")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def new_id():
    return str(uuid.uuid4())


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
    resolution: str = "1080p60"
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
async def list_streams(user: dict = Depends(get_current_user)):
    docs = await db.streams.find({}, {"_id": 0}).to_list(500)
    return [enrich_stream(d) for d in docs]


@api_router.get("/streams/{stream_id}")
async def get_stream(stream_id: str, user: dict = Depends(get_current_user)):
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
async def create_stream(body: StreamBody, user: dict = Depends(require_role("admin", "operator"))):
    doc = {"id": new_id(), "created_at": now_iso(), "status": "standby",
           "stream_key": uuid.uuid4().hex[:20], **body.model_dump()}
    await db.streams.insert_one(doc)
    return enrich_stream({k: v for k, v in doc.items() if k != "_id"})


@api_router.put("/streams/{stream_id}")
async def update_stream(stream_id: str, body: StreamBody,
                        user: dict = Depends(require_role("admin", "operator"))):
    res = await db.streams.update_one({"id": stream_id}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Stream not found")
    doc = await db.streams.find_one({"id": stream_id}, {"_id": 0})
    return enrich_stream(doc)


class ActionBody(BaseModel):
    action: str  # start | stop | failover


@api_router.post("/streams/{stream_id}/action")
async def stream_action(stream_id: str, body: ActionBody,
                        user: dict = Depends(require_role("admin", "operator"))):
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
async def delete_stream(stream_id: str, user: dict = Depends(require_role("admin", "operator"))):
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
async def list_sources(user: dict = Depends(get_current_user)):
    return await db.sources.find({}, {"_id": 0}).to_list(500)


@api_router.post("/sources")
async def create_source(body: SourceBody, user: dict = Depends(require_role("admin", "operator"))):
    doc = {"id": new_id(), "created_at": now_iso(), **body.model_dump()}
    await db.sources.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/sources/{source_id}")
async def update_source(source_id: str, body: SourceBody,
                        user: dict = Depends(require_role("admin", "operator"))):
    res = await db.sources.update_one({"id": source_id}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Source not found")
    return await db.sources.find_one({"id": source_id}, {"_id": 0})


@api_router.delete("/sources/{source_id}")
async def delete_source(source_id: str, user: dict = Depends(require_role("admin", "operator"))):
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
async def list_profiles(user: dict = Depends(get_current_user)):
    return await db.profiles.find({}, {"_id": 0}).to_list(500)


@api_router.post("/profiles")
async def create_profile(body: ProfileBody, user: dict = Depends(require_role("admin", "operator"))):
    doc = {"id": new_id(), "created_at": now_iso(), **body.model_dump()}
    await db.profiles.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/profiles/{profile_id}")
async def update_profile(profile_id: str, body: ProfileBody,
                         user: dict = Depends(require_role("admin", "operator"))):
    res = await db.profiles.update_one({"id": profile_id}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Profile not found")
    return await db.profiles.find_one({"id": profile_id}, {"_id": 0})


@api_router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: str, user: dict = Depends(require_role("admin", "operator"))):
    res = await db.profiles.delete_one({"id": profile_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Profile not found")
    return {"ok": True}


@api_router.get("/codecs")
async def supported_codecs(user: dict = Depends(get_current_user)):
    """Catalogue of codecs / containers the engine can be configured for."""
    return {
        "video": ["H.264 / AVC", "H.265 / HEVC", "AV1", "VP9", "VP8", "MPEG-2", "ProRes"],
        "audio": ["AAC", "Opus", "MP3", "AC-3", "E-AC-3", "FLAC", "PCM"],
        "hardware": ["NVENC (NVIDIA)", "QSV (Intel)", "AMF (AMD)", "VideoToolbox (Apple)", "CPU (x264/x265)"],
        "containers": ["fMP4", "TS", "WebM", "MKV", "MOV"],
        "delivery": ["HLS", "LL-HLS", "MPEG-DASH", "WebRTC (WHEP)", "RTMP", "SRT", "RTSP"],
    }


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


@api_router.get("/vod")
async def list_vod(user: dict = Depends(get_current_user)):
    return await db.vod.find({}, {"_id": 0}).to_list(500)


@api_router.post("/vod")
async def create_vod(body: VodBody, user: dict = Depends(require_role("admin", "operator"))):
    doc = {"id": new_id(), "created_at": now_iso(), **body.model_dump()}
    await db.vod.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/vod/{vod_id}")
async def delete_vod(vod_id: str, user: dict = Depends(require_role("admin", "operator"))):
    res = await db.vod.delete_one({"id": vod_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Asset not found")
    return {"ok": True}


class PlaylistBody(BaseModel):
    name: str
    items: List[str] = Field(default_factory=list)
    loop: bool = True
    status: str = "scheduled"
    start_at: str = "00:00"


@api_router.get("/playlists")
async def list_playlists(user: dict = Depends(get_current_user)):
    return await db.playlists.find({}, {"_id": 0}).to_list(500)


@api_router.post("/playlists")
async def create_playlist(body: PlaylistBody, user: dict = Depends(require_role("admin", "operator"))):
    doc = {"id": new_id(), "created_at": now_iso(), **body.model_dump()}
    await db.playlists.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str, user: dict = Depends(require_role("admin", "operator"))):
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
async def analytics(range: str = Query("1h"), user: dict = Depends(get_current_user)):
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
    role: str = "viewer"


@api_router.get("/users")
async def list_users(user: dict = Depends(require_role("admin"))):
    docs = await db.users.find({}).to_list(500)
    return [{"id": str(d["_id"]), "email": d["email"], "name": d.get("name", ""),
             "role": d.get("role", "viewer"), "created_at": d.get("created_at")} for d in docs]


@api_router.post("/users")
async def create_user(body: UserCreateBody, user: dict = Depends(require_role("admin"))):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already exists")
    doc = {"email": email, "password_hash": hash_password(body.password),
           "name": body.name or email.split("@")[0], "role": body.role, "created_at": now_iso()}
    res = await db.users.insert_one(doc)
    return {"id": str(res.inserted_id), "email": email, "name": doc["name"], "role": body.role}


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
    res = await db.users.delete_one({"_id": oid})
    if res.deleted_count == 0:
        raise HTTPException(404, "User not found")
    return {"ok": True}


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
    logger.info("Stream Anywhere API ready.")


@app.on_event("shutdown")
async def shutdown():
    client.close()
