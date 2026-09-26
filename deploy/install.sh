#!/usr/bin/env bash
#
# Stream Anywhere — one-command production installer for Linux.
#
#   sudo bash deploy/install.sh
#
# Installs Docker (if missing), auto-generates secrets, sizes resource limits to
# the host, opens ingest ports, and brings up the full stack (MongoDB + FFmpeg
# media engine + web control panel). Nothing else needs to be configured by hand.
#
set -euo pipefail

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
say()  { echo -e "${BLUE}==>${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
die()  { echo -e "${RED}✗ $*${NC}"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Please run as root:  sudo bash deploy/install.sh"

# --- locate repo root (parent of this deploy/ dir) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
say "Repository: $REPO_ROOT"

# --- install Docker + compose plugin if missing ---
if ! command -v docker >/dev/null 2>&1; then
    say "Installing Docker Engine…"
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker || true
    ok "Docker installed"
else
    ok "Docker present: $(docker --version)"
fi

if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
else
    say "Installing docker compose plugin…"
    apt-get update -y && apt-get install -y docker-compose-plugin || die "Could not install docker compose"
    COMPOSE="docker compose"
fi
ok "Using: $COMPOSE"

# --- generate .env with strong secrets + host-sized limits (idempotent) ---
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    say "Generating deploy/.env …"
    JWT="$(openssl rand -hex 32 2>/dev/null || head -c32 /dev/urandom | xxd -p | tr -d '\n')"
    ADMPASS="$(openssl rand -hex 8 2>/dev/null || echo change-me-$RANDOM)"   # unambiguous hex, no O/0/l confusion
    CPUS="$(nproc)"; [ "$CPUS" -gt 2 ] && CPUS=$((CPUS - 1))          # leave 1 core for the OS
    MEM_KB="$(grep MemTotal /proc/meminfo | awk '{print $2}')"
    MEM_G=$(( MEM_KB / 1024 / 1024 )); [ "$MEM_G" -gt 2 ] && MEM_G=$((MEM_G - 1)); [ "$MEM_G" -lt 1 ] && MEM_G=1
    cat > "$ENV_FILE" <<EOF
DB_NAME=stream_anywhere
JWT_SECRET=$JWT
ADMIN_EMAIL=admin@streamanywhere.io
ADMIN_PASSWORD=$ADMPASS
CORS_ORIGINS=*
BACKEND_CPUS=${CPUS}.0
BACKEND_MEM=${MEM_G}g
HTTP_PORT=80
EOF
    ok "Created deploy/.env (admin password: $ADMPASS)"
else
    ok "Reusing existing deploy/.env"
fi

# --- open firewall ports for ingest/web if ufw is active ---
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    say "Opening firewall ports (80, 1935/tcp, 9000-9010/udp)…"
    ufw allow 80/tcp   >/dev/null 2>&1 || true
    ufw allow 1935/tcp >/dev/null 2>&1 || true
    ufw allow 9000:9010/udp >/dev/null 2>&1 || true
    ok "Firewall updated"
fi

# --- build & launch ---
say "Building and starting containers (first run may take a few minutes)…"
$COMPOSE -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$ENV_FILE" up -d --build

# --- report ---
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"; [ -z "$IP" ] && IP="<server-ip>"
source "$ENV_FILE"
echo
ok "Stream Anywhere is up!"
echo -e "   ${GREEN}Web control panel:${NC} http://$IP/"
echo -e "   ${GREEN}Admin login:${NC}       $ADMIN_EMAIL / $ADMIN_PASSWORD"
echo -e "   ${GREEN}RTMP ingest:${NC}       rtmp://$IP:1935/live/stream"
echo -e "   ${GREEN}SRT ingest:${NC}        srt://$IP:9000?mode=caller  (ports 9000-9010)"
echo
echo -e "   Manage:  $COMPOSE -f deploy/docker-compose.yml [logs -f | restart | down]"
