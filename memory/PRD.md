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
- Mission Control overview: KPIs, bandwidth/viewer charts, edge node health, live preview wall.
- Live Streams: CRUD + start/stop/failover + preview modal, live-polling telemetry.
- Input Sources: CRUD (SRT/RTMP/RTSP/WebRTC/NDI/RIST/WHIP).
- Transcoding: profiles CRUD + ABR ladder + supported codec matrix (H.264/HEVC/AV1/VP9…).
- VOD & Playout: VOD library CRUD + playout schedules.
- Analytics: viewers/bandwidth/packet-loss charts (1h/6h/24h), top channels.
- Access Control: admin user management (create/delete, roles).
- Settings: account/engine/codec info + simulated-media note.
- Tested: 23/23 backend pytest pass; all frontend flows pass (iteration_1.json).

## Backlog / next
- P1: Real media backend integration (FFmpeg/GStreamer or Flusonic/Nimble node bridge).
- P1: WebRTC/HLS real playback in preview modal.
- P2: DRM (Widevine/FairPlay), geo-blocking, publishing tokens/API keys UI.
- P2: DVR scrubbing, alerts/notifications, per-stream historical retention.
