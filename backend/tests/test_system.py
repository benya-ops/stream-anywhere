"""
System control + resource guard + engine restart + new channel fields (QC, HW, listeners).
Also does a static check on deploy/ artifacts (bash -n, YAML parse, Dockerfile/nginx grep).
Uses external REACT_APP_BACKEND_URL, admin creds seeded by backend.
"""
import os
import re
import time
import uuid
import shlex
import subprocess
from pathlib import Path

import pytest
import requests
import yaml

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://stream-pro-78.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "admin@streamanywhere.io", "password": "Broadcast2026!"}


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def operator():
    email = f"TEST_op_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": "OpPass!123", "name": "OpSys"}, timeout=15)
    assert r.status_code in (200, 201), r.text
    tok = r.json()["access_token"]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def viewer(admin):
    email = f"TEST_vw_{uuid.uuid4().hex[:8]}@example.com"
    r = admin.post(f"{API}/users", json={"email": email, "password": "Vw!12345", "role": "viewer"})
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    lr = requests.post(f"{API}/auth/login", json={"email": email, "password": "Vw!12345"}, timeout=15)
    assert lr.status_code == 200
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {lr.json()['access_token']}", "Content-Type": "application/json"})
    s.user_id = uid
    yield s
    admin.delete(f"{API}/users/{uid}")


@pytest.fixture(scope="module", autouse=True)
def restore_guard(admin):
    original = admin.get(f"{API}/system/guard").json()
    yield
    admin.put(f"{API}/system/guard", json=original)
    admin.post(f"{API}/system/engine/restart")


# ---------- /system/capabilities ----------
class TestCapabilities:
    def test_capabilities_shape(self, admin):
        r = admin.get(f"{API}/system/capabilities")
        assert r.status_code == 200
        d = r.json()
        assert d["ffmpeg_available"] is True
        assert "ffmpeg version" in d["ffmpeg"].lower() or "ffmpeg" in d["ffmpeg"].lower()
        assert "CPU" in d["hardware_accels"]
        assert d["auto_hw"] in ("CPU", "NVENC", "QSV", "VAAPI")
        for c in ["H.264", "H.265/HEVC"]:
            assert c in d["video_codecs"]
        assert "AAC" in d["audio_codecs"]
        for p in ["SRT", "RTMP", "HLS"]:
            assert p in d["input_protocols"]
        assert "HLS" in d["output_protocols"]
        assert "MPEG-DASH" in d["output_protocols"]
        assert any("push" in x.lower() and ("rtmp" in x.lower() or "srt" in x.lower()) for x in d["output_protocols"])


# ---------- /system/stats ----------
class TestSystemStats:
    def test_stats_real(self, admin):
        r = admin.get(f"{API}/system/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ["cpu_pct", "cpu_cores", "load_avg", "mem_used_pct",
                  "disk_used_pct", "uptime_s", "active_encoders", "guard"]:
            assert k in d, f"missing {k}"
        assert isinstance(d["cpu_cores"], int) and d["cpu_cores"] >= 1
        assert isinstance(d["load_avg"], list) and len(d["load_avg"]) == 3
        assert 0 <= d["cpu_pct"] <= 100
        assert 0 <= d["mem_used_pct"] <= 100
        assert 0 <= d["disk_used_pct"] <= 100
        assert d["uptime_s"] > 0
        assert "max_encoders" in d["guard"] and "cpu_limit_pct" in d["guard"]


