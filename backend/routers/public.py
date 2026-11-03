from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import config, consent, protocol
from ..db import get_db
from ..services import core

router = APIRouter(prefix="/api")


@router.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1")); dbok = True
    except Exception:  # noqa: BLE001
        dbok = False
    return {"status": "ok" if dbok else "degraded", "database": "ok" if dbok else "unreachable", "env": config.ENV}


@router.get("/public/study")
def study(db: Session = Depends(get_db)):
    e = core.ethics(db)
    return {
        "collection_open": core.collection_open(db),
        "ethics": {"reference": e["reference"], "body": e["body"], "approved_on": e["approved_on"]} if core.collection_open(db) else None,
        "consent": {"version": consent.CONSENT_VERSION, "paragraphs": consent.CONSENT_PARAGRAPHS},
        "protocol": {"version": protocol.PROTOCOL_VERSION, "tasks": protocol.TASKS, "display_modes": protocol.DISPLAY_MODES},
    }


@router.get("/public/literature")
def literature():
    from .. import rag
    docs = rag.load_documents()
    return {"documents": [{k: d.get(k) for k in ("id", "title", "authors", "venue", "year", "doi", "pmid", "url", "topic")} for d in docs]}
