# Stream Anywhere — Product Requirements (PRD)

## Original problem statement
User (RU): build professional broadcast software like Flusonic / Nimble. Follow-up: full
functionality + work with all codecs. Product name: **Stream Anywhere**.

## Architecture
- Frontend: React 19 + Tailwind + Recharts + Framer Motion (dark "mission control" UI).
- Backend: FastAPI + MongoDB (motor). All routes under /api.
- Auth: JWT (email/password), roles admin/operator/viewer, admin seeded on startup.
- Media engine metrics (bitrate/viewers/cpu/gpu/packet-loss/previews) are **SIMULATED**
  server-side (simulate.py) — real RTMP/SRT ingest + FFmpeg transcoding require dedicated
  broadcast nodes and are not available in this sandbox.

## Personas
- Broadcast engineer / operator: monitor & control live channels.
- Admin: manage users, access control, all resources.
- Viewer: read-only monitoring.

## Implemented (2026-06)
- Auth + RBAC (admin/operator/viewer); Mission Control, Streams (sim), Sources, Transcoding, Analytics, Access Control, Settings.
- REAL Media Server (/engine): FFmpeg transcode -> live HLS ABR (hls.js playback). Sources: test/bars/URL-pull/SRT+RTMP listeners. HW auto/CPU/NVENC/VAAPI/QSV. Optional RTMP/SRT push egress. Inline QC (black/freeze/stalled). Audio-less sources auto-get a silent track.
- DVR: per-channel DVR mode (full seekable window) + "Save Recording → VOD" capture (finalized as VOD playlist w/ ENDLIST).
- VOD: "Import from URL" transcodes remote file/stream to playable VOD-HLS; Play button (hls.js) on ready assets; served at /api/vod-hls/{id}/. 
- S3 storage: configurable S3-compatible bucket (endpoint/region/bucket/keys/public_base), test-connection, secret masking, optional offload of DVR recordings to bucket.
- System & Server Control (/system): real host CPU/mem/disk/load/GPU (psutil), active encoders, uptime, resource guard (encoder + CPU limits block overload), safe engine restart, capability matrix, S3 config.
- One-command Linux deploy (deploy/): Dockerized Mongo + FFmpeg backend + nginx; install.sh auto-installs Docker, secrets, resource limits, ingest ports; VOD_STORE/HLS as volumes.
- Tested: iter1 dashboard 23/23, iter2 engine 10/10, iter3 system 20/20, iter4 DVR/VOD/S3 15/15. All green.

## Environment limits (preview)
- No GPU -> CPU only. Push-in listeners need open ports (enabled after deploy). Playwright Chromium lacks H.264 so automated video playback not verifiable (real browsers play). VOD_STORE/HLS on pod are ephemeral in preview; persistent docker volumes in deploy.

## Backlog / next
- P1: LL-HLS + simultaneous MPEG-DASH packaging.
- P1: Multi-node clustering / load balancing.
- P2: DRM (Widevine/FairPlay), signed tokens, geo-blocking, alerting/webhooks.
