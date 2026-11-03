import copy

import pytest

from conftest import enroll, make_client, open_study, session_payload


@pytest.fixture
def pc(admin):
    open_study(admin); c = make_client(); enroll(c); return c


def bad(pc, mutate, code=422):
    p = session_payload(); mutate(p); r = pc.post("/api/me/sessions", json=p); assert r.status_code == code, r.text


def test_rejects_unknown_task(pc): bad(pc, lambda p: p["trials"][0].update(task="mind_reading"))
def test_rejects_trial_for_unselected_task(pc): bad(pc, lambda p: p.update(tasks_completed=["arithmetic"]))
def test_rejects_negative_rt(pc): bad(pc, lambda p: p["trials"][0].update(rt_ms=-5))
def test_rejects_absurd_rt(pc): bad(pc, lambda p: p["trials"][0].update(rt_ms=999999))
def test_rejects_timeout_with_rt(pc): bad(pc, lambda p: p["trials"][0].update(timeout=True))
def test_rejects_missing_response_without_timeout(pc): bad(pc, lambda p: p["trials"][0].update(response=None, correct=None, rt_ms=None))
def test_rejects_duplicate_trial_idx(pc): bad(pc, lambda p: p["trials"][1].update(idx=0))
def test_rejects_rating_out_of_range(pc): bad(pc, lambda p: p["ratings"].update(tlx_mental=101))
def test_rejects_bad_display_mode(pc): bad(pc, lambda p: p.update(display_mode="hologram"))
def test_rejects_camera_overlay_without_camera(pc): bad(pc, lambda p: p.update(display_mode="camera_overlay", camera_used=False))
def test_rejects_completed_before_started(pc): bad(pc, lambda p: p.update(completed_at="2025-01-01T00:00:00Z"))
def test_rejects_bad_session_id(pc): bad(pc, lambda p: p.update(session_id="../../etc/passwd"))
def test_rejects_too_many_trials(pc): bad(pc, lambda p: p.update(trials=[dict(copy.deepcopy(p["trials"][0]), idx=i) for i in range(30)]))
def test_rejects_oversized_reflection(pc): bad(pc, lambda p: p.update(reflection="x" * 5000))


def test_oddball_trial_types_enforced(pc):
    p = session_payload(tasks=("auditory_oddball",), trials=[{"idx": 0, "task": "auditory_oddball", "modality": "auditory", "trial_type": "weird", "stimulus": "standard", "response": None, "correct": True, "timeout": False}])
    assert pc.post("/api/me/sessions", json=p).status_code == 422
    p["trials"][0]["trial_type"] = "standard"; assert pc.post("/api/me/sessions", json=p).status_code == 200  # no response is valid on a standard tone


def test_valid_payload_roundtrips(pc):
    assert pc.post("/api/me/sessions", json=session_payload()).json() == {"stored": True, "session_id": "sess0001abcd", "trials": 3}
