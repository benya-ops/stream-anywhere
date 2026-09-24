"""
Stream Anywhere — Real FFmpeg engine + HLS delivery tests.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://stream-pro-78.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@streamanywhere.io"
ADMIN_PASSWORD = "Broadcast2026!"


@pytest.fixture(scope="module")
def admin_client():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


class TestEngine:
    def test_engine_status(self, admin_client):
        r = admin_client.get(f"{API}/engine/status")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ffmpeg"] is True
        assert "720p" in d["ladders"] and "1080p" in d["ladders"]
        assert "H.264" in d["video_codecs"] and "AAC" in d["audio_codecs"]

    def test_list_channels_has_seeded(self, admin_client):
        r = admin_client.get(f"{API}/channels")
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1
        assert "playback_url" in arr[0] and "stats" in arr[0]


class TestChannelLifecycle:
    channel_id = None

    def test_create_channel(self, admin_client):
        r = admin_client.post(f"{API}/channels", json={
            "name": f"TEST_chan_{uuid.uuid4().hex[:6]}",
            "source": "test", "ladder": "480p",  # smaller ladder = fast start / less CPU
            "video_codec": "H.264", "audio_codec": "AAC",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["playback_url"].startswith("/api/hls/")
        TestChannelLifecycle.channel_id = data["id"]

    def test_start_channel(self, admin_client):
        cid = TestChannelLifecycle.channel_id
        assert cid
        r = admin_client.post(f"{API}/channels/{cid}/start", timeout=40)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "live"
        assert d["stats"]["running"] is True
        assert d["stats"]["has_master"] is True
        assert d["stats"]["variants"] >= 1

    def test_stats_progresses(self, admin_client):
        cid = TestChannelLifecycle.channel_id
        # allow a couple of segments to accrue
        time.sleep(6)
        r = admin_client.get(f"{API}/channels/{cid}/stats")
        assert r.status_code == 200
        s = r.json()
        assert s["running"] is True
        assert s["segments"] >= 1
        assert s["variants"] >= 1

    def test_hls_master_playlist(self):
        cid = TestChannelLifecycle.channel_id
        r = requests.get(f"{API}/hls/{cid}/master.m3u8", timeout=10)
        assert r.status_code == 200, r.text
        assert "mpegurl" in r.headers.get("content-type", "")
        assert "stream_" in r.text and ".m3u8" in r.text

    def test_hls_variant_and_segment(self):
        cid = TestChannelLifecycle.channel_id
        # find a variant playlist
        r = requests.get(f"{API}/hls/{cid}/stream_0.m3u8", timeout=10)
        assert r.status_code == 200
        assert "mpegurl" in r.headers.get("content-type", "")
        # find any seg from playlist body
        seg_name = None
        for line in r.text.splitlines():
            line = line.strip()
            if line.endswith(".ts"):
                seg_name = line
                break
        assert seg_name, f"no segment listed in variant playlist: {r.text}"
        rs = requests.get(f"{API}/hls/{cid}/{seg_name}", timeout=15)
        assert rs.status_code == 200
        assert rs.headers.get("content-type") == "video/mp2t"
        assert len(rs.content) > 1000

    def test_stop_channel(self, admin_client):
        cid = TestChannelLifecycle.channel_id
        r = admin_client.post(f"{API}/channels/{cid}/stop")
        assert r.status_code == 200
        # give it a beat to reap
        time.sleep(1.5)
        r = admin_client.get(f"{API}/channels/{cid}/stats")
        assert r.status_code == 200
        assert r.json()["running"] is False

    def test_delete_channel(self, admin_client):
        cid = TestChannelLifecycle.channel_id
        r = admin_client.delete(f"{API}/channels/{cid}")
        assert r.status_code == 200
        r = admin_client.get(f"{API}/channels/{cid}")
        assert r.status_code == 404


class TestProbe:
    def test_probe_public_hls(self, admin_client):
        r = admin_client.post(f"{API}/engine/probe",
                              json={"source": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"},
                              timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # Either ok=true with info or error field (network unavailable)
        if d.get("ok"):
            info = d.get("info", "")
            assert "codec_type" in info or "codec_name" in info
        else:
            pytest.skip(f"probe returned non-ok: {d}")