# ---------- /system/guard ----------
class TestGuard:
    def test_get_guard(self, admin):
        r = admin.get(f"{API}/system/guard")
        assert r.status_code == 200
        assert "max_encoders" in r.json()

    def test_set_guard_admin(self, admin):
        r = admin.put(f"{API}/system/guard", json={"max_encoders": 3, "cpu_limit_pct": 90})
        assert r.status_code == 200
        assert r.json() == {"max_encoders": 3, "cpu_limit_pct": 90}
        g = admin.get(f"{API}/system/guard").json()
        assert g["max_encoders"] == 3 and g["cpu_limit_pct"] == 90

    def test_guard_rbac_operator(self, operator):
        r = operator.put(f"{API}/system/guard", json={"max_encoders": 1, "cpu_limit_pct": 50})
        assert r.status_code == 403

    def test_guard_rbac_viewer(self, viewer):
        r = viewer.put(f"{API}/system/guard", json={"max_encoders": 1, "cpu_limit_pct": 50})
        assert r.status_code == 403

    def test_guard_blocks_start(self, admin):
        # set to 0 -> starting a channel must be blocked with 429
        assert admin.put(f"{API}/system/guard", json={"max_encoders": 0, "cpu_limit_pct": 99}).status_code == 200
        ch = admin.post(f"{API}/channels",
                        json={"name": f"TEST_guard_{uuid.uuid4().hex[:6]}", "source": "test",
                              "ladder": "480p", "video_codec": "H.264", "audio_codec": "AAC", "hw": "auto"}).json()
        cid = ch["id"]
        try:
            r = admin.post(f"{API}/channels/{cid}/start")
            assert r.status_code == 429, f"expected 429 got {r.status_code}: {r.text}"
        finally:
            admin.delete(f"{API}/channels/{cid}")
            admin.put(f"{API}/system/guard", json={"max_encoders": 4, "cpu_limit_pct": 95})


# ---------- /system/engine/restart ----------
class TestEngineRestart:
    def test_restart_rbac_viewer(self, viewer):
        assert viewer.post(f"{API}/system/engine/restart").status_code == 403

    def test_restart_rbac_operator(self, operator):
        assert operator.post(f"{API}/system/engine/restart").status_code == 403

    def test_restart_stops_all(self, admin):
        # start one, then restart
        ch = admin.post(f"{API}/channels",
                        json={"name": f"TEST_rst_{uuid.uuid4().hex[:6]}", "source": "test",
                              "ladder": "480p", "video_codec": "H.264", "audio_codec": "AAC", "hw": "auto"}).json()
        cid = ch["id"]
        try:
            r = admin.post(f"{API}/channels/{cid}/start", timeout=40)
            assert r.status_code == 200, r.text
            assert admin.get(f"{API}/system/stats").json()["active_encoders"] >= 1
            r = admin.post(f"{API}/system/engine/restart")
            assert r.status_code == 200
            data = r.json()
            assert data["ok"] is True
            assert data["stopped"] >= 1
            time.sleep(1)
            assert admin.get(f"{API}/system/stats").json()["active_encoders"] == 0
        finally:
            admin.delete(f"{API}/channels/{cid}")


# ---------- /engine/status ----------
class TestEngineStatus:
    def test_engine_status_fields(self, admin):
        r = admin.get(f"{API}/engine/status")
        assert r.status_code == 200
        d = r.json()
        for k in ["hardware_accels", "input_protocols", "output_protocols",
                  "listeners_enabled", "active_encoders", "ladders",
                  "video_codecs", "audio_codecs"]:
            assert k in d, f"missing {k}"
        assert "720p" in d["ladders"]


# ---------- Real transcode + QC ----------
class TestChannelQC:
    def _wait_qc(self, admin, cid, timeout=25):
        """Poll channel stats until qc reflects motion/freeze state."""
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            s = admin.get(f"{API}/channels/{cid}/stats").json()
            last = s
            if s.get("has_master"):
                # give freezedetect some time to log
                if time.time() > deadline - (timeout - 6):
                    return s
            time.sleep(1)
        return last

    def test_test_pattern_healthy(self, admin):
        r = admin.post(f"{API}/channels",
                       json={"name": f"TEST_qc_test_{uuid.uuid4().hex[:6]}", "source": "test",
                             "ladder": "480p", "video_codec": "H.264", "audio_codec": "AAC", "hw": "auto"})
        assert r.status_code == 200
        c = r.json()
        cid = c["id"]
        try:
            r = admin.post(f"{API}/channels/{cid}/start", timeout=40)
            assert r.status_code == 200, r.text
            got = r.json()
            assert got["status"] == "live"
            assert got["stats"]["has_master"] is True
            assert got["stats"]["variants"] >= 1
            assert got["stats"]["hw"] == "CPU"
            assert "qc" in got["stats"]
            # after a few seconds test pattern should be healthy
            s = self._wait_qc(admin, cid, 15)
            assert s["qc"]["black"] is False
            # healthy might briefly flip; assert freeze False on moving testsrc2
            assert s["qc"]["freeze"] is False
        finally:
            admin.delete(f"{API}/channels/{cid}")

    def test_bars_detects_freeze(self, admin):
        r = admin.post(f"{API}/channels",
                       json={"name": f"TEST_qc_bars_{uuid.uuid4().hex[:6]}", "source": "bars",
                             "ladder": "480p", "video_codec": "H.264", "audio_codec": "AAC", "hw": "auto"})
        c = r.json()
        cid = c["id"]
        try:
            r = admin.post(f"{API}/channels/{cid}/start", timeout=40)
            assert r.status_code == 200, r.text
            # allow freezedetect (d=0.5 threshold) to fire
            time.sleep(6)
            s = admin.get(f"{API}/channels/{cid}/stats").json()
            assert s["running"] is True
            assert s["qc"]["freeze"] is True, f"expected freeze on static bars, got {s['qc']}"
        finally:
            admin.delete(f"{API}/channels/{cid}")


