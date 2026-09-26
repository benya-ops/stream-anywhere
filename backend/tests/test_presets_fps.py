"""Backend tests for iteration 8: presets, fps, stream/channel edit, codecs."""
import os
import pytest
import requests
from pathlib import Path

# Load REACT_APP_BACKEND_URL from frontend .env
_env_file = Path("/app/frontend/.env")
if _env_file.exists():
    for line in _env_file.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            os.environ.setdefault("REACT_APP_BACKEND_URL", line.split("=", 1)[1].strip())

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL missing"
API = f"{BASE}/api"

ADMIN_EMAIL = "admin@streamanywhere.io"
ADMIN_PW = "Broadcast2026!"


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


# ---------- Presets ----------
class TestPresets:
    def test_get_presets(self, admin_client):
        r = admin_client.get(f"{API}/config/presets")
        assert r.status_code == 200
        d = r.json()
        assert "frame_rates" in d and "resolutions" in d and "regions" in d
        assert "protocols_out" in d and "ladders" in d and "defaults" in d
        assert d["defaults"].get("fps") == "50"
        assert "25" in d["frame_rates"] and "50" in d["frame_rates"]

    def test_reset_presets_has_8_frame_rates(self, admin_client):
        r = admin_client.post(f"{API}/config/presets/reset")
        assert r.status_code == 200
        d = r.json()
        assert len(d["frame_rates"]) == 8
        for fps in ["25", "50", "30", "60", "24", "23.976", "29.97", "59.94"]:
            assert fps in d["frame_rates"]

    def test_put_presets_persists(self, admin_client):
        cur = admin_client.get(f"{API}/config/presets").json()
        payload = {
            "frame_rates": ["25", "50", "100"],
            "resolutions": cur["resolutions"],
            "regions": cur["regions"],
            "protocols_out": cur["protocols_out"],
            "ladders": cur["ladders"],
            "defaults": {**cur["defaults"], "fps": "25"},
        }
        r = admin_client.put(f"{API}/config/presets", json=payload)
        assert r.status_code == 200, r.text
        # verify persisted via GET
        got = admin_client.get(f"{API}/config/presets").json()
        assert got["frame_rates"] == ["25", "50", "100"]
        assert got["defaults"]["fps"] == "25"
        # restore
        admin_client.post(f"{API}/config/presets/reset")


# ---------- Codecs (auto-detected) ----------
class TestCodecs:
    def test_codecs_has_mpeg2_and_mp2(self, admin_client):
        r = admin_client.get(f"{API}/codecs")
        assert r.status_code == 200
        d = r.json()
        assert "video" in d and "audio" in d
        # MPEG-2 video should be present since ffmpeg has mpeg2video encoder in default builds
        assert any("MPEG-2" in v for v in d["video"]), f"MPEG-2 missing: {d['video']}"
        assert any(a == "MP2" or a.startswith("MP2") for a in d["audio"]), f"MP2 missing: {d['audio']}"


# ---------- Streams: create + edit fps/resolution ----------
class TestStreamEdit:
    def test_create_edit_delete_stream(self, admin_client):
        create = admin_client.post(f"{API}/streams", json={
            "name": "TEST_fps_stream", "input": "", "profile": "",
            "resolution": "1080p", "fps": "50", "region": "EU-West",
            "base_bitrate": 6, "base_viewers": 500,
            "protocols_out": ["HLS"]
        })
        assert create.status_code == 200, create.text
        sid = create.json()["id"]

        # edit: change fps and resolution
        upd = admin_client.put(f"{API}/streams/{sid}", json={
            "name": "TEST_fps_stream", "input": "", "profile": "",
            "resolution": "720p", "fps": "25", "region": "EU-West",
            "base_bitrate": 6, "base_viewers": 500,
            "protocols_out": ["HLS"]
        })
        assert upd.status_code == 200, upd.text
        got = upd.json()
        assert got["resolution"] == "720p"
        assert got["fps"] == "25"

        # Verify persisted via GET list
        lst = admin_client.get(f"{API}/streams").json()
        found = next((x for x in lst if x["id"] == sid), None)
        assert found and found["fps"] == "25" and found["resolution"] == "720p"

        # cleanup
        d = admin_client.delete(f"{API}/streams/{sid}")
        assert d.status_code in (200, 204)


