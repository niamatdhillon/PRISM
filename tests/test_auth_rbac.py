from backend import models, security
from backend.db import SessionLocal
from conftest import PW, add_user, enroll, make_client, open_study

ADMIN_GETS = ["/api/admin/overview", "/api/admin/participants", "/api/admin/analytics", "/api/admin/export/sessions", "/api/admin/export/trials", "/api/admin/study", "/api/admin/users", "/api/admin/datasets",
              "/api/admin/ml/runs", "/api/admin/audit", "/api/admin/errors", "/api/admin/system", "/api/admin/nlp/reflection-themes", "/api/admin/rag/corpus", "/api/admin/rag/evaluation", "/api/admin/ollama"]
ADMIN_POSTS = ["/api/admin/ml/behavioural/evaluate", "/api/admin/ml/public-eeg/evaluate", "/api/admin/datasets/eegmat/ingest", "/api/admin/study/retention/purge"]


def test_anonymous_cannot_reach_any_admin_endpoint(client):
    for p in ADMIN_GETS:
        assert client.get(p).status_code == 401, p
    for p in ADMIN_POSTS:
        assert client.post(p).status_code == 401, p
    assert client.post("/api/admin/nlp/analyze", json={"text": "x"}).status_code == 401
    assert client.post("/api/admin/rag/ask", json={"question": "what is x"}).status_code == 401


def test_participant_cookie_does_not_grant_admin(admin, client):
    open_study(admin)
    pc = make_client(); enroll(pc)
    for p in ADMIN_GETS:
        assert pc.get(p).status_code == 401, p
    assert pc.put("/api/admin/study/ethics", json={"approved": True, "reference": "x", "body": "y"}).status_code == 401


def test_researcher_can_analyse_but_not_administer(researcher):
    assert researcher.get("/api/admin/analytics").status_code == 200
    assert researcher.get("/api/admin/export/sessions").status_code == 200
    assert researcher.post("/api/admin/ml/behavioural/evaluate").status_code == 200
    assert researcher.get("/api/admin/users").status_code == 403
    assert researcher.post("/api/admin/users", json={"email": "x@y.z", "password": PW, "role": "admin"}).status_code == 403
    assert researcher.put("/api/admin/study/ethics", json={"approved": True, "reference": "r", "body": "b"}).status_code == 403
    assert researcher.put("/api/admin/ollama", json={"model": "m"}).status_code == 403
    assert researcher.delete("/api/admin/participants/P-000000").status_code == 403
    assert researcher.post("/api/admin/study/retention/purge").status_code == 403


def test_admin_can_administer(admin):
    r = admin.post("/api/admin/users", json={"email": "New@Example.org", "password": PW, "role": "researcher"}); assert r.status_code == 200 and r.json()["email"] == "new@example.org"
    assert admin.post("/api/admin/users", json={"email": "weak@example.org", "password": "short", "role": "researcher"}).status_code == 422
    assert admin.post("/api/admin/users", json={"email": "bad@example.org", "password": PW, "role": "superuser"}).status_code == 422


def test_login_failures_lock_account_and_are_generic(client):
    add_user("lock@example.org", "admin")
    for _ in range(5):
        r = client.post("/api/auth/login", json={"email": "lock@example.org", "password": "wrong-password-123"}); assert r.status_code == 401
    assert client.post("/api/auth/login", json={"email": "lock@example.org", "password": PW}).status_code == 401  # locked even with the right password
    assert client.post("/api/auth/login", json={"email": "nobody@example.org", "password": "whatever-123456"}).json()["detail"] == r.json()["detail"]  # no user enumeration


def test_logout_revokes_session(admin):
    assert admin.get("/api/admin/overview").status_code == 200
    assert admin.post("/api/auth/logout").status_code == 200
    admin.cookies.clear()
    assert admin.get("/api/admin/overview").status_code == 401


def test_revoked_token_rejected_even_if_cookie_replayed():
    add_user("a2@example.org", "admin"); c = make_client(); c.post("/api/auth/login", json={"email": "a2@example.org", "password": PW})
    tok = c.cookies.get(security.ADMIN_COOKIE); c.post("/api/auth/logout")
    c2 = make_client(); c2.cookies.set(security.ADMIN_COOKIE, tok)
    assert c2.get("/api/admin/overview").status_code == 401


def test_deactivated_user_loses_access(admin):
    add_user("tmp@example.org", "researcher"); c = make_client(); c.post("/api/auth/login", json={"email": "tmp@example.org", "password": PW})
    assert c.get("/api/admin/overview").status_code == 200
    uid = [u for u in admin.get("/api/admin/users").json()["users"] if u["email"] == "tmp@example.org"][0]["id"]
    assert admin.put(f"/api/admin/users/{uid}/active?active=false").status_code == 200
    assert c.get("/api/admin/overview").status_code == 401


def test_passwords_are_hashed_not_stored(admin):
    db = SessionLocal(); u = db.query(models.User).first(); assert PW not in u.password_hash and u.password_hash.startswith("$argon2id$"); db.close()
    assert security.verify_password(PW, u.password_hash) and not security.verify_password("nope", u.password_hash)


def test_cookies_are_httponly_samesite(client):
    add_user("c@example.org", "admin"); r = client.post("/api/auth/login", json={"email": "c@example.org", "password": PW})
    sc = r.headers["set-cookie"].lower(); assert "httponly" in sc and "samesite=lax" in sc


def test_mutating_requests_require_csrf_header():
    from fastapi.testclient import TestClient
    from backend.app import app
    bare = TestClient(app)
    assert bare.post("/api/auth/login", json={"email": "a@b.c", "password": "x"}).status_code == 403
    assert bare.get("/api/health").status_code == 200


def test_audit_log_records_security_events(admin):
    admin.get("/api/admin/export/sessions"); admin.put("/api/admin/study/retention", json={"days": 30})
    acts = {e["action"] for e in admin.get("/api/admin/audit").json()["events"]}
    assert {"login", "export", "retention_updated"} <= acts


def test_no_frontend_visible_secret_defaults():
    import pathlib
    src = pathlib.Path(__file__).resolve().parent.parent / "backend"
    text = "\n".join(p.read_text() for p in src.rglob("*.py"))
    assert "admin123" not in text and "password123" not in text.lower() and "changeme" not in text.lower()
