from backend import models
from backend.db import SessionLocal
from conftest import enroll, make_client, open_study, session_payload


def test_enrollment_blocked_until_ethics_approval_recorded(client, admin):
    pc = make_client()
    assert pc.post("/api/participants/enroll", json={"consent": True, "consent_version": "v1.0", "age_confirmed_18_plus": True}).status_code == 403
    assert pc.get("/api/public/study").json()["collection_open"] is False
    assert admin.put("/api/admin/study/ethics", json={"approved": True, "reference": "", "body": ""}).status_code == 422  # cannot open without reference + body
    open_study(admin)
    assert pc.get("/api/public/study").json()["collection_open"] is True


def test_consent_and_age_required(admin):
    open_study(admin); pc = make_client()
    assert pc.post("/api/participants/enroll", json={"consent": False, "consent_version": "v1.0", "age_confirmed_18_plus": True}).status_code == 422
    assert pc.post("/api/participants/enroll", json={"consent": True, "consent_version": "v1.0", "age_confirmed_18_plus": False}).status_code == 422
    assert pc.post("/api/participants/enroll", json={"consent": True, "consent_version": "v0.0", "age_confirmed_18_plus": True}).status_code == 409


def test_session_submission_and_own_history(admin):
    open_study(admin); pc = make_client(); e = enroll(pc)
    assert e["code"].startswith("P-")
    assert pc.post("/api/me/sessions", json=session_payload()).status_code == 200
    s = pc.get("/api/me/sessions").json(); assert s["participant"] == e["code"] and len(s["sessions"]) == 1
    db = SessionLocal(); c = db.query(models.Consent).one(); assert c.version == "v1.0" and c.ethics_ref == "TEST-REF-0001" and len(c.text_sha256) == 64; db.close()


def test_participant_isolation(admin):
    open_study(admin); a, b = make_client(), make_client(); enroll(a); enroll(b)
    assert a.post("/api/me/sessions", json=session_payload("aaaaaaaa1111")).status_code == 200
    assert b.post("/api/me/sessions", json=session_payload("bbbbbbbb2222")).status_code == 200
    assert [s["session_id"] for s in a.get("/api/me/sessions").json()["sessions"]] == ["aaaaaaaa1111"]
    assert [s["session_id"] for s in b.get("/api/me/sessions").json()["sessions"]] == ["bbbbbbbb2222"]
    assert b.delete("/api/me/sessions/aaaaaaaa1111").status_code == 404      # cannot delete another participant's session
    assert b.post("/api/me/sessions", json=session_payload("aaaaaaaa1111")).status_code == 409  # cannot overwrite either
    assert "aaaaaaaa1111" in a.get("/api/me/export").text and "aaaaaaaa1111" not in b.get("/api/me/export").text
    assert "bbbbbbbb2222" not in a.get("/api/me/export?format=csv").text


def test_unauthenticated_cannot_use_participant_endpoints(admin):
    open_study(admin); anon = make_client()
    for m, p in (("get", "/api/me"), ("get", "/api/me/sessions"), ("get", "/api/me/export"), ("post", "/api/me/withdraw"), ("delete", "/api/me/data")):
        assert getattr(anon, m)(p).status_code == 401, p
    assert anon.post("/api/me/sessions", json=session_payload()).status_code == 401


def test_sessions_rejected_when_collection_closed(admin):
    open_study(admin); pc = make_client(); enroll(pc)
    admin.put("/api/admin/study/ethics", json={"approved": False, "reference": "", "body": ""})
    assert pc.post("/api/me/sessions", json=session_payload()).status_code == 403


def test_delete_own_data_keeps_enrolment(admin):
    open_study(admin); pc = make_client(); enroll(pc); pc.post("/api/me/sessions", json=session_payload())
    assert pc.delete("/api/me/data").json()["deleted_sessions"] == 1
    assert pc.get("/api/me/sessions").json()["sessions"] == [] and pc.get("/api/me").status_code == 200
    db = SessionLocal(); assert db.query(models.Trial).count() == 0; db.close()  # trials removed with their sessions


def test_withdrawal_deletes_data_and_invalidates_credentials(admin):
    open_study(admin); pc = make_client(); e = enroll(pc); pc.post("/api/me/sessions", json=session_payload())
    assert pc.post("/api/me/withdraw").json() == {"withdrawn": True, "deleted_sessions": 1}
    assert pc.get("/api/me").status_code == 401
    assert make_client().post("/api/participants/restore", json={"recovery_code": e["recovery_code"]}).status_code == 404
    db = SessionLocal(); p = db.query(models.Participant).one(); assert p.status == "withdrawn"
    assert db.query(models.ExperimentSession).count() == 0 and db.query(models.Trial).count() == 0
    c = db.query(models.Consent).one(); assert c.withdrawn_at is not None; db.close()  # minimal governance record retained
    assert pc.post("/api/me/sessions", json=session_payload()).status_code == 401


def test_withdrawn_participant_excluded_from_analytics(admin):
    open_study(admin); pc = make_client(); enroll(pc); pc.post("/api/me/sessions", json=session_payload())
    assert admin.get("/api/admin/analytics").json()["n_sessions"] == 1
    pc.post("/api/me/withdraw"); assert admin.get("/api/admin/analytics").json()["n_sessions"] == 0


def test_recovery_code_restores_access_on_new_device(admin):
    open_study(admin); pc = make_client(); e = enroll(pc); pc.post("/api/me/sessions", json=session_payload())
    other = make_client(); assert other.post("/api/participants/restore", json={"recovery_code": e["recovery_code"]}).status_code == 200
    assert len(other.get("/api/me/sessions").json()["sessions"]) == 1
    assert make_client().post("/api/participants/restore", json={"recovery_code": "x" * 43}).status_code == 404


def test_only_hash_of_token_is_stored(admin):
    open_study(admin); pc = make_client(); e = enroll(pc)
    db = SessionLocal(); p = db.query(models.Participant).one(); assert e["recovery_code"] not in p.token_hash and len(p.token_hash) == 64; db.close()


def test_admin_erasure_and_export_contain_pseudonyms_only(admin):
    open_study(admin); pc = make_client(); e = enroll(pc); pc.post("/api/me/sessions", json=session_payload())
    csv = admin.get("/api/admin/export/sessions").text; assert e["code"] in csv and "recovery" not in csv.lower() and "token" not in csv.lower()
    assert admin.delete(f"/api/admin/participants/{e['code']}").json()["sessions_deleted"] == 1
    assert admin.get("/api/admin/participants").json()["participants"] == []


def test_retention_purge(admin):
    open_study(admin); pc = make_client(); enroll(pc); pc.post("/api/me/sessions", json=session_payload())
    assert admin.post("/api/admin/study/retention/purge").json()["purged_sessions"] == 0  # retention 0 = keep
    admin.put("/api/admin/study/retention", json={"days": 1})
    db = SessionLocal(); from datetime import datetime, timedelta, timezone
    s = db.query(models.ExperimentSession).one(); s.created_at = datetime.now(timezone.utc) - timedelta(days=5); db.commit(); db.close()
    assert admin.post("/api/admin/study/retention/purge").json()["purged_sessions"] == 1
