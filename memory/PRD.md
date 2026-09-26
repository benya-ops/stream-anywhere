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

## Auth model (updated)
- SINGLE super-admin, seeded from env (ADMIN_EMAIL/ADMIN_PASSWORD), re-synced on every startup.
- NO self-registration / NO email reset (endpoints removed). Login only.
- Super admin creates users in Access Control and grants per-module access.
- Roles: `admin` (full + user mgmt) or `user` (module-scoped via `permissions`).
- Modules: engine, streams, sources, transcoding, media, analytics, system. Overview open to all; users mgmt admin-only.
- Enforced backend (require_module) + frontend (canAccess nav/route guards + Overview gated fetches).
- Deploy fix: /app/.dockerignore excludes backend/.env; docker-compose passes admin creds explicitly so the installer-generated password always works.

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

## Implemented (2026-06) — additions
- **Configurable presets (admin, DB-backed — nothing hardcoded):** new `Presets` page (admin only) + `settings.app_presets` doc. GET `/api/config/presets` (all logged-in), PUT (admin), POST `/api/config/presets/reset` (admin). Editable lists: frame_rates, resolutions, regions, protocols_out, ABR ladders (key->[[h,vkbps,akbps]]), defaults (fps/keyframe_s/hls_segment_s/ladder). These feed every dropdown in Streams/Engine.
- **Frame rate everywhere + real conversion:** `fps` on StreamBody & ChannelBody (default "50"); ChannelBody also `keyframe_s`. engine.build_cmd/start_channel take fps/keyframe_s/segment_s/rungs; scale filter appends `,fps={fps}` (drops if non-numeric), GOP = round(fps*keyframe_s). Verified: channel with fps=25 from 30fps source starts live with fps filter in graph.
- **Codecs auto-detected incl MPEG-2 (video) + MP2 (audio):** capabilities.available_video_codecs()/available_audio_codecs() filter by real FFmpeg encoders; `/api/codecs` + engine/status use them. NVENC/QSV/VAAPI still auto-detected.
- **Edit existing resources:** pencil/Edit UI wired to PUT `/api/streams/{id}`, PUT `/api/channels/{id}` (new endpoint), PUT `/api/profiles/{id}` on Streams, Media Server, Transcoding pages.
- **In-app Guide (RU) + downloadable:** `Guide` page (all logged-in), tabs Install&Maintenance / Admin / User, "Скачать .md" + "PDF / Печать" (printable window). Full server install + operations (docker ps/logs/backup/password change).
- Seed defaults de-60p'd (p50/p25) incl an MPEG-2 Contribution profile.
- Deploy fix (2026-06): added boto3/botocore to deploy/requirements.prod.txt (backend container was crash-looping with ModuleNotFoundError: boto3 → 502 on user's server).
- Tested: iter8 100% backend (pytest test_presets_fps.py 10/10) + 100% frontend (Presets/fps/edit/guide flows).

## Auth model note
- canAccess: `guide` open to all logged-in; `presets` admin-only (not a grantable module).

## Backlog / next
- P1: LL-HLS + simultaneous MPEG-DASH packaging.
- P1: Multi-node clustering / load balancing.
- P2: DRM (Widevine/FairPlay), signed tokens, geo-blocking, alerting/webhooks.
