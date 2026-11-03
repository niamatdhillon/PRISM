"""Small shared services: audit log, stored settings, error log."""
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from .. import models


def audit(db: Session, actor_type: str, actor: Optional[str], action: str, target: Optional[str] = None, detail: Optional[dict] = None):
    db.add(models.AuditLog(actor_type=actor_type, actor=actor, action=action, target=target, detail=detail))
    db.commit()


def get_config(db: Session, key: str, default: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    row = db.get(models.StudyConfig, key)
    return dict(row.value) if row else dict(default or {})


def set_config(db: Session, key: str, value: Dict[str, Any], by: Optional[str]):
    row = db.get(models.StudyConfig, key)
    if row is None:
        db.add(models.StudyConfig(key=key, value=value, updated_by=by))
    else:
        row.value, row.updated_by = value, by
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(row, "value")
    db.commit()


ETHICS_DEFAULT = {"approved": False, "reference": "", "body": "", "approved_on": ""}


def ethics(db: Session) -> Dict[str, Any]:
    return {**ETHICS_DEFAULT, **get_config(db, "ethics")}


def collection_open(db: Session) -> bool:
    e = ethics(db)
    return bool(e["approved"] and e["reference"].strip() and e["body"].strip())
