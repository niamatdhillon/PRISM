"""PRISM API (FastAPI). Runs locally (SQLite persistence, optional Ollama) or hosted (stateless, no Ollama)."""
import platform
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from . import analytics, config, db, llm, ml, nlp, rag, synthetic
from .schema import SessionRecord

app = FastAPI(title="PRISM API", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json")


class Records(BaseModel):
    records: List[dict] = Field(default_factory=list, max_length=2000)


class TextIn(BaseModel):
    text: str = Field(max_length=6000)


class SearchIn(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    k: int = Field(default=5, ge=1, le=10)


class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    k: int = Field(default=4, ge=1, le=8)
    use_llm: bool = True


class EvalIn(BaseModel):
    source: str = Field(default="synthetic", pattern="^(synthetic|participant)$")
    records: List[dict] = Field(default_factory=list, max_length=2000)


@app.get("/api/status")
def status():
    persistence = ("browser" if config.IS_HOSTED else "sqlite")
    return {
        "mode": config.MODE, "persistence": persistence,
        "persistence_note": ("Hosted mode: this server stores NOTHING. Sessions live in your browser (localStorage) and can be exported as CSV; clearing site data deletes them."
                             if config.IS_HOSTED else f"Local mode: sessions are stored in SQLite at {config.DB_PATH}."),
        "ollama": llm.status(), "retrieval": rag.info(), "python": platform.python_version(),
        "components": {"llm": "none in hosted mode" if config.IS_HOSTED else "optional local Ollama", "embeddings": rag.info()["semantic_method"],
                       "research_data_leaves_device": config.IS_HOSTED and "text you submit to the NLP/RAG lab is sent to this server (not stored)" or False},
    }


# ------------------------------------------------------------ sessions
@app.post("/api/sessions")
def save_session(rec: SessionRecord):
    if config.IS_HOSTED:
        return {"stored": False, "reason": "hosted mode keeps no server-side data; record stays in your browser", "session_id": rec.session_id}
    db.save(rec)
    return {"stored": True, "session_id": rec.session_id}


@app.post("/api/sessions/bulk")
def save_bulk(body: Records):
    recs = [SessionRecord(**r) for r in body.records]
    if config.IS_HOSTED:
        return {"stored": False, "count": len(recs)}
    for r in recs:
        db.save(r)
    return {"stored": True, "count": len(recs)}


@app.get("/api/sessions")
def get_sessions(source: Optional[str] = Query(default=None, pattern="^(participant|synthetic)$")):
    return {"records": [] if config.IS_HOSTED else db.list_sessions(source)}


@app.delete("/api/sessions")
def clear_sessions(source: str = Query(pattern="^(participant|synthetic|all)$")):
    if config.IS_HOSTED:
        return {"deleted": 0}
    return {"deleted": db.delete(None if source == "all" else source)}


@app.get("/api/synthetic")
def get_synthetic(participants: int = Query(default=60, ge=5, le=150), seed: int = 7):
    return {"label": "SYNTHETIC DEMONSTRATION DATA -- not human-subject results", "records": synthetic.generate(participants, 3, seed)}


# ------------------------------------------------------------ analytics / export
@app.post("/api/analytics")
def run_analytics(body: Records):
    try:
        return analytics.analyse(body.records)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/api/export/{kind}", response_class=PlainTextResponse)
def export_csv(kind: str, body: Records):
    if kind not in ("sessions", "trials"):
        raise HTTPException(404)
    return PlainTextResponse(analytics.to_csv(body.records, kind), media_type="text/csv")


# ------------------------------------------------------------ NLP / RAG
@app.post("/api/nlp/analyze")
def nlp_analyze(body: TextIn):
    if not body.text.strip():
        raise HTTPException(422, "empty text")
    pre = nlp.preprocess(body.text)
    s = rag.state()
    vec, X = s["tfidf"], s["X"]
    q = vec.transform([body.text])
    inv = {i: t for t, i in vec.vocabulary_.items()}
    coo = q.tocoo()
    terms = sorted([{"term": inv[c], "tfidf": round(float(v), 4), "idf": round(float(vec.idf_[c]), 3)} for c, v in zip(coo.col, coo.data)], key=lambda d: -d["tfidf"])[:12]
    oov = sorted({t for t in pre["content_stems"] if t not in vec.vocabulary_})
    sims = (X @ q.T).toarray().ravel()
    ssem = s["E"] @ s["emb"].encode([body.text])[0]
    top = lambda sc: [{"chunk_id": s["chunks"][i]["chunk_id"], "title": s["chunks"][i]["title"], "year": s["chunks"][i]["year"], "score": round(float(sc[i]), 3)} for i in sc.argsort()[::-1][:3]]  # noqa: E731
    return {"preprocessing": pre, "features": nlp.linguistic_features(body.text), **nlp.themes_and_polarity(body.text),
            "tfidf": {"top_terms": terms, "out_of_vocabulary": oov, "vocabulary_size": len(vec.vocabulary_),
                      "note": "TF-IDF is fitted on the scientific corpus (IDF reflects that literature); terms absent from it get no weight."},
            "nearest_literature": {"tfidf": top(sims), "semantic": top(ssem), "semantic_method": s["emb"].name}}


@app.get("/api/rag/corpus")
def rag_corpus():
    s = rag.state()
    return {"info": rag.info(), "documents": [{k: v for k, v in d.items() if k != "abstract"} | {"abstract_chars": len(d["abstract"])} for d in s["docs"]]}


@app.get("/api/rag/documents/{doc_id}")
def rag_doc(doc_id: str):
    for d in rag.state()["docs"]:
        if d["id"] == doc_id:
            return {**d, "chunks": [c for c in rag.state()["chunks"] if c["doc_id"] == doc_id]}
    raise HTTPException(404, "unknown document")


@app.post("/api/rag/search")
def rag_search(body: SearchIn):
    return rag.search(body.query, body.k)


@app.get("/api/rag/evaluation")
def rag_eval():
    return rag.evaluate_retrieval()


@app.post("/api/rag/ask")
def rag_ask(body: AskIn):
    return rag.ask(body.question, body.k, body.use_llm)


# ------------------------------------------------------------ ML
@app.post("/api/ml/evaluate")
def ml_evaluate(body: EvalIn):
    recs = synthetic.generate() if body.source == "synthetic" else body.records
    recs = [r for r in recs if r.get("source") == body.source] if body.source == "participant" else recs
    return ml.evaluate(recs, body.source)


class PredictIn(BaseModel):
    features: Dict[str, Optional[float]]


@app.post("/api/ml/predict")
def ml_predict(body: PredictIn):
    return ml.predict(body.features)


@app.get("/api/data-dictionary")
def data_dictionary():
    import json
    return json.loads((config.DATA_DIR / "data_dictionary.json").read_text(encoding="utf-8"))
