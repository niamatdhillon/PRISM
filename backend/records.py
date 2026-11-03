"""ORM <-> plain-dict conversion."""
from typing import List
from sqlalchemy.orm import Session, joinedload
from . import models


def to_record(s: models.ExperimentSession, code: str) -> dict:
    return {
        "session_id": s.id, "participant": code, "started_at": s.started_at.isoformat(), "completed_at": s.completed_at.isoformat() if s.completed_at else None,
        "completed": s.completed, "protocol_version": s.protocol_version, "device": s.device, "display_mode": s.display_mode, "camera_used": s.camera_used,
        "audio_enabled": s.audio_enabled, "condition": s.condition, "ratings": s.ratings, "timing": s.timing, "reflection": s.reflection,
        "tasks_completed": sorted({t.task for t in s.trials}),
        "trials": [{"idx": t.idx, "task": t.task, "block": t.block, "modality": t.modality, "trial_type": t.trial_type, "set_size": t.set_size, "stimulus": t.stimulus,
                    "response": t.response, "correct": t.correct, "rt_ms": t.rt_ms, "onset_epoch_ms": t.onset_epoch_ms, "timeout": t.timeout, "anticipatory": t.anticipatory} for t in s.trials],
    }


def load_records(db: Session, participant_id=None) -> List[dict]:
    q = db.query(models.ExperimentSession).options(joinedload(models.ExperimentSession.trials), joinedload(models.ExperimentSession.participant)).join(models.Participant)
    q = q.filter(models.Participant.status == "active")
    if participant_id is not None:
        q = q.filter(models.ExperimentSession.participant_id == participant_id)
    return [to_record(s, s.participant.code) for s in q.order_by(models.ExperimentSession.started_at).all()]
