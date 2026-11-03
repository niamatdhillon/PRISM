import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="prism_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["PRISM_VAR_DIR"] = _tmp
os.environ.setdefault("PRISM_EMBEDDINGS", "lsa")  # fast, deterministic; the neural path is covered by an optional test
os.environ["PRISM_ENV"] = "development"

import pytest
from fastapi.testclient import TestClient

from backend import cli, models, security
from backend.db import SessionLocal
from backend.app import app

H = {"x-prism-client": "web"}
PW = "correct-horse-battery-staple"


@pytest.fixture(scope="session", autouse=True)
def _migrate():
    cli.migrate()


@pytest.fixture(autouse=True)
def _clean():
    db = SessionLocal()
    for t in (models.Trial, models.ExperimentSession, models.Consent, models.Participant, models.AuthSession, models.User, models.StudyConfig, models.ModelRun, models.AuditLog, models.AppError):
        db.query(t).delete()
    db.commit(); db.close()
    yield


def make_client() -> TestClient:
    return TestClient(app, headers=H)


@pytest.fixture
def client():
    return make_client()


def add_user(email: str, role: str, pw: str = PW):
    db = SessionLocal(); db.add(models.User(email=email, password_hash=security.hash_password(pw), role=role)); db.commit(); db.close()


@pytest.fixture
def admin(client):
    add_user("admin@example.org", "admin"); r = client.post("/api/auth/login", json={"email": "admin@example.org", "password": PW}); assert r.status_code == 200
    return client


@pytest.fixture
def researcher():
    add_user("res@example.org", "researcher"); c = make_client(); assert c.post("/api/auth/login", json={"email": "res@example.org", "password": PW}).status_code == 200
    return c


def open_study(admin_client):
    r = admin_client.put("/api/admin/study/ethics", json={"approved": True, "reference": "TEST-REF-0001", "body": "Test Ethics Committee", "approved_on": "2026-01-01"})
    assert r.status_code == 200 and r.json()["collection_open"] is True


def enroll(client):
    r = client.post("/api/participants/enroll", json={"consent": True, "consent_version": "v1.0", "age_confirmed_18_plus": True}); assert r.status_code == 200, r.text
    return r.json()


def session_payload(sid="sess0001abcd", tasks=("visual_search", "arithmetic"), **over):
    """Minimal structurally valid payload used to test API validation/isolation (not research data)."""
    trials = []
    i = 0
    if "visual_search" in tasks:
        for k in range(2):
            trials.append({"idx": i, "task": "visual_search", "block": 0, "modality": "visual", "set_size": 18, "stimulus": "left", "response": "left", "correct": True, "rt_ms": 400.0 + k, "onset_epoch_ms": 1.0, "timeout": False, "anticipatory": False}); i += 1
    if "arithmetic" in tasks:
        trials.append({"idx": i, "task": "arithmetic", "block": 0, "modality": "none", "stimulus": "1 + 1 = 2", "response": "true", "correct": True, "rt_ms": 1500.0, "timeout": False, "anticipatory": False}); i += 1
    p = {"session_id": sid, "protocol_version": "2.0.0", "started_at": "2026-01-01T10:00:00Z", "completed_at": "2026-01-01T10:05:00Z", "completed": True, "device": "desktop", "display_mode": "scene3d",
         "camera_used": False, "audio_enabled": False, "condition": {"complexity": 1, "movement": False, "distraction": False, "brightness": 1.0, "block_modalities": ["visual", "visual"]},
         "tasks_completed": list(tasks), "ratings": {"pre_stress": 20, "post_stress": 30, "tlx_mental": 50, "tlx_physical": 10, "tlx_temporal": 40, "tlx_performance": 30, "tlx_effort": 60, "tlx_frustration": 20, "perceived_difficulty": 40},
         "timing": {"median_frame_ms": 16.7, "viewport": "1280x800"}, "reflection": "It was fine.", "trials": trials}
    p.update(over); return p
