"""Public demonstration endpoints. Nothing is stored or logged; inputs are size-limited and rate-limited. They expose only public literature,
public-dataset results and stateless text analysis - never participant data."""
import hashlib
import threading
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import config, llm, models, public_eeg, rag
from ..db import get_db
from ..services import core, lab

router = APIRouter(prefix="/api")
_hits = defaultdict(deque); _lock = threading.Lock()


def _client_key(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "unknown")
    return hashlib.sha256(fwd.encode()).hexdigest()[:16]  # in-memory only, never persisted or logged


def _allow(key: str, bucket: str, limit: int) -> bool:
    now = time.time()
    with _lock:
        q = _hits[(bucket, key)]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now); return True


def limited(bucket: str, limit_attr: str):
    def dep(request: Request):
        if not _allow(_client_key(request), bucket, getattr(config, limit_attr)):
            raise HTTPException(429, "You are going a little fast. Please wait a moment and try again.")
    return dep


class DemoText(BaseModel):
    text: str = Field(min_length=1, max_length=1500)


class DemoSearch(BaseModel):
    query: str = Field(min_length=2, max_length=300)
    k: int = Field(default=5, ge=1, le=8)


class DemoAsk(BaseModel):
    question: str = Field(min_length=3, max_length=300)
    use_llm: bool = True


@router.get("/public/capabilities")
def capabilities(db: Session = Depends(get_db)):
    st = llm.status(llm.resolve_cfg(core.get_config(db, "ollama")))
    info = rag.info()
    return {"generation": {"available": st["available"], "model": st["model"] if st["available"] else None, "state": st["state"]},
            "retrieval": {"semantic_method": info["semantic_method"], "neural": info["semantic_neural"], "documents": info["documents"], "passages": info["chunks"]}}


@router.post("/demo/nlp/analyze", dependencies=[Depends(limited("nlp", "DEMO_RATE_PER_MIN"))])
def demo_nlp(body: DemoText):
    if not body.text.strip():
        raise HTTPException(422, "Please enter some text.")
    return lab.analyze_text(body.text)


@router.post("/demo/rag/search", dependencies=[Depends(limited("rag", "DEMO_RATE_PER_MIN"))])
def demo_search(body: DemoSearch):
    return rag.search(body.query, body.k)


@router.post("/demo/rag/ask", dependencies=[Depends(limited("rag", "DEMO_RATE_PER_MIN"))])
def demo_ask(body: DemoAsk, request: Request, db: Session = Depends(get_db)):
    use_llm = body.use_llm and config.DEMO_LLM and _allow(_client_key(request), "llm", config.DEMO_LLM_RATE_PER_MIN)
    out = rag.ask(body.question, 4, use_llm, llm.resolve_cfg(core.get_config(db, "ollama")))
    if body.use_llm and not use_llm and out.get("generator"):
        out["generator"]["reason"] = (out["generator"].get("reason") or "") or "Generation is limited in the public demo right now"
    return out


@router.get("/public/rag-evaluation")
def public_rag_eval():
    return {"retrieval": rag.evaluate_retrieval(), "gate": rag.evaluate_gate()}


_eeg_lock = threading.Lock()


@router.get("/public/eeg-model")
def public_eeg_model(db: Session = Depends(get_db)):
    """Evaluation of the real PhysioNet EEG model. Served from the stored run if one matches the packaged features, else computed once and stored."""
    from .. import datasets as dsreg
    meta = {k: dsreg.EEGMAT[k] for k in ("name", "source_url", "doi", "publisher", "licence", "primary_paper", "platform_citation", "participants", "recording", "observations",
                                          "available_features", "missing_values", "target", "suitability", "limitations")}
    summary = public_eeg.packaged_summary()
    with _eeg_lock:
        run = db.query(models.ModelRun).filter_by(kind="public_eeg", status="ok").order_by(models.ModelRun.id.desc()).first()
        feats = public_eeg.features_path()
        if run is None:
            res = public_eeg.evaluate()
            if res["status"] == "ok":
                run = models.ModelRun(kind="public_eeg", dataset_slug="eegmat", status="ok", data_fingerprint=res.get("data_fingerprint"), result=res, created_by="public-demo"); db.add(run); db.commit()
            else:
                return {"dataset": meta, "summary": summary, "result": res}
    return {"dataset": meta, "summary": summary, "result": run.result, "features_source": "local ingestion" if str(feats).startswith(str(config.VAR_DIR)) else "precomputed features packaged with the app"}
