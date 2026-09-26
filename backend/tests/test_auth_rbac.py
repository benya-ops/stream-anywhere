"""Tests for single super-admin auth model + per-module RBAC."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://stream-pro-78.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@streamanywhere.io"
ADMIN_PASSWORD = "Broadcast2026!"

OP_EMAIL = "TEST_op1@test.io"
OP_PASSWORD = "pass1234"
ADMIN2_EMAIL = "TEST_admin2@test.io"
ADMIN2_PASSWORD = "adm12345"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    return r


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def cleanup(admin_token):
    yield
    # remove test users + test channels
    try:
        users = requests.get(f"{API}/users", headers=_hdr(admin_token), timeout=10).json()
        for u in users:
            if u["email"] in (OP_EMAIL.lower(), ADMIN2_EMAIL.lower()):
                requests.delete(f"{API}/users/{u['id']}", headers=_hdr(admin_token), timeout=10)
        chans = requests.get(f"{API}/channels", headers=_hdr(admin_token), timeout=10).json()
        for c in chans:
            if c.get("name", "").startswith("TEST_"):
                requests.delete(f"{API}/channels/{c['id']}", headers=_hdr(admin_token), timeout=10)
        requests.post(f"{API}/system/engine/restart", headers=_hdr(admin_token), timeout=10)
    except Exception as e:
        print("cleanup error", e)


# ---- 1) super admin login ----
def test_admin_login_and_me(admin_token):
    r = requests.get(f"{API}/auth/me", headers=_hdr(admin_token), timeout=10)
    assert r.status_code == 200
    me = r.json()
    assert me["role"] == "admin"
    assert me["email"] == ADMIN_EMAIL
    assert "permissions" in me


# ---- 2) self-registration removed ----
@pytest.mark.parametrize("path,payload", [
    ("/auth/register", {"email": "x@x.io", "password": "abc12345", "name": "x"}),
    ("/auth/forgot-password", {"email": "x@x.io"}),
    ("/auth/reset-password", {"token": "t", "password": "abc12345"}),
])
def test_registration_endpoints_removed(path, payload):
    r = requests.post(f"{API}{path}", json=payload, timeout=10)
    assert r.status_code == 404, f"expected 404 for {path}, got {r.status_code}"


# ---- 3) modules list ----
def test_modules(admin_token):
    r = requests.get(f"{API}/modules", headers=_hdr(admin_token), timeout=10)
    assert r.status_code == 200
    mods = r.json()["modules"]
    for m in ["engine", "streams", "sources", "transcoding", "media", "analytics", "system"]:
        assert m in mods


# ---- 4) create scoped user ----
def test_create_scoped_user(admin_token, cleanup):
    # ensure no leftover
    users = requests.get(f"{API}/users", headers=_hdr(admin_token), timeout=10).json()
    for u in users:
        if u["email"] == OP_EMAIL.lower():
            requests.delete(f"{API}/users/{u['id']}", headers=_hdr(admin_token), timeout=10)
    r = requests.post(f"{API}/users", headers=_hdr(admin_token), json={
        "email": OP_EMAIL, "password": OP_PASSWORD, "name": "Op One",
        "role": "user", "permissions": ["engine", "media"],
    }, timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["role"] == "user"
    assert set(d["permissions"]) == {"engine", "media"}
    assert d["superadmin"] is False


# ---- 5) scoped user permission enforcement ----
def test_scoped_user_permissions(admin_token):
    tok = _login(OP_EMAIL, OP_PASSWORD).json()["access_token"]
    h = _hdr(tok)
    # allowed
    assert requests.get(f"{API}/channels", headers=h, timeout=10).status_code == 200
    assert requests.get(f"{API}/vod", headers=h, timeout=10).status_code == 200
    # denied
    assert requests.get(f"{API}/streams", headers=h, timeout=10).status_code == 403
    assert requests.get(f"{API}/system/stats", headers=h, timeout=10).status_code == 403
    assert requests.get(f"{API}/users", headers=h, timeout=10).status_code == 403
    # allowed write
    r = requests.post(f"{API}/channels", headers=h, json={
        "name": "TEST_scoped_chan", "source": "test", "ladder": "720p",
    }, timeout=10)
    assert r.status_code == 200, r.text
    # denied write
    r2 = requests.post(f"{API}/streams", headers=h, json={"name": "TEST_denied"}, timeout=10)
    assert r2.status_code == 403


# ---- 6) admin user gets all modules ----
def test_admin_role_user(admin_token):
    # cleanup existing
    users = requests.get(f"{API}/users", headers=_hdr(admin_token), timeout=10).json()
    for u in users:
        if u["email"] == ADMIN2_EMAIL.lower():
            requests.delete(f"{API}/users/{u['id']}", headers=_hdr(admin_token), timeout=10)
    r = requests.post(f"{API}/users", headers=_hdr(admin_token), json={
        "email": ADMIN2_EMAIL, "password": ADMIN2_PASSWORD, "name": "Adm2",
        "role": "admin", "permissions": [],
    }, timeout=10)
    assert r.status_code == 200, r.text
    perms = set(r.json()["permissions"])
    assert {"engine", "streams", "sources", "transcoding", "media", "analytics", "system"} <= perms

    tok = _login(ADMIN2_EMAIL, ADMIN2_PASSWORD).json()["access_token"]
    h = _hdr(tok)
    assert requests.get(f"{API}/streams", headers=h, timeout=10).status_code == 200
    assert requests.get(f"{API}/system/stats", headers=h, timeout=10).status_code == 200
    assert requests.get(f"{API}/users", headers=h, timeout=10).status_code == 200


# ---- 7) edit user permissions ----
def test_edit_user_permissions(admin_token):
    users = requests.get(f"{API}/users", headers=_hdr(admin_token), timeout=10).json()
    op = next(u for u in users if u["email"] == OP_EMAIL.lower())
    r = requests.put(f"{API}/users/{op['id']}", headers=_hdr(admin_token), json={
        "permissions": ["analytics"],
    }, timeout=10)
    assert r.status_code == 200
    assert r.json()["permissions"] == ["analytics"]
    # re-login (JWT has role but perms read from DB - either way should work now)
    tok = _login(OP_EMAIL, OP_PASSWORD).json()["access_token"]
    h = _hdr(tok)
    assert requests.get(f"{API}/analytics", headers=h, timeout=10).status_code == 200
    assert requests.get(f"{API}/channels", headers=h, timeout=10).status_code == 403


# ---- 8) super admin protection ----
def test_superadmin_protection(admin_token):
    users = requests.get(f"{API}/users", headers=_hdr(admin_token), timeout=10).json()
    sa = next(u for u in users if u.get("superadmin"))
    # try delete
    r = requests.delete(f"{API}/users/{sa['id']}", headers=_hdr(admin_token), timeout=10)
    # server prevents deleting self with 400 first, or superadmin with 400 -- both fine
    assert r.status_code == 400
    # try demote to user
    r2 = requests.put(f"{API}/users/{sa['id']}", headers=_hdr(admin_token), json={"role": "user"}, timeout=10)
    assert r2.status_code == 200
    assert r2.json()["role"] == "admin"  # unchanged
