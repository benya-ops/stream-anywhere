"""Iteration 9 — production Streams/Overview/CDN/purge-demo tests."""
import os
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # fallback to frontend .env for pytest runs
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@streamanywhere.io", "password": "Broadcast2026!"}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return s


# ---------- Delivery / CDN config ----------
class TestDelivery:
    def test_get_default_empty(self, admin_session):
        r = admin_session.get(f"{API}/config/delivery")
        assert r.status_code == 200
        # ensure clean starting state
        admin_session.put(f"{API}/config/delivery", json={"cdn_base": ""})
        assert admin_session.get(f"{API}/config/delivery").json()["cdn_base"] == ""

    def test_put_trims_trailing_slash(self, admin_session):
        r = admin_session.put(f"{API}/config/delivery",
                              json={"cdn_base": "https://cdn.example.com/live/"})
        assert r.status_code == 200
        assert r.json()["cdn_base"] == "https://cdn.example.com/live"
        # persistence
        assert admin_session.get(f"{API}/config/delivery").json()["cdn_base"] == \
            "https://cdn.example.com/live"

    def test_reset_empty(self, admin_session):
        admin_session.put(f"{API}/config/delivery", json={"cdn_base": ""})
        assert admin_session.get(f"{API}/config/delivery").json()["cdn_base"] == ""


# ---------- Overview ----------
class TestOverview:
    def test_shape_real(self, admin_session):
        r = admin_session.get(f"{API}/overview")
        assert r.status_code == 200
        d = r.json()
        for k in ("live_count", "total_channels", "active_encoders",
                  "cpu_pct", "mem_pct", "disk_pct", "ffmpeg_available", "channels"):
            assert k in d, f"missing {k}"
        assert isinstance(d["channels"], list)
        assert isinstance(d["cpu_pct"], (int, float))
        # no fabricated fields
        for bad in ("edge_nodes", "regions", "viewers"):
            assert bad not in d
        body = r.text
        assert "edge-eu-west" not in body and "edge-us-east" not in body


# ---------- Channels lifecycle + preview URL ----------
class TestChannelLifecycle:
    def test_create_start_stop_delete(self, admin_session):
        payload = {
            "name": "TEST_prod_ch",
            "source": "test",  # engine test-pattern source (lavfi testsrc2)
            "ladder": "1080p50@6M / 720p50@3M / 576p25@1.2M",
            "fps": "50",
            "keyframe_s": 2,
            "video_codec": "H.264",
            "audio_codec": "AAC",
            "hw": "software",
            "region": "eu-west",
            "dvr": False,
        }
        r = admin_session.post(f"{API}/channels", json=payload)
        assert r.status_code in (200, 201), r.text
        ch = r.json()
        cid = ch["id"]
        # playback_url is origin path, never a fake CDN
        assert ch.get("playback_url", "").endswith(f"/api/hls/{cid}/master.m3u8"), ch
        assert "cdn.streamanywhere.io" not in ch.get("playback_url", "")

        try:
            # start
            r = admin_session.post(f"{API}/channels/{cid}/start")
            assert r.status_code == 200, r.text
            # wait for master to appear
            master_url = f"{API}/hls/{cid}/master.m3u8"
            got_master = False
            for _ in range(25):
                time.sleep(1)
                st = admin_session.get(f"{API}/channels/{cid}").json()
                if st.get("stats", {}).get("has_master"):
                    got_master = True
                    break
            assert got_master, f"encoder never produced master.m3u8: {st}"
            # HTTP-reachable manifest (no auth cookie needed? use session anyway)
            hr = admin_session.get(master_url)
            assert hr.status_code == 200, hr.text
            assert "#EXTM3U" in hr.text
        finally:
            admin_session.post(f"{API}/channels/{cid}/stop")
            r = admin_session.delete(f"{API}/channels/{cid}")
            assert r.status_code in (200, 204)

    def test_edit_persists(self, admin_session):
        r = admin_session.post(f"{API}/channels", json={
            "name": "TEST_edit_ch", "source": "test",
            "ladder": "720p", "fps": "50", "keyframe_s": 2,
        })
        cid = r.json()["id"]
        try:
            r = admin_session.put(f"{API}/channels/{cid}",
                                  json={"name": "TEST_edit_ch2", "fps": "25"})
            assert r.status_code == 200
            got = admin_session.get(f"{API}/channels/{cid}").json()
            assert got["name"] == "TEST_edit_ch2"
            assert got["fps"] == "25"
        finally:
            admin_session.delete(f"{API}/channels/{cid}")


# ---------- Purge demo ----------
class TestPurge:
    def test_purge_returns_counts(self, admin_session):
        r = admin_session.post(f"{API}/admin/purge-demo")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        assert "deleted" in d
        for coll in ("streams", "channels", "sources", "vod", "playlists", "profiles"):
            assert coll in d["deleted"]
        # tables now empty
        assert admin_session.get(f"{API}/channels").json() == []
        assert admin_session.get(f"{API}/streams").json() == []
