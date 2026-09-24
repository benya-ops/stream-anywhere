"""
Stream Anywhere backend regression tests.
Covers: auth (admin/register/me/logout), overview/analytics, streams CRUD + action,
sources CRUD, profiles + codecs, VOD, playlists, users (RBAC).
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://stream-pro-78.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@streamanywhere.io"
ADMIN_PASSWORD = "Broadcast2026!"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and "user" in data
    assert data["user"]["role"] == "admin"
    return data["access_token"]


@pytest.fixture(scope="session")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def operator_creds():
    email = f"TEST_op_{uuid.uuid4().hex[:8]}@example.com"
    password = "OperatorPass!123"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": password, "name": "Test Op"}, timeout=15)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert data["user"]["role"] == "operator"
    return {"email": email, "password": password, "token": data["access_token"], "id": data["user"].get("id")}


@pytest.fixture(scope="session")
def operator_client(operator_creds):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {operator_creds['token']}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def viewer_client(admin_client):
    email = f"TEST_view_{uuid.uuid4().hex[:8]}@example.com"
    password = "ViewerPass!123"
    r = admin_client.post(f"{API}/users", json={"email": email, "password": password, "role": "viewer", "name": "Test Viewer"})
    assert r.status_code in (200, 201), r.text
    lr = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert lr.status_code == 200, lr.text
    tok = lr.json()["access_token"]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    s.user_id = r.json()["id"]
    return s


# ---------- auth ----------
class TestAuth:
    def test_admin_login(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 10

    def test_me(self, admin_client):
        r = admin_client.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL
        assert r.json()["role"] == "admin"

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong!!"}, timeout=15)
        assert r.status_code in (400, 401, 403)

    def test_register_defaults_operator(self, operator_creds):
        assert operator_creds["token"]

    def test_logout(self, admin_token):
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {admin_token}"})
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200


# ---------- overview / analytics ----------
class TestOverview:
    def test_overview(self, admin_client):
        r = admin_client.get(f"{API}/overview")
        assert r.status_code == 200
        d = r.json()
        for k in ["live_count", "total_streams", "total_viewers", "ingest_mbps", "egress_mbps", "nodes"]:
            assert k in d
        assert isinstance(d["nodes"], list) and len(d["nodes"]) >= 1

    @pytest.mark.parametrize("rng", ["1h", "6h", "24h"])
    def test_analytics_ranges(self, admin_client, rng):
        r = admin_client.get(f"{API}/analytics", params={"range": rng})
        assert r.status_code == 200
        d = r.json()
        assert d["range"] == rng
        assert isinstance(d["viewers"], list) and len(d["viewers"]) > 0


# ---------- streams ----------
class TestStreams:
    def test_list_seeded(self, admin_client):
        r = admin_client.get(f"{API}/streams")
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1
        assert "metrics" in arr[0]

    def test_crud_and_actions(self, admin_client):
        payload = {"name": f"TEST_stream_{uuid.uuid4().hex[:6]}", "input": "srt://ingest",
                   "profile": "H.264 ABR", "resolution": "1080p60"}
        r = admin_client.post(f"{API}/streams", json=payload)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        assert r.json()["status"] == "standby"

        # start
        r = admin_client.post(f"{API}/streams/{sid}/action", json={"action": "start"})
        assert r.status_code == 200 and r.json()["status"] == "live"
        # failover
        r = admin_client.post(f"{API}/streams/{sid}/action", json={"action": "failover"})
        assert r.status_code == 200 and r.json()["status"] == "live"
        # stop
        r = admin_client.post(f"{API}/streams/{sid}/action", json={"action": "stop"})
        assert r.status_code == 200 and r.json()["status"] == "offline"
        # bad action
        r = admin_client.post(f"{API}/streams/{sid}/action", json={"action": "boom"})
        assert r.status_code == 400
        # get single with timeseries
        r = admin_client.get(f"{API}/streams/{sid}")
        assert r.status_code == 200 and "timeseries" in r.json()
        # delete
        r = admin_client.delete(f"{API}/streams/{sid}")
        assert r.status_code == 200
        r = admin_client.get(f"{API}/streams/{sid}")
        assert r.status_code == 404


# ---------- sources ----------
class TestSources:
    def test_crud(self, admin_client):
        r = admin_client.get(f"{API}/sources")
        assert r.status_code == 200
        r = admin_client.post(f"{API}/sources", json={"name": f"TEST_src_{uuid.uuid4().hex[:6]}", "protocol": "SRT"})
        assert r.status_code == 200
        sid = r.json()["id"]
        r = admin_client.delete(f"{API}/sources/{sid}")
        assert r.status_code == 200


# ---------- profiles + codecs ----------
class TestProfiles:
    def test_codecs(self, admin_client):
        r = admin_client.get(f"{API}/codecs")
        assert r.status_code == 200
        d = r.json()
        for k in ["video", "audio", "hardware", "containers", "delivery"]:
            assert k in d and isinstance(d[k], list) and len(d[k]) > 0

    def test_profile_crud(self, admin_client):
        r = admin_client.post(f"{API}/profiles", json={"name": f"TEST_prof_{uuid.uuid4().hex[:6]}",
                                                       "video_codec": "H.265 / HEVC",
                                                       "ladder": ["1080p@6M", "720p@3M", "480p@1.2M"]})
        assert r.status_code == 200
        pid = r.json()["id"]
        assert admin_client.delete(f"{API}/profiles/{pid}").status_code == 200


# ---------- vod + playlists ----------
class TestMedia:
    def test_vod_crud(self, admin_client):
        assert admin_client.get(f"{API}/vod").status_code == 200
        r = admin_client.post(f"{API}/vod", json={"title": f"TEST_vod_{uuid.uuid4().hex[:6]}", "duration_s": 60})
        assert r.status_code == 200
        vid = r.json()["id"]
        assert admin_client.delete(f"{API}/vod/{vid}").status_code == 200

    def test_playlists(self, admin_client):
        assert admin_client.get(f"{API}/playlists").status_code == 200


# ---------- users + RBAC ----------
class TestUsersRBAC:
    def test_admin_list_users(self, admin_client):
        r = admin_client.get(f"{API}/users")
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_operator_forbidden_on_users(self, operator_client):
        r = operator_client.get(f"{API}/users")
        assert r.status_code == 403

    def test_viewer_forbidden_on_users(self, viewer_client):
        r = viewer_client.get(f"{API}/users")
        assert r.status_code == 403

    def test_viewer_cannot_create_stream(self, viewer_client):
        r = viewer_client.post(f"{API}/streams", json={"name": "TEST_denied"})
        assert r.status_code == 403

    def test_viewer_cannot_create_source(self, viewer_client):
        r = viewer_client.post(f"{API}/sources", json={"name": "TEST_denied"})
        assert r.status_code == 403

    def test_operator_can_create_stream(self, operator_client):
        r = operator_client.post(f"{API}/streams", json={"name": f"TEST_op_stream_{uuid.uuid4().hex[:6]}"})
        assert r.status_code == 200
        sid = r.json()["id"]
        # cleanup
        operator_client.delete(f"{API}/streams/{sid}")

    def test_admin_delete_user(self, admin_client, viewer_client):
        uid = viewer_client.user_id
        r = admin_client.delete(f"{API}/users/{uid}")
        assert r.status_code == 200
