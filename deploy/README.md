# Deploying Stream Anywhere on your own Linux server

A full, self-contained production stack: **MongoDB + FFmpeg media engine + web control panel**.
Everything runs in Docker, so nothing has to be configured by hand inside the server.

## One command

```bash
sudo bash deploy/install.sh
```

The installer will:

1. Install Docker Engine + Compose plugin (if not already present).
2. Auto-generate a strong `JWT_SECRET` and a random admin password into `deploy/.env`.
3. Size the media-engine CPU/RAM limits to your host (leaving headroom for the OS) so a
   heavy stream can never take the whole server down.
4. Open the ingest/web firewall ports (if `ufw` is active).
5. Build and start everything with `docker compose up -d --build`.

When it finishes it prints the panel URL, admin login, and your RTMP/SRT ingest URLs.

## What you get

| Service  | Purpose                                   | Port(s)              |
|----------|-------------------------------------------|----------------------|
| web      | React control panel + nginx reverse proxy | 80 (HTTP)            |
| backend  | FastAPI + FFmpeg transcoding engine       | internal 8001        |
| ingest   | RTMP push / SRT push                       | 1935/tcp, 9000-9010/udp |
| mongo    | Database                                  | internal 27017       |

All services use `restart: unless-stopped`, so they come back automatically after a crash
or a reboot — the control plane stays up independently of the encoders.

## Ingest (push from OBS / an encoder)

- **RTMP:** `rtmp://<server-ip>:1935/live/stream`
- **SRT:**  `srt://<server-ip>:9000?mode=caller` (create an `srt-listen` channel on a port in 9000-9010)

Create a channel in the panel with source **RTMP listener** / **SRT listener**, hit **Start**,
then push to the URL above. Pull ingest (HLS/RTSP/MP4/RTMP URL), generated test patterns and
VOD transcoding also work.

## Delivery (playback)

Every channel is packaged as adaptive HLS and plays in any browser / TV / OTT device:

```
http://<server-ip>/api/hls/<channel-id>/master.m3u8
```

Optional simultaneous **RTMP/SRT push egress** to a CDN or another server is configurable per channel.

## Managing the stack

```bash
docker compose -f deploy/docker-compose.yml logs -f      # tail logs
docker compose -f deploy/docker-compose.yml restart      # restart
docker compose -f deploy/docker-compose.yml down         # stop everything
```

## Hardware (GPU) transcoding

The image ships CPU encoders (x264/x265/SVT-AV1/VP9). For NVIDIA NVENC or Intel/AMD VAAPI,
run on a host with the GPU drivers installed and expose the device to the `backend` service
(e.g. add `--gpus all` / mount `/dev/dri`). The panel auto-detects available accelerators and
lets you pick CPU / NVENC / VAAPI / QSV per channel.