# ---------- HLS delivery ----------
class TestHLS:
    def test_master_and_segments(self, admin):
        r = admin.post(f"{API}/channels",
                       json={"name": f"TEST_hls_{uuid.uuid4().hex[:6]}", "source": "test",
                             "ladder": "480p", "video_codec": "H.264", "audio_codec": "AAC", "hw": "auto"})
        cid = r.json()["id"]
        try:
            r = admin.post(f"{API}/channels/{cid}/start", timeout=40)
            assert r.status_code == 200
            m = requests.get(f"{API}/hls/{cid}/master.m3u8", timeout=10)
            assert m.status_code == 200
            assert "application/vnd.apple.mpegurl" in m.headers.get("content-type", "")
            body = m.text
            assert "#EXTM3U" in body
            assert "stream_" in body
            # fetch a variant playlist -> get a segment name
            variant_line = next((ln for ln in body.splitlines() if ln.endswith(".m3u8") and not ln.startswith("#")), None)
            assert variant_line, f"no variant in master: {body}"
            v = requests.get(f"{API}/hls/{cid}/{variant_line}", timeout=10)
            assert v.status_code == 200
            seg = next((ln for ln in v.text.splitlines() if ln.endswith(".ts")), None)
            assert seg
            ts = requests.get(f"{API}/hls/{cid}/{seg}", timeout=10)
            assert ts.status_code == 200
            assert ts.headers.get("content-type") == "video/mp2t"
            assert len(ts.content) > 1000
        finally:
            admin.delete(f"{API}/channels/{cid}")


# ---------- Listener gating ----------
class TestListenerGating:
    @pytest.mark.parametrize("src,port", [("srt-listen", 9000), ("rtmp-listen", 1935)])
    def test_listener_disabled(self, admin, src, port):
        r = admin.post(f"{API}/channels",
                       json={"name": f"TEST_{src}_{uuid.uuid4().hex[:6]}", "source": src,
                             "ingest_port": port, "ladder": "480p",
                             "video_codec": "H.264", "audio_codec": "AAC", "hw": "auto"})
        cid = r.json()["id"]
        try:
            r = admin.post(f"{API}/channels/{cid}/start", timeout=15)
            assert r.status_code in (400, 500), r.text
            body = r.text.lower()
            assert "listener" in body or "disabled" in body
        finally:
            admin.delete(f"{API}/channels/{cid}")


# ---------- Deploy artifacts static check ----------
DEPLOY = Path("/app/deploy")


class TestDeploy:
    def test_install_sh_bash_n(self):
        p = DEPLOY / "install.sh"
        assert p.exists()
        r = subprocess.run(["bash", "-n", str(p)], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr

    def test_docker_compose_valid(self):
        y = yaml.safe_load((DEPLOY / "docker-compose.yml").read_text())
        assert "services" in y
        for svc in ("mongo", "backend", "web"):
            assert svc in y["services"], f"missing service {svc}"
        be = y["services"]["backend"]
        ports = [str(p) for p in be.get("ports", [])]
        assert any("1935" in p for p in ports), ports
        assert any("9000-9010" in p and "udp" in p for p in ports), ports
        assert "deploy" in be and "resources" in be["deploy"]
        assert "limits" in be["deploy"]["resources"]

    def test_dockerfile_backend_has_ffmpeg(self):
        txt = (DEPLOY / "Dockerfile.backend").read_text()
        assert "ffmpeg" in txt.lower()

    def test_nginx_proxies_api(self):
        txt = (DEPLOY / "nginx.conf").read_text()
        assert "/api/" in txt
        assert "proxy_pass" in txt and "backend:8001" in txt
