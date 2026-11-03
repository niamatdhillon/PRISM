"""Staff-only API. Every route depends on require_staff (admin or researcher); destructive/configuration routes require admin."""
import json
import platform
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import analytics, config, datasets as dsreg, ml_behavioural as mlb, models, public_eeg, records, security
from ..db import get_db
from ..services import core

router = APIRouter(prefix="/api/admin", dependencies=[Depends(security.require_staff)])
STAFF = security.require_staff
ADMIN = security.require_admin


@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    q = db.query
    return {"participants": q(models.Participant).filter_by(status="active").count(), "withdrawn": q(models.Participant).filter_by(status="withdrawn").count(),
            "sessions": q(models.ExperimentSession).count(), "completed_sessions": q(models.ExperimentSession).filter_by(completed=True).count(),
            "trials": q(models.Trial).count(), "reflections": q(models.ExperimentSession).filter(models.ExperimentSession.reflection.isnot(None)).count(),
            "collection_open": core.collection_open(db), "ethics": core.ethics(db)}


@router.get("/participants")
def participants(db: Session = Depends(get_db)):
    rows = db.query(models.Participant, func.count(models.ExperimentSession.id)).outerjoin(models.ExperimentSession).group_by(models.Participant.id).order_by(models.Participant.created_at.desc()).all()
    return {"participants": [{"code": p.code, "status": p.status, "created_at": p.created_at.isoformat(), "withdrawn_at": p.withdrawn_at.isoformat() if p.withdrawn_at else None, "sessions": n} for p, n in rows]}


@router.delete("/participants/{code}")
def delete_participant(code: str, user: models.User = Depends(ADMIN), db: Session = Depends(get_db)):
    p = db.query(models.Participant).filter_by(code=code).first()
    if not p:
        raise HTTPException(404, "participant not found")
    n = db.query(models.ExperimentSession).filter_by(participant_id=p.id).delete(synchronize_session=False)
    db.query(models.Consent).filter_by(participant_id=p.id).delete(synchronize_session=False)
    db.delete(p); db.commit()
    core.audit(db, user.role, user.email, "participant_erased", code, {"sessions_deleted": n})
    return {"erased": code, "sessions_deleted": n}


@router.get("/analytics")
def run_analytics(db: Session = Depends(get_db)):
    return analytics.analyse(records.load_records(db))


