import json
import pathlib

from backend import analytics, models
from backend.db import SessionLocal
from conftest import enroll, make_client, open_study, session_payload


def rec(trials, **cond):
    c = {"complexity": 1, "movement": False, "distraction": False, "brightness": 1.0, **cond}
    t = [{"block": 0, "modality": "visual", "trial_type": None, "set_size": None, "stimulus": None, "onset_epoch_ms": None, "timeout": False, "anticipatory": False, "response": "x", **x} for x in trials]
    return {"session_id": "s1", "participant": "P-1", "started_at": "2026-01-01T00:00:00", "completed_at": "x", "completed": True, "protocol_version": "2", "device": "desktop", "display_mode": "scene3d",
            "camera_used": False, "audio_enabled": False, "condition": c, "ratings": {"pre_stress": 10, "post_stress": 30, "tlx_mental": 60, "tlx_physical": 0, "tlx_temporal": 30, "tlx_performance": 30, "tlx_effort": 60, "tlx_frustration": 0},
            "timing": {}, "reflection": None, "tasks_completed": sorted({x["task"] for x in t}), "trials": t}


def test_hand_computed_metrics():
    """Tiny hand-calculated fixtures to verify formulas (unit-test inputs only; never stored or shown in the app)."""
    flank = [{"idx": 0, "task": "flanker", "trial_type": "congruent", "correct": True, "rt_ms": 400}, {"idx": 1, "task": "flanker", "trial_type": "congruent", "correct": True, "rt_ms": 440},
             {"idx": 2, "task": "flanker", "trial_type": "incongruent", "correct": True, "rt_ms": 500}, {"idx": 3, "task": "flanker", "trial_type": "incongruent", "correct": False, "rt_ms": 520}]
    sw = [{"idx": 4, "task": "task_switching", "trial_type": "repeat", "correct": True, "rt_ms": 600}, {"idx": 5, "task": "task_switching", "trial_type": "switch", "correct": True, "rt_ms": 750}]
    m = analytics.session_metrics(rec(flank + sw))
    assert m["fl_congruency_rt"] == 500 - 420 and m["fl_congruency_acc"] == 0.5 and m["ts_switch_cost_rt"] == 150
    assert m["tlx_global"] == 30.0 and m["stress_delta"] == 20


def test_dprime_known_values():
    assert analytics.dprime(10, 10, 0, 30) > 2.5 and abs(analytics.dprime(5, 10, 15, 30)) < 0.2  # chance-level performance -> ~0
    assert analytics.dprime(0, 0, 0, 5) is None


def test_oddball_metrics_from_trials():
    t = [{"idx": i, "task": "auditory_oddball", "trial_type": "deviant", "response": "press", "correct": True, "rt_ms": 350} for i in range(4)] + \
        [{"idx": 4 + i, "task": "auditory_oddball", "trial_type": "standard", "response": None, "correct": True, "rt_ms": None} for i in range(8)]
    m = analytics.session_metrics(rec(t)); assert m["od_hit_rate"] == 1.0 and m["od_fa_rate"] == 0.0 and m["od_dprime"] > 2


def test_csv_exports_have_all_rows_and_no_secrets(admin):
    open_study(admin); pc = make_client(); enroll(pc); pc.post("/api/me/sessions", json=session_payload())
    trials = admin.get("/api/admin/export/trials").text.splitlines(); assert len(trials) == 1 + 3 and trials[0].startswith("session_id,participant")
    j = json.loads(admin.get("/api/admin/export/sessions?format=json").text); assert len(j) == 1 and j[0]["trials"]


def test_migration_creates_every_model_table_and_downgrades(tmp_path):
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, inspect
    root = pathlib.Path(__file__).resolve().parent.parent
    url = f"sqlite:///{tmp_path}/m.db"; cfg = Config(str(root / "alembic.ini")); cfg.set_main_option("script_location", str(root / "alembic")); cfg.cmd_opts = type("o", (), {"x": [f"url={url}"]})()
    command.upgrade(cfg, "head")
    names = set(inspect(create_engine(url)).get_table_names())
    assert {t.__tablename__ for t in models.Base.__subclasses__()} <= names
    command.downgrade(cfg, "base"); assert not ({"users", "trials"} & set(inspect(create_engine(url)).get_table_names()))


def test_foreign_key_cascade_removes_trials():
    db = SessionLocal(); p = models.Participant(code="P-TEST01", token_hash="x" * 64); db.add(p); db.flush()
    s = models.ExperimentSession(id="casc0001", participant_id=p.id, started_at=models.now(), protocol_version="2", device="desktop", display_mode="scene3d", condition={}, ratings={}, timing={})
    s.trials = [models.Trial(idx=0, task="arithmetic")]; db.add(s); db.commit()
    db.delete(p); db.commit(); assert db.query(models.Trial).count() == 0 and db.query(models.ExperimentSession).count() == 0; db.close()


def test_health_and_errors_logged(admin):
    assert admin.get("/api/health").json()["status"] == "ok"
    s = admin.get("/api/admin/system").json(); assert s["database"] == "sqlite" and "retrieval" in s and "ollama" in s


def test_security_headers(client):
    h = client.get("/api/health").headers; assert h["x-content-type-options"] == "nosniff" and "camera=(self)" in h["permissions-policy"] and h["cache-control"] == "no-store"
