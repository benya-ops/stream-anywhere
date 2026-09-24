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
- Auth: register/login/logout/me/refresh/forgot/reset, brute-force lockout, RBAC.
- Mission Control, Live Streams (simulated telemetry), Sources, Transcoding, VOD/Playout, Analytics, Access Control, Settings.
- REAL Media Server (/engine): FFmpeg 5.1.9 transcoding -> live multi-bitrate HLS ABR, plays in-browser (hls.js). Sources: test pattern, SMPTE bars, URL pull, SRT/RTMP listeners (gated). Optional RTMP/SRT push egress. Inline QC (black/freeze/stalled). HW select auto/CPU/NVENC/VAAPI/QSV.
- System & Server Control (/system): real host CPU/mem/disk/load/GPU (psutil), active encoders, uptime, resource guard (max encoders + CPU limit that blocks starts to protect the host), safe engine restart, capability matrix (codecs/protocols).
- One-command Linux deploy (deploy/): Dockerized MongoDB + FFmpeg backend + nginx web; install.sh auto-installs Docker, generates secrets, sizes resource limits, opens ingest ports (1935 RTMP, 9000-9010 SRT), restart:unless-stopped.
- Tested: iteration_1 (dashboard 23/23), iteration_2 (engine 10/10), iteration_3 (system 20/20 + regression). All green.

## Environment limits (preview)
- No GPU -> hw=CPU only. External push ingest (OBS RTMP/SRT) needs open ports -> activates via the one-command deployment. Playwright headless Chromium lacks H.264 so automated video playback check is N/A (real browsers play).

## Backlog / next
- P1: LL-HLS + simultaneous MPEG-DASH packaging output.
- P1: Multi-node/edge clustering + load balancing.
- P2: DRM (Widevine/FairPlay), auth tokens/geo-blocking, alerting/webhooks, DVR scrubbing.