@router.get("/export/{kind}")
def export(kind: str, format: str = "csv", user: models.User = Depends(STAFF), db: Session = Depends(get_db)):
    if kind not in ("sessions", "trials"):
        raise HTTPException(404)
    recs = records.load_records(db)
    core.audit(db, user.role, user.email, "export", kind, {"format": format, "sessions": len(recs)})
    if format == "json":
        return PlainTextResponse(json.dumps(recs, indent=1), media_type="application/json", headers={"Content-Disposition": "attachment; filename=prism-sessions.json"})
    return PlainTextResponse(analytics.to_csv(recs, kind), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=prism-{kind}.csv"})


# ---- study configuration (admin only)
class EthicsIn(BaseModel):
    approved: bool
    reference: str = Field(default="", max_length=120)
    body: str = Field(default="", max_length=200)
    approved_on: str = Field(default="", max_length=20)


@router.get("/study")
def get_study(db: Session = Depends(get_db)):
    return {"ethics": core.ethics(db), "collection_open": core.collection_open(db), "retention": core.get_config(db, "retention", {"days": 0})}


@router.put("/study/ethics")
def set_ethics(body: EthicsIn, user: models.User = Depends(ADMIN), db: Session = Depends(get_db)):
    if body.approved and not (body.reference.strip() and body.body.strip()):
        raise HTTPException(422, "an approval reference and the approving body are required to open data collection")
    core.set_config(db, "ethics", body.model_dump(), user.email)
    core.audit(db, user.role, user.email, "ethics_updated", detail=body.model_dump())
    return {"collection_open": core.collection_open(db)}


class RetentionIn(BaseModel):
    days: int = Field(ge=0, le=3650, description="0 = keep until deleted/withdrawn")


@router.put("/study/retention")
def set_retention(body: RetentionIn, user: models.User = Depends(ADMIN), db: Session = Depends(get_db)):
    core.set_config(db, "retention", {"days": body.days}, user.email); core.audit(db, user.role, user.email, "retention_updated", detail={"days": body.days})
    return {"days": body.days}


@router.post("/study/retention/purge")
def purge(user: models.User = Depends(ADMIN), db: Session = Depends(get_db)):
    days = core.get_config(db, "retention", {"days": 0})["days"]
    if not days:
        return {"purged_sessions": 0, "note": "retention is 0 (keep until deleted)"}
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    n = db.query(models.ExperimentSession).filter(models.ExperimentSession.created_at < cutoff).delete(synchronize_session=False)
    db.commit(); core.audit(db, user.role, user.email, "retention_purge", detail={"days": days, "sessions": n})
    return {"purged_sessions": n}


# ---- staff accounts (admin only)
class UserIn(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=200)
    role: str = Field(pattern="^(admin|researcher)$")


@router.get("/users")
def users(_: models.User = Depends(ADMIN), db: Session = Depends(get_db)):
    return {"users": [{"id": u.id, "email": u.email, "role": u.role, "active": u.is_active, "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None} for u in db.query(models.User).all()]}


@router.post("/users")
def create_user(body: UserIn, user: models.User = Depends(ADMIN), db: Session = Depends(get_db)):
    if db.query(models.User).filter_by(email=body.email.strip().lower()).first():
        raise HTTPException(409, "email already registered")
    try:
        h = security.hash_password(body.password)
    except ValueError as e:
        raise HTTPException(422, str(e))
    u = models.User(email=body.email.strip().lower(), password_hash=h, role=body.role)
    db.add(u); db.commit(); core.audit(db, user.role, user.email, "user_created", u.email, {"role": u.role})
    return {"id": u.id, "email": u.email, "role": u.role}


@router.put("/users/{uid}/active")
def set_active(uid: int, active: bool, user: models.User = Depends(ADMIN), db: Session = Depends(get_db)):
    u = db.get(models.User, uid)
    if not u:
        raise HTTPException(404)
    if u.id == user.id and not active:
        raise HTTPException(409, "you cannot deactivate your own account")
    u.is_active = active
    if not active:
        db.query(models.AuthSession).filter_by(user_id=u.id).update({"revoked": True})
    db.commit(); core.audit(db, user.role, user.email, "user_active_changed", u.email, {"active": active})
    return {"id": u.id, "active": u.is_active}


# ---- datasets + models
def _ds_row(db: Session) -> models.Dataset:
    row = db.query(models.Dataset).filter_by(slug="eegmat").first()
    if not row:
        row = models.Dataset(slug="eegmat", name=dsreg.EEGMAT["name"], meta=dsreg.EEGMAT); db.add(row); db.commit()
    return row


@router.get("/datasets")
def datasets(db: Session = Depends(get_db)):
    row = _ds_row(db)
    return {"ingested": [{"slug": row.slug, "name": row.name, "status": row.status, "meta": row.meta, "summary": row.summary, "ingested_at": row.ingested_at.isoformat() if row.ingested_at else None,
                          "archive_present": public_eeg.archive_path().exists()}], "reviewed_not_used": dsreg.REVIEWED_NOT_USED,
            "prism_own_data": "Collected through PRISM with consent; see Participants/Analytics. Never pooled with public datasets."}


_job = {"running": False, "error": None}


@router.post("/datasets/eegmat/ingest")
def ingest(user: models.User = Depends(ADMIN), db: Session = Depends(get_db)):
    if not public_eeg.archive_path().exists():
        raise HTTPException(404, "archive not found; see docs/DATASETS.md for the download URL and checksum")
    if _job["running"]:
        raise HTTPException(409, "ingestion already running")
    row = _ds_row(db)

    def work():
        from ..db import SessionLocal
        _job.update(running=True, error=None)
        s = SessionLocal()
        try:
            summary = public_eeg.ingest()
            r = s.query(models.Dataset).filter_by(slug="eegmat").first()
            r.status, r.summary, r.ingested_at = "ingested", summary, datetime.now(timezone.utc); s.commit()
        except Exception as e:  # noqa: BLE001
            _job["error"] = f"{type(e).__name__}: {e}"
            r = s.query(models.Dataset).filter_by(slug="eegmat").first(); r.status = "failed"; s.commit()
        finally:
            s.close(); _job["running"] = False
    threading.Thread(target=work, daemon=True).start()
    core.audit(db, user.role, user.email, "dataset_ingest_started", "eegmat")
    return {"started": True, "status": row.status}


@router.get("/datasets/ingest-status")
def ingest_status():
    return _job


def _save_run(db: Session, user, result: dict) -> models.ModelRun:
    run = models.ModelRun(kind=result["kind"], dataset_slug=result.get("dataset_slug"), status=result["status"], data_fingerprint=result.get("data_fingerprint"), result=result, created_by=user.email)
    db.add(run); db.commit()
    return run


@router.post("/ml/behavioural/evaluate")
def ml_behavioural(user: models.User = Depends(STAFF), db: Session = Depends(get_db)):
    res = mlb.evaluate(records.load_records(db))
    run = _save_run(db, user, res); core.audit(db, user.role, user.email, "ml_behavioural_run", str(run.id), {"status": res["status"]})
    return {"run_id": run.id, **res}


@router.post("/ml/public-eeg/evaluate")
def ml_eeg(user: models.User = Depends(STAFF), db: Session = Depends(get_db)):
    res = public_eeg.evaluate()
    run = _save_run(db, user, res); core.audit(db, user.role, user.email, "ml_eeg_run", str(run.id), {"status": res["status"]})
    return {"run_id": run.id, **res}


@router.get("/ml/runs")
def ml_runs(kind: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.ModelRun).order_by(models.ModelRun.id.desc())
    if kind:
        q = q.filter_by(kind=kind)
    return {"runs": [{"id": r.id, "kind": r.kind, "status": r.status, "created_at": r.created_at.isoformat(), "created_by": r.created_by, "result": r.result} for r in q.limit(20)]}


# ---- operations
@router.get("/audit")
def audit(limit: int = 100, db: Session = Depends(get_db)):
    rows = db.query(models.AuditLog).order_by(models.AuditLog.id.desc()).limit(min(limit, 500)).all()
    return {"events": [{"ts": r.ts.isoformat(), "actor_type": r.actor_type, "actor": r.actor, "action": r.action, "target": r.target, "detail": r.detail} for r in rows]}


@router.get("/errors")
def errors(db: Session = Depends(get_db)):
    rows = db.query(models.AppError).order_by(models.AppError.id.desc()).limit(100).all()
    return {"errors": [{"ts": r.ts.isoformat(), "path": r.path, "type": r.error_type, "message": r.message} for r in rows]}


@router.get("/system")
def system(db: Session = Depends(get_db)):
    from .. import llm, rag
    from sqlalchemy import text
    db.execute(text("SELECT 1"))
    return {"python": platform.python_version(), "env": config.ENV, "database": config.DATABASE_URL.split("://")[0], "retrieval": rag.info(),
            "ollama": llm.status(llm.resolve_cfg(core.get_config(db, "ollama"))), "cookie_secure": config.COOKIE_SECURE,
            "errors_logged": db.query(models.AppError).count(), "audit_events": db.query(models.AuditLog).count()}