# ---------- Channels: create + edit fps/keyframe + start with fps=25 ----------
class TestChannelEdit:
    def test_create_edit_channel(self, admin_client):
        r = admin_client.post(f"{API}/channels", json={
            "name": "TEST_ch_fps", "source": "test", "ladder": "720p",
            "fps": "50", "keyframe_s": 2.0, "video_codec": "H.264",
            "audio_codec": "AAC", "hw": "auto", "dvr": False, "region": "EU-West"
        })
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        upd = admin_client.put(f"{API}/channels/{cid}", json={
            "name": "TEST_ch_fps", "source": "test", "ladder": "720p",
            "fps": "25", "keyframe_s": 3.0, "video_codec": "H.264",
            "audio_codec": "AAC", "hw": "auto", "dvr": False, "region": "EU-West"
        })
        assert upd.status_code == 200, upd.text
        got = upd.json()
        assert got["fps"] == "25"
        assert got["keyframe_s"] == 3.0

        # cleanup
        admin_client.delete(f"{API}/channels/{cid}")

    def test_start_channel_with_fps25(self, admin_client):
        # create channel fps=25 source=test
        r = admin_client.post(f"{API}/channels", json={
            "name": "TEST_ch_start25", "source": "test", "ladder": "720p",
            "fps": "25", "keyframe_s": 2.0, "video_codec": "H.264",
            "audio_codec": "AAC", "hw": "auto", "dvr": False, "region": "EU-West"
        })
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        try:
            start = admin_client.post(f"{API}/channels/{cid}/start", timeout=60)
            if start.status_code == 429:
                pytest.skip(f"Resource guard blocked start: {start.text}")
            assert start.status_code == 200, f"start failed: {start.status_code} {start.text}"
            d = start.json()
            assert d["stats"]["has_master"] is True
            # stop
            admin_client.post(f"{API}/channels/{cid}/stop")
        finally:
            admin_client.delete(f"{API}/channels/{cid}")


# ---------- Engine status returns frame_rates ----------
class TestEngineStatus:
    def test_engine_status_frame_rates(self, admin_client):
        r = admin_client.get(f"{API}/engine/status")
        assert r.status_code == 200
        d = r.json()
        assert "frame_rates" in d and len(d["frame_rates"]) >= 4
        assert "ladders" in d
        assert "video_codecs" in d and "audio_codecs" in d


# ---------- Profile edit ----------
class TestProfileEdit:
    def test_edit_profile(self, admin_client):
        r = admin_client.post(f"{API}/profiles", json={
            "name": "TEST_prof_edit", "video_codec": "H.264", "hw": "NVENC",
            "audio_codec": "AAC", "ladder": ["1080p50@6M", "720p50@3M"],
            "keyframe_s": 2.0, "gpu": True
        })
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        upd = admin_client.put(f"{API}/profiles/{pid}", json={
            "name": "TEST_prof_edit", "video_codec": "H.265/HEVC", "hw": "NVENC",
            "audio_codec": "AAC", "ladder": ["1080p25@5M"],
            "keyframe_s": 4.0, "gpu": True
        })
        assert upd.status_code == 200, upd.text
        got = upd.json()
        assert got["video_codec"] == "H.265/HEVC"
        assert got["keyframe_s"] == 4.0
        assert got["ladder"] == ["1080p25@5M"]
        admin_client.delete(f"{API}/profiles/{pid}")


# ---------- RBAC: presets is admin-only ----------
class TestRBAC:
    def test_non_admin_cannot_write_presets(self, admin_client):
        # create a scoped user
        u = admin_client.post(f"{API}/users", json={
            "email": "TEST_scoped@test.io", "password": "Test123!!",
            "name": "Scoped", "role": "user",
            "permissions": ["streams"]
        })
        assert u.status_code in (200, 201), u.text
        uid = u.json()["id"]

        s = requests.Session()
        login = s.post(f"{API}/auth/login", json={"email": "TEST_scoped@test.io", "password": "Test123!!"})
        assert login.status_code == 200

        # GET presets should be allowed (any logged-in user)
        g = s.get(f"{API}/config/presets")
        assert g.status_code == 200

        # PUT should be forbidden
        p = s.put(f"{API}/config/presets", json=g.json())
        assert p.status_code == 403

        # RESET forbidden
        r = s.post(f"{API}/config/presets/reset")
        assert r.status_code == 403

        admin_client.delete(f"{API}/users/{uid}")
