"""
Stream Anywhere — S3 Storage config, VOD Import (real transcode), DVR record.
Covers iteration 4 requirements.
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

SHORT_MP4 = "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_client():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def operator_client():
    email = f"TEST_op_s_{uuid.uuid4().hex[:6]}@example.com"
    pw = "OpPass!123"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": pw, "name": "Op S"}, timeout=15)
    assert r.status_code in (200, 201), r.text
    tok = r.json()["access_token"]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def viewer_client(admin_client):
    email = f"TEST_v_s_{uuid.uuid4().hex[:6]}@example.com"
    pw = "ViewPass!123"
    r = admin_client.post(f"{API}/users",
                          json={"email": email, "password": pw, "role": "viewer", "name": "V S"})
    assert r.status_code in (200, 201), r.text
    uid = r.json()["id"]
    lr = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    tok = lr.json()["access_token"]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    s.user_id = uid
    yield s
    admin_client.delete(f"{API}/users/{uid}")


# ============================================================
# S3 Storage config
# ============================================================
class TestStorage:
    def test_get_masked_default(self, admin_client):
        r = admin_client.get(f"{API}/system/storage")
        assert r.status_code == 200
        d = r.json()
        for k in ["enabled", "endpoint_url", "region", "bucket", "access_key", "secret_key",
                  "public_base", "has_credentials"]:
            assert k in d, f"missing {k}"
        # secret always bullets or empty
        assert d["secret_key"] in ("", "••••••")

    def test_put_and_mask(self, admin_client):
        body = {"enabled": False, "endpoint_url": "https://s3.example.com", "region": "us-east-1",
                "bucket": "TEST_bucket", "access_key": "AKIATESTKEY1234",
                "secret_key": "supersecret", "public_base": ""}
        r = admin_client.put(f"{API}/system/storage", json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["has_credentials"] is True
        assert d["secret_key"] == "••••••"
        assert d["access_key"].endswith("…")
        assert d["access_key"].startswith("AKIA")

    def test_put_preserves_credentials_on_masked_resubmit(self, admin_client):
        # First seed
        admin_client.put(f"{API}/system/storage", json={
            "enabled": False, "endpoint_url": "https://s3.example.com", "region": "us-east-1",
            "bucket": "TEST_bucket", "access_key": "AKIATESTKEY1234",
            "secret_key": "supersecret", "public_base": ""})
        # Resubmit with masked access_key + empty secret_key -> should preserve
        r = admin_client.put(f"{API}/system/storage", json={
            "enabled": True, "endpoint_url": "https://s3.example.com", "region": "us-east-1",
            "bucket": "TEST_bucket", "access_key": "AKIA…", "secret_key": "", "public_base": ""})
        assert r.status_code == 200
        d = r.json()
        assert d["has_credentials"] is True
        assert d["enabled"] is True

    def test_operator_put_forbidden(self, operator_client):
        r = operator_client.put(f"{API}/system/storage", json={
            "enabled": False, "endpoint_url": "", "region": "us-east-1",
            "bucket": "x", "access_key": "x", "secret_key": "x", "public_base": ""})
        assert r.status_code == 403

    def test_viewer_put_forbidden(self, viewer_client):
        r = viewer_client.put(f"{API}/system/storage", json={
            "enabled": False, "endpoint_url": "", "region": "us-east-1",
            "bucket": "x", "access_key": "x", "secret_key": "x", "public_base": ""})
        assert r.status_code == 403

    def test_test_connection_bad_creds_graceful(self, admin_client):
        r = admin_client.post(f"{API}/system/storage/test", json={
            "enabled": False, "endpoint_url": "https://s3.us-east-1.amazonaws.com",
            "region": "us-east-1", "bucket": "TEST_probably_missing_bucket_zzzzz",
            "access_key": "AKIAINVALIDKEY", "secret_key": "invalidsecret", "public_base": ""})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is False
        assert "error" in d and isinstance(d["error"], str) and len(d["error"]) > 0

    def test_disable_at_end(self, admin_client):
        # leave storage disabled at end of module
        r = admin_client.put(f"{API}/system/storage", json={
            "enabled": False, "endpoint_url": "", "region": "us-east-1",
            "bucket": "", "access_key": "", "secret_key": "", "public_base": ""})
        assert r.status_code == 200
        d = r.json()
        assert d["enabled"] is False


# ============================================================
# VOD Import (REAL transcode)
# ============================================================
class TestVodImport:
    def test_import_transcode_and_playback(self, admin_client):
        payload = {"title": f"TEST_import_{uuid.uuid4().hex[:6]}",
                   "source_url": SHORT_MP4, "ladder": "480p"}
        r = admin_client.post(f"{API}/vod/import", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        vid = d["id"]
        assert d["playable"] is True
        assert d["hls_url"] == f"/api/vod-hls/{vid}/master.m3u8"
        assert d["status"] == "transcoding"

        # Poll until ready (up to ~60s)
        deadline = time.time() + 60
        status = "transcoding"
        while time.time() < deadline:
            r = admin_client.get(f"{API}/vod")
            arr = r.json()
            match = [x for x in arr if x["id"] == vid]
            assert match, "asset disappeared"
            status = match[0]["status"]
            if status == "ready":
                break
            time.sleep(2)
        assert status == "ready", f"never became ready (last={status})"

        # Fetch master.m3u8
        r = requests.get(f"{API}/vod-hls/{vid}/master.m3u8", timeout=15)
        assert r.status_code == 200
        assert "mpegurl" in r.headers.get("content-type", "").lower()
        assert "#EXTM3U" in r.text

        # variant playlist should contain ENDLIST
        # find first .m3u8 line in master
        variant = None
        for line in r.text.splitlines():
            line = line.strip()
            if line and not line.startswith("#") and line.endswith(".m3u8"):
                variant = line
                break
        assert variant, f"no variant in master:\n{r.text}"
        rv = requests.get(f"{API}/vod-hls/{vid}/{variant}", timeout=15)
        assert rv.status_code == 200
        assert "#EXT-X-ENDLIST" in rv.text, f"variant missing ENDLIST:\n{rv.text}"

        # cleanup
        dr = admin_client.delete(f"{API}/vod/{vid}")
        assert dr.status_code == 200


# ============================================================
# DVR channel capture -> VOD
# ============================================================
class TestDvrRecord:
    def test_dvr_record_to_vod(self, admin_client):
        # create DVR channel
        r = admin_client.post(f"{API}/channels", json={
            "name": f"TEST_dvr_{uuid.uuid4().hex[:6]}", "source": "test",
            "ladder": "480p", "dvr": True})
        assert r.status_code == 200, r.text
        ch = r.json()
        cid = ch["id"]
        assert ch.get("dvr") is True

        try:
            r = admin_client.post(f"{API}/channels/{cid}/start")
            if r.status_code == 429:
                pytest.skip(f"guard tripped: {r.text}")
            assert r.status_code == 200, r.text

            # let DVR window accumulate ~12s
            time.sleep(12)

            r = admin_client.post(f"{API}/channels/{cid}/record")
            assert r.status_code == 200, r.text
            vod = r.json()
            vid = vod["id"]
            assert vod["playable"] is True
            assert vod["status"] == "ready"
            assert vod["duration_s"] > 0
            assert vod["hls_url"] == f"/api/vod-hls/{vid}/master.m3u8"

            # master
            m = requests.get(f"{API}/vod-hls/{vid}/master.m3u8", timeout=15)
            assert m.status_code == 200
            assert "#EXTM3U" in m.text
            variant = None
            for line in m.text.splitlines():
                line = line.strip()
                if line and not line.startswith("#") and line.endswith(".m3u8"):
                    variant = line
                    break
            assert variant, m.text
            v = requests.get(f"{API}/vod-hls/{vid}/{variant}", timeout=15)
            assert v.status_code == 200
            assert "#EXT-X-PLAYLIST-TYPE:VOD" in v.text
            assert "#EXT-X-ENDLIST" in v.text

            # cleanup vod
            admin_client.delete(f"{API}/vod/{vid}")
        finally:
            # stop + delete channel
            admin_client.post(f"{API}/channels/{cid}/stop")
            admin_client.delete(f"{API}/channels/{cid}")


# ============================================================
# VOD list enrichment
# ============================================================
class TestVodListEnrich:
    def test_list_returns_seeded_and_playable_gets_hls_url(self, admin_client):
        r = admin_client.get(f"{API}/vod")
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        # seeded (non-playable) items should still list fine (no _id)
        for x in arr:
            assert "_id" not in x
            assert "id" in x and "title" in x and "status" in x
            if x.get("playable"):
                assert x.get("hls_url", "").startswith("/api/vod-hls/")


# ============================================================
# Regression on engine/system endpoints
# ============================================================
class TestRegression:
    def test_engine_status(self, admin_client):
        r = admin_client.get(f"{API}/engine/status")
        assert r.status_code == 200
        d = r.json()
        for k in ["ladders", "active_encoders", "listeners_enabled"]:
            assert k in d

    def test_system_stats(self, admin_client):
        r = admin_client.get(f"{API}/system/stats")
        assert r.status_code == 200

    def test_system_capabilities(self, admin_client):
        r = admin_client.get(f"{API}/system/capabilities")
        assert r.status_code == 200

    def test_guard_zero_triggers_429_on_start(self, admin_client):
        # snapshot guard
        prev = admin_client.get(f"{API}/system/guard").json()
        try:
            r = admin_client.put(f"{API}/system/guard",
                                 json={"max_encoders": 0, "cpu_limit_pct": prev["cpu_limit_pct"]})
            assert r.status_code == 200
            # create a channel and try to start
            cr = admin_client.post(f"{API}/channels", json={
                "name": f"TEST_guardzero_{uuid.uuid4().hex[:6]}",
                "source": "test", "ladder": "480p"})
            assert cr.status_code == 200
            cid = cr.json()["id"]
            try:
                sr = admin_client.post(f"{API}/channels/{cid}/start")
                assert sr.status_code == 429, sr.text
            finally:
                admin_client.delete(f"{API}/channels/{cid}")
        finally:
            admin_client.put(f"{API}/system/guard", json=prev)

    def test_engine_restart(self, admin_client):
        r = admin_client.post(f"{API}/system/engine/restart")
        assert r.status_code == 200
