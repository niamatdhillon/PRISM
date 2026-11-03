import csv
import io
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from .. import analytics, config, consent, models, records, security
from ..db import get_db
from ..schemas import EnrollIn, RestoreIn, SessionIn
from ..services import core

router = APIRouter(prefix="/api")


def _new_code(db: Session) -> str:
    import secrets
    while True:
        c = "P-" + secrets.token_hex(3).upper()
        if not db.query(models.Participant).filter_by(code=c).first():
            return c


@router.post("/participants/enroll")
def enroll(body: EnrollIn, response: Response, db: Session = Depends(get_db)):
    if not core.collection_open(db):
        raise HTTPException(403, "data collection is closed: no ethics approval is recorded for this study")
    if not (body.consent and body.age_confirmed_18_plus):
        raise HTTPException(422, "consent and 18+ confirmation are required")
    if body.consent_version != consent.CONSENT_VERSION:
        raise HTTPException(409, "consent text has changed; reload the page")
    token = security.new_token()
    p = models.Participant(code=_new_code(db), token_hash=security.sha(token))
    db.add(p); db.flush()
    db.add(models.Consent(participant_id=p.id, version=consent.CONSENT_VERSION, text_sha256=consent.CONSENT_SHA256, ethics_ref=core.ethics(db)["reference"]))
    db.commit()
    core.audit(db, "participant", p.code, "enrolled")
    security.set_cookie(response, security.PARTICIPANT_COOKIE, token, config.PARTICIPANT_COOKIE_DAYS * 86400)
    return {"code": p.code, "recovery_code": token,
            "note": "Store the recovery code if you want to access your data from another device. It is shown only now; we cannot recover it for you."}


@router.post("/participants/restore")
def restore(body: RestoreIn, response: Response, db: Session = Depends(get_db)):
    p = db.query(models.Participant).filter_by(token_hash=security.sha(body.recovery_code.strip())).first()
    if not p or p.status != "active":
        raise HTTPException(404, "recovery code not recognised")
    security.set_cookie(response, security.PARTICIPANT_COOKIE, body.recovery_code.strip(), config.PARTICIPANT_COOKIE_DAYS * 86400)
    return {"code": p.code}


@router.get("/me")
def me(p: models.Participant = Depends(security.current_participant), db: Session = Depends(get_db)):
    c = db.query(models.Consent).filter_by(participant_id=p.id).order_by(models.Consent.id.desc()).first()
    n = db.query(models.ExperimentSession).filter_by(participant_id=p.id).count()
    return {"code": p.code, "sessions": n, "consent": {"version": c.version, "given_at": c.given_at.isoformat(), "ethics_ref": c.ethics_ref} if c else None}


@router.post("/me/sessions")
def submit_session(body: SessionIn, p: models.Participant = Depends(security.current_participant), db: Session = Depends(get_db)):
    if not core.collection_open(db):
        raise HTTPException(403, "data collection is closed")
    existing = db.get(models.ExperimentSession, body.session_id)
    if existing is not None:
        raise HTTPException(409, "session id already exists")  # same response whoever owns it: no cross-account information
    s = models.ExperimentSession(
        id=body.session_id, participant_id=p.id, started_at=body.started_at, completed_at=body.completed_at, completed=body.completed, protocol_version=body.protocol_version,
        device=body.device, display_mode=body.display_mode, camera_used=body.camera_used, audio_enabled=body.audio_enabled, condition=body.condition.model_dump(),
        ratings=body.ratings.model_dump(), timing=body.timing.model_dump(), reflection=(body.reflection or "").strip() or None)
    s.trials = [models.Trial(**t.model_dump()) for t in body.trials]
    db.add(s); db.commit()
    return {"stored": True, "session_id": s.id, "trials": len(s.trials)}


@router.get("/me/sessions")
def my_sessions(p: models.Participant = Depends(security.current_participant), db: Session = Depends(get_db)):
    recs = records.load_records(db, p.id)
    return {"participant": p.code, "sessions": [analytics.session_metrics(r) for r in recs]}


@router.get("/me/export")
def my_export(format: str = "json", p: models.Participant = Depends(security.current_participant), db: Session = Depends(get_db)):
    recs = records.load_records(db, p.id)
    if format == "csv":
        return PlainTextResponse(analytics.to_csv(recs, "trials"), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename={p.code}-trials.csv"})
    return PlainTextResponse(json.dumps({"participant": p.code, "sessions": recs}, indent=1), media_type="application/json", headers={"Content-Disposition": f"attachment; filename={p.code}.json"})


@router.delete("/me/sessions/{session_id}")
def delete_session(session_id: str, p: models.Participant = Depends(security.current_participant), db: Session = Depends(get_db)):
    s = db.query(models.ExperimentSession).filter_by(id=session_id, participant_id=p.id).first()
    if not s:
        raise HTTPException(404, "session not found")
    db.delete(s); db.commit(); core.audit(db, "participant", p.code, "session_deleted", session_id)
    return {"deleted": session_id}


@router.delete("/me/data")
def delete_my_data(p: models.Participant = Depends(security.current_participant), db: Session = Depends(get_db)):
    n = db.query(models.ExperimentSession).filter_by(participant_id=p.id).delete(synchronize_session=False)
    db.commit(); core.audit(db, "participant", p.code, "data_deleted", detail={"sessions": n})
    return {"deleted_sessions": n}


@router.post("/me/withdraw")
def withdraw(response: Response, p: models.Participant = Depends(security.current_participant), db: Session = Depends(get_db)):
    from datetime import datetime, timezone
    n = db.query(models.ExperimentSession).filter_by(participant_id=p.id).delete(synchronize_session=False)
    p.status, p.withdrawn_at, p.token_hash = "withdrawn", datetime.now(timezone.utc), security.sha(security.new_token())  # invalidates cookie + recovery code
    for c in db.query(models.Consent).filter_by(participant_id=p.id):
        c.withdrawn_at = p.withdrawn_at
    db.commit(); core.audit(db, "participant", p.code, "withdrew", detail={"sessions_deleted": n})
    response.delete_cookie(security.PARTICIPANT_COOKIE, path="/")
    return {"withdrawn": True, "deleted_sessions": n}
