"""Staff-only NLP, RAG and Ollama endpoints."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import analytics, llm, models, nlp, rag, records, security
from ..db import get_db
from ..services import core

router = APIRouter(prefix="/api/admin", dependencies=[Depends(security.require_staff)])


class TextIn(BaseModel):
    text: str = Field(min_length=1, max_length=6000)


class SearchIn(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    k: int = Field(default=5, ge=1, le=10)


class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    k: int = Field(default=4, ge=1, le=8)
    use_llm: bool = True


def _cfg(db: Session):
    return llm.resolve_cfg(core.get_config(db, "ollama"))


@router.post("/nlp/analyze")
def nlp_analyze(body: TextIn):
    if not body.text.strip():
        raise HTTPException(422, "empty text")
    pre = nlp.preprocess(body.text)
    s = rag.state()
    vec = s["tfidf"]; q = vec.transform([body.text]); inv = {i: t for t, i in vec.vocabulary_.items()}; coo = q.tocoo()
    terms = sorted([{"term": inv[c], "tfidf": round(float(v), 4), "idf": round(float(vec.idf_[c]), 3)} for c, v in zip(coo.col, coo.data)], key=lambda d: -d["tfidf"])[:12]
    sims = (s["X"] @ q.T).toarray().ravel(); ssem = rag.semantic_scores(body.text)
    top = lambda sc: [{"chunk_id": s["chunks"][i]["chunk_id"], "title": s["chunks"][i]["title"], "year": s["chunks"][i]["year"], "score": round(float(sc[i]), 3)} for i in sc.argsort()[::-1][:3]]  # noqa: E731
    return {"preprocessing": pre, "features": nlp.linguistic_features(body.text), **nlp.themes_and_polarity(body.text), "sentiment_vader": nlp.vader_sentiment(body.text),
            "keywords": nlp.extract_keywords(body.text),
            "tfidf": {"top_terms": terms, "out_of_vocabulary": sorted({t for t in pre["content_stems"] if t not in vec.vocabulary_}), "vocabulary_size": len(vec.vocabulary_),
                      "note": "TF-IDF is fitted on the scientific corpus; terms absent from it get no weight."},
            "nearest_literature": {"tfidf": top(sims), "semantic": top(ssem), "semantic_method": s["emb"].name}}


@router.get("/nlp/reflection-themes")
def reflection_themes(db: Session = Depends(get_db)):
    texts = [r["reflection"] for r in records.load_records(db) if r.get("reflection")]
    out = nlp.corpus_themes(texts)
    out["source"] = "participant reflections stored in PRISM"
    return out


@router.post("/nlp/llm-assist")
def llm_assist(body: TextIn, db: Session = Depends(get_db)):
    """Ollama paraphrase of ONE reflection's content (descriptive only)."""
    st = llm.status(_cfg(db))
    if not st["available"]:
        raise HTTPException(503, f"Ollama unavailable ({st['state']}): {st['reason']}")
    system = ("Summarise what the participant describes about the task experience in at most two sentences, using only their words. Do not infer emotions, stress, "
              "health or personality. Do not add information.")
    try:
        return {"summary": llm.chat(_cfg(db), st["model"], system, body.text), "model": st["model"], "note": "Descriptive paraphrase by a language model; not an assessment of the participant."}
    except llm.LlmError as e:
        raise HTTPException(502, f"{e.kind}: {e.message}")


@router.get("/rag/corpus")
def rag_corpus():
    s = rag.state()
    return {"info": rag.info(), "documents": [{k: v for k, v in d.items() if k != "abstract"} | {"abstract_chars": len(d["abstract"])} for d in s["docs"]]}


@router.get("/rag/documents/{doc_id}")
def rag_doc(doc_id: str):
    for d in rag.state()["docs"]:
        if d["id"] == doc_id:
            return {**d, "chunks": [c for c in rag.state()["chunks"] if c["doc_id"] == doc_id]}
    raise HTTPException(404, "unknown document")


@router.post("/rag/search")
def rag_search(body: SearchIn):
    return rag.search(body.query, body.k)


@router.get("/rag/evaluation")
def rag_eval():
    return rag.evaluate_retrieval()


@router.get("/rag/gate-evaluation")
def rag_gate_eval():
    return rag.evaluate_gate()


@router.post("/rag/ask")
def rag_ask(body: AskIn, db: Session = Depends(get_db)):
    return rag.ask(body.question, body.k, body.use_llm, _cfg(db))


# ---- Ollama settings
class OllamaIn(BaseModel):
    host: Optional[str] = Field(default=None, max_length=200)
    model: Optional[str] = Field(default=None, max_length=120)
    timeout: Optional[float] = Field(default=None, ge=5, le=600)


@router.get("/ollama")
def ollama_status(db: Session = Depends(get_db)):
    return {"settings": _cfg(db), "status": llm.status(_cfg(db)),
            "install": ["Install Ollama from https://ollama.com (macOS app or Linux script).", "Start it (app, or `ollama serve`).",
                        "Pull a small model that fits your RAM, e.g. `ollama pull qwen2.5:3b` (~1.9 GB) or `llama3.2:3b`.", "Select it below, then press 'Test generation'."]}


@router.put("/ollama")
def ollama_set(body: OllamaIn, user: models.User = Depends(security.require_admin), db: Session = Depends(get_db)):
    cur = core.get_config(db, "ollama")
    if body.host:
        try:
            cur["host"] = llm.validate_host(body.host)
        except ValueError as e:
            raise HTTPException(422, str(e))
    if body.model is not None:
        cur["model"] = body.model.strip()
    if body.timeout:
        cur["timeout"] = body.timeout
    core.set_config(db, "ollama", cur, user.email); core.audit(db, user.role, user.email, "ollama_settings", detail=cur)
    return {"settings": _cfg(db), "status": llm.status(_cfg(db))}


@router.post("/ollama/test")
def ollama_test(db: Session = Depends(get_db)):
    import time
    st = llm.status(_cfg(db))
    if not st["available"]:
        raise HTTPException(503, f"Ollama unavailable ({st['state']}): {st['reason']}")
    t0 = time.time()
    try:
        out = llm.chat(_cfg(db), st["model"], "Reply with one short sentence.", "Say that you are ready.", max_tokens=30)
    except llm.LlmError as e:
        raise HTTPException(502, f"{e.kind}: {e.message}")
    return {"model": st["model"], "reply": out, "seconds": round(time.time() - t0, 2)}


class ExplainIn(BaseModel):
    run_id: int


@router.post("/ml/explain")
def ml_explain(body: ExplainIn, db: Session = Depends(get_db)):
    """Ollama explains a STORED model run in words. It receives only the stored metrics; numbers in its output are verified against them."""
    run = db.get(models.ModelRun, body.run_id)
    if not run:
        raise HTTPException(404, "run not found")
    if run.status != "ok":
        raise HTTPException(409, f"run status is '{run.status}': there are no results to explain")
    st = llm.status(_cfg(db))
    if not st["available"]:
        raise HTTPException(503, f"Ollama unavailable ({st['state']}): {st['reason']}")
    import json
    r = run.result
    compact = {k: r.get(k) for k in ("label", "target", "n_sessions", "n_participants", "n_epochs", "n_subjects", "selected_model", "test_selected", "uncertainty", "split", "limitations") if r.get(k) is not None}
    try:
        return {**llm.explain_metrics(_cfg(db), st["model"], json.dumps(compact)), "model": st["model"], "run_id": run.id}
    except llm.LlmError as e:
        raise HTTPException(502, f"{e.kind}: {e.message}")
