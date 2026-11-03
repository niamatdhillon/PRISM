"""Corpus ingestion, chunking, dual indexing (TF-IDF + semantic), retrieval comparison,
grounded answering (Ollama or extractive fallback), citation verification and retrieval evaluation."""
import json
import re
import threading
from typing import Dict, List, Optional

import hashlib
import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from . import config, llm
from .nlp import content_stems, split_sentences, STOPWORDS

CHUNK_SENTENCES, CHUNK_STRIDE = 3, 2
INSUFFICIENT_COVERAGE = 0.35   # min fraction of query content stems found in ONE retrieved passage
INSUFFICIENT_DENSE = {True: 0.33, False: 0.25}  # min best semantic cosine (neural embeddings / LSA)
NEURAL_RESCUE = 0.50           # neural-embedding cosine that can accept a paraphrased question with weak lexical overlap
SUPPORT_THRESHOLD = 0.5        # min fraction of an answer sentence's content stems found in cited passages
QUESTION_WORDS = set("what how why does do can could would should which who whether affect effect relate relationship".split())

_lock = threading.Lock()
_state: Dict = {}


# ---------------------------------------------------------------- ingestion
def load_documents() -> List[Dict]:
    return json.loads((config.DATA_DIR / "corpus_raw.json").read_text(encoding="utf-8"))


def chunk_document(doc: Dict) -> List[Dict]:
    sents = split_sentences(doc["abstract"])
    chunks, i, n = [], 0, 0
    while i < len(sents):
        window = sents[i: i + CHUNK_SENTENCES]
        if n > 0 and len(window) < 2 and chunks:  # avoid a dangling single-sentence tail
            break
        text = " ".join(window)
        start = doc["abstract"].find(window[0])
        chunks.append({
            "chunk_id": f"{doc['id']}#{n}", "doc_id": doc["id"], "index": n, "text": text,
            "char_start": start, "char_end": start + len(text),
            "title": doc["title"], "authors": doc["authors"], "venue": doc["venue"], "year": doc["year"],
            "doi": doc.get("doi"), "url": doc["url"], "topic": doc["topic"],
            "doi_url": f"https://doi.org/{doc['doi']}" if doc.get("doi") else None,
        })
        n += 1
        if i + CHUNK_SENTENCES >= len(sents):
            break
        i += CHUNK_STRIDE
    return chunks


# ---------------------------------------------------------------- embedders
class LSAEmbedder:
    name = "lsa-fallback"
    description = ("Latent Semantic Analysis: TF-IDF followed by truncated SVD. Captures word co-occurrence structure, "
                   "NOT a neural sentence embedding. Used when sentence-transformers is unavailable or in hosted mode.")
    neural = False

    def __init__(self, texts: List[str]):
        self.vec = TfidfVectorizer(analyzer=content_stems, sublinear_tf=True)
        X = self.vec.fit_transform(texts)
        k = max(2, min(40, X.shape[0] - 1, X.shape[1] - 1))
        self.svd = TruncatedSVD(n_components=k, random_state=0)
        self.svd.fit(X)

    def encode(self, texts: List[str]) -> np.ndarray:
        return normalize(self.svd.transform(self.vec.transform(texts)))


class STEmbedder:
    neural = True

    def __init__(self, model_name: str):
        from sentence_transformers import SentenceTransformer  # heavy import, local mode only
        self.model = SentenceTransformer(model_name)
        self.name = model_name
        self.description = "Neural sentence embeddings (Sentence-BERT family); cosine similarity on L2-normalised vectors."

    def encode(self, texts: List[str]) -> np.ndarray:
        return np.asarray(self.model.encode(texts, normalize_embeddings=True, show_progress_bar=False))


def _build() -> Dict:
    docs = load_documents()
    chunks = [c for d in docs for c in chunk_document(d)]
    texts = [c["title"] + ". " + c["text"] for c in chunks]
    tfidf = TfidfVectorizer(analyzer=content_stems, sublinear_tf=True)
    X = tfidf.fit_transform(texts)
    emb, note = None, ""
    if config.EMBED_BACKEND != "lsa":
        try:
            emb = STEmbedder(config.EMBED_MODEL)
        except Exception as e:  # noqa: BLE001
            note = f"sentence-transformers unavailable ({type(e).__name__}: {str(e)[:120]}); using LSA fallback."
    else:
        note = "Lightweight mode: LSA used instead of neural embeddings."
    if emb is None:
        emb = LSAEmbedder(texts)
    E = np.ascontiguousarray(emb.encode(texts), dtype="float32")
    index, store = _vector_index(E, emb.name, texts)
    return {"docs": docs, "chunks": chunks, "texts": texts, "tfidf": tfidf, "X": X, "emb": emb, "E": E, "index": index, "vector_store": store, "note": note}


def _vector_index(E: np.ndarray, emb_name: str, texts: List[str]):
    """Exact inner-product FAISS index over L2-normalised vectors (== cosine). Persisted to var/rag_index and rebuilt when the corpus/embedder changes."""
    try:
        import faiss
    except Exception:  # noqa: BLE001
        return None, "numpy (faiss not installed)"
    key = hashlib.sha256((emb_name + "".join(texts)).encode()).hexdigest()[:16]
    d = config.VAR_DIR / "rag_index"; d.mkdir(parents=True, exist_ok=True)
    f, k = d / "faiss.index", d / "key.txt"
    if f.exists() and k.exists() and k.read_text() == key:
        try:
            idx = faiss.read_index(str(f))
            if idx.ntotal == len(texts):
                return idx, f"faiss IndexFlatIP (loaded from disk, key {key})"
        except Exception:  # noqa: BLE001
            pass
    idx = faiss.IndexFlatIP(E.shape[1]); idx.add(E)
    faiss.write_index(idx, str(f)); k.write_text(key)
    return idx, f"faiss IndexFlatIP (built, key {key})"


def state() -> Dict:
    with _lock:
        if not _state:
            _state.update(_build())
    return _state


def info() -> Dict:
    s = state()
    return {"documents": len(s["docs"]), "chunks": len(s["chunks"]), "chunking": f"{CHUNK_SENTENCES}-sentence windows, stride {CHUNK_STRIDE}",
            "lexical_method": "TF-IDF (sublinear tf, light-stem analyser) + cosine",
            "semantic_method": s["emb"].name, "semantic_neural": s["emb"].neural, "vector_store": s["vector_store"],
            "semantic_description": s["emb"].description, "note": s["note"]}


# ---------------------------------------------------------------- retrieval
def _hits(scores: np.ndarray, k: int) -> List[Dict]:
    s = state()
    order = np.argsort(-scores)[:k]
    return [{"rank": r + 1, "score": round(float(scores[i]), 4), **s["chunks"][i]} for r, i in enumerate(order)]


def lexical_scores(query: str) -> np.ndarray:
    s = state()
    q = s["tfidf"].transform([query])
    return (s["X"] @ q.T).toarray().ravel()


def semantic_scores(query: str) -> np.ndarray:
    """Cosine similarity of the query to every passage, retrieved through the FAISS index when available."""
    s = state()
    q = np.ascontiguousarray(s["emb"].encode([query]), dtype="float32")
    if s["index"] is None:
        return s["E"] @ q[0]
    sims, ids = s["index"].search(q, s["index"].ntotal)
    out = np.zeros(s["index"].ntotal, dtype="float32"); out[ids[0]] = sims[0]
    return out


def search(query: str, k: int = 5) -> Dict:
    lex, sem = _hits(lexical_scores(query), k), _hits(semantic_scores(query), k)
    li, si = [h["chunk_id"] for h in lex], [h["chunk_id"] for h in sem]
    inter = [c for c in li if c in si]
    union = set(li) | set(si)
    ld, sd = {h["doc_id"] for h in lex}, {h["doc_id"] for h in sem}
    return {
        "query": query, "k": k, "query_stems": content_stems(query),
        "lexical": lex, "semantic": sem, "semantic_method": state()["emb"].name,
        "comparison": {
            "shared_chunks": inter, "jaccard_chunks": round(len(inter) / len(union), 3) if union else 0,
            "only_lexical_docs": sorted(ld - sd), "only_semantic_docs": sorted(sd - ld),
            "rank_shift": {c: {"lexical": li.index(c) + 1, "semantic": si.index(c) + 1} for c in inter},
        }}


# ---------------------------------------------------------------- evaluation (doc-level, developer-judged qrels)
def _ranked_docs(hits: List[Dict]) -> List[str]:
    seen, out = set(), []
    for h in hits:
        if h["doc_id"] not in seen:
            seen.add(h["doc_id"]); out.append(h["doc_id"])
    return out


def evaluate_retrieval(ks=(1, 3, 5)) -> Dict:
    qrels = json.loads((config.DATA_DIR / "qrels.json").read_text(encoding="utf-8"))
    res = {}
    for name, fn in (("tfidf", lexical_scores), ("semantic", semantic_scores)):
        agg = {f"P@{k}": [] for k in ks}; agg.update({f"R@{k}": [] for k in ks}); agg["MRR"] = []
        per_q = []
        for q in qrels["queries"]:
            rel = set(q["relevant_docs"])
            docs = _ranked_docs(_hits(fn(q["query"]), 20))
            row = {"id": q["id"], "top3_docs": docs[:3]}
            for k in ks:
                got = len(rel & set(docs[:k]))
                agg[f"P@{k}"].append(got / k); agg[f"R@{k}"].append(got / len(rel))
            rr = next((1 / (i + 1) for i, d in enumerate(docs) if d in rel), 0.0)
            agg["MRR"].append(rr)
            row["first_relevant_rank"] = next((i + 1 for i, d in enumerate(docs) if d in rel), None)
            per_q.append(row)
        res[name] = {"metrics": {m: round(float(np.mean(v)), 3) for m, v in agg.items()}, "per_query": per_q}
    return {"n_queries": len(qrels["queries"]), "unit": "document (chunks de-duplicated to their source document)",
            "semantic_method": state()["emb"].name, "annotation": qrels["annotation"], "queries": qrels["queries"], "results": res}


# ---------------------------------------------------------------- grounded answering
def assess_evidence(query: str, hits: List[Dict], dense_best: float, neural: bool = False) -> Dict:
    """Sufficiency rule. A single retrieved passage must cover >= INSUFFICIENT_COVERAGE of the question's content
    terms (and >= 2 terms when the question has >= 3); a neural embedder can additionally rescue paraphrased
    questions if its best cosine is >= NEURAL_RESCUE. Coincidental word matches spread over different passages do not count."""
    q = {s for s in content_stems(query) if s not in QUESTION_WORDS and not s.isdigit()}
    best_cov, best_n = 0.0, 0
    for h in hits:
        have = q & set(content_stems(h["title"] + " " + h["text"]))
        if q and len(have) / len(q) > best_cov:
            best_cov, best_n = len(have) / len(q), len(have)
    lexical_ok = best_cov >= INSUFFICIENT_COVERAGE and (best_n >= 2 or len(q) < 3)
    rescue = neural and dense_best >= NEURAL_RESCUE
    reasons = []
    if not (lexical_ok or rescue):
        reasons.append(f"no single retrieved passage covers enough of the question's content terms (best {best_cov:.0%} with {best_n} matching term(s); needs >= {INSUFFICIENT_COVERAGE:.0%} and >= 2 terms)")
    if dense_best < INSUFFICIENT_DENSE[bool(neural)]:
        reasons.append(f"best semantic similarity {dense_best:.2f} is below {INSUFFICIENT_DENSE[bool(neural)]}")
    return {"sufficient": not reasons, "best_passage_term_coverage": round(best_cov, 3), "best_semantic_score": round(dense_best, 3), "reasons": reasons}


def extractive_answer(query: str, hits: List[Dict], n_sent: int = 3) -> List[Dict]:
    s = state()
    cand = []
    for h in hits:
        for sent in split_sentences(h["text"]):
            cand.append({"sentence": sent, "cite": h["rank"], "chunk_id": h["chunk_id"]})
    sents = [c["sentence"] for c in cand]
    dense = s["emb"].encode(sents) @ s["emb"].encode([query])[0]
    lex = (s["tfidf"].transform(sents) @ s["tfidf"].transform([query]).T).toarray().ravel()
    score = 0.6 * dense + 0.4 * lex
    pick, used = [], set()
    for i in np.argsort(-score):
        if cand[i]["cite"] in used and len(used) < min(n_sent, len(hits)):
            continue
        pick.append({**cand[i], "score": round(float(score[i]), 3)}); used.add(cand[i]["cite"])
        if len(pick) == n_sent:
            break
    return sorted(pick, key=lambda x: x["cite"])


def unsupported_references(answer: str, hits: List[Dict]) -> List[str]:
    """Flags author-year citations, 'et al.' mentions and DOIs in the answer that do not match any retrieved source (guards against invented papers)."""
    surnames = {re.split(r"[ ,]", a.strip())[0].lower() for h in hits for a in h["authors"].replace(" and ", ",").split(",") if a.strip()}
    years = {str(h["year"]) for h in hits}
    dois = {h["doi"].lower() for h in hits if h.get("doi")}
    bad = []
    for m in re.finditer(r"\b([A-Z][A-Za-z\-]+)(?: et al\.?| and [A-Z][a-z]+)?,? \(?((?:19|20)\d\d)\)?", answer):
        if m.group(1).lower() not in surnames or m.group(2) not in years:
            bad.append(m.group(0))
    bad += [d for d in re.findall(r"10\.\d{4,9}/[^\s\]\)]+", answer) if d.lower().rstrip(".,;") not in dois]
    return sorted(set(bad))


def verify_answer(answer: str, hits: List[Dict]) -> Dict:
    by_rank = {h["rank"]: h for h in hits}
    out, bad_cites = [], []
    for sent in split_sentences(answer):
        cites = [int(c) for c in re.findall(r"\[(\d+)\]", sent)]
        invalid = [c for c in cites if c not in by_rank]
        bad_cites += invalid
        ref = [by_rank[c] for c in cites if c in by_rank] or []
        pool = set()
        for h in ref:
            pool |= set(content_stems(h["text"]))
        stems_ = set(content_stems(re.sub(r"\[\d+\]", "", sent)))
        support = len(stems_ & pool) / len(stems_) if stems_ and pool else 0.0
        out.append({"sentence": sent, "citations": cites, "invalid_citations": invalid, "support": round(support, 2),
                    "supported": bool(cites) and not invalid and support >= SUPPORT_THRESHOLD})
    ghost = unsupported_references(answer, hits)
    return {"sentences": out, "unsupported_references": ghost, "all_supported": bool(out) and all(o["supported"] for o in out) and not ghost,
            "method": f"Citation-existence check + lexical support: >= {SUPPORT_THRESHOLD:.0%} of a sentence's content stems must appear in the passages it cites. "
                      "This catches uncited/invalid/unsupported text; it cannot prove logical entailment."}


def ask(question: str, k: int = 4, use_llm: bool = True, llm_cfg: Optional[Dict] = None) -> Dict:
    s = state()
    sem = semantic_scores(question)
    lex = lexical_scores(question)
    # hybrid candidate pool: reciprocal-rank fusion of both rankers
    rr = np.zeros(len(sem))
    for scores in (sem, lex):
        for r, i in enumerate(np.argsort(-scores)):
            rr[i] += 1.0 / (60 + r)
    order = np.argsort(-rr)[:k]
    hits = [{"rank": r + 1, "score_semantic": round(float(sem[i]), 4), "score_tfidf": round(float(lex[i]), 4), **s["chunks"][i]} for r, i in enumerate(order)]
    ev = assess_evidence(question, hits, float(sem.max()), s["emb"].neural)
    base = {"question": question, "retrieval": "hybrid (reciprocal-rank fusion of TF-IDF and semantic rankings)",
            "evidence": ev, "passages": hits, "semantic_method": s["emb"].name}
    if not ev["sufficient"]:
        return {**base, "mode": "insufficient_evidence", "answer": "The curated corpus does not contain enough evidence to answer this question reliably.",
                "generator": None, "verification": None}
    st = llm.status(llm_cfg) if use_llm else {"available": False, "state": "disabled", "reason": "LLM disabled for this request", "model": None}
    if st["available"]:
        ctx = "\n\n".join(f"[{h['rank']}] ({h['authors']} {h['year']}, {h['title']}) {h['text']}" for h in hits)
        system = ("You answer research questions strictly from the numbered passages provided. Cite passages like [1] after each claim. "
                  "Do not use outside knowledge. If the passages do not answer the question reply exactly: INSUFFICIENT_EVIDENCE. Maximum 120 words.")
        try:
            text = llm.chat(llm_cfg, st["model"], system, f"Passages:\n{ctx}\n\nQuestion: {question}")
            if "INSUFFICIENT_EVIDENCE" in text:
                return {**base, "mode": "insufficient_evidence", "answer": "The model judged the retrieved passages insufficient to answer.", "generator": {"type": "ollama", "model": st["model"]}, "verification": None}
            return {**base, "mode": "generated", "answer": text, "generator": {"type": "ollama", "model": st["model"]}, "verification": verify_answer(text, hits)}
        except llm.LlmError as e:
            st = {"available": False, "state": e.kind, "reason": f"Ollama call failed ({e.kind}): {e.message}"}
    picks = extractive_answer(question, hits)
    text = " ".join(f"{p['sentence'].rstrip('.')} [{p['cite']}]." for p in picks)
    return {**base, "mode": "extractive", "answer": text, "extracted": picks,
            "generator": {"type": "extractive-fallback", "model": None, "reason": st["reason"]}, "verification": verify_answer(text, hits)}


def _hybrid_hits(question: str, k: int):
    s = state()
    sem, lex = semantic_scores(question), lexical_scores(question)
    rr = np.zeros(len(sem))
    for scores in (sem, lex):
        for r, i in enumerate(np.argsort(-scores)):
            rr[i] += 1.0 / (60 + r)
    order = np.argsort(-rr)[:k]
    return [{"rank": r + 1, "score_semantic": round(float(sem[i]), 4), "score_tfidf": round(float(lex[i]), 4), **s["chunks"][i]} for r, i in enumerate(order)], float(sem.max())


def evaluate_gate() -> Dict:
    """How well does the insufficient-evidence gate separate answerable questions (the judged qrels queries) from off-topic probes?
    NOTE: thresholds were set after inspecting these same questions, so the figures are optimistic."""
    qrels = json.loads((config.DATA_DIR / "qrels.json").read_text(encoding="utf-8"))
    neural = state()["emb"].neural
    def run(qs):
        out = []
        for t in qs:
            hits, dense = _hybrid_hits(t, 4); ev = assess_evidence(t, hits, dense, neural); out.append({"question": t, "sufficient": ev["sufficient"], "coverage": ev["best_passage_term_coverage"], "dense": ev["best_semantic_score"]})
        return out
    ans, off = run([x["query"] for x in qrels["queries"]]), run(qrels["unanswerable_probe_questions"])
    return {"answerable_total": len(ans), "answerable_accepted": sum(a["sufficient"] for a in ans), "offtopic_total": len(off), "offtopic_rejected": sum(not o["sufficient"] for o in off),
            "false_rejects": [a["question"] for a in ans if not a["sufficient"]], "false_accepts": [o["question"] for o in off if o["sufficient"]], "semantic_method": state()["emb"].name,
            "caveat": "Thresholds were tuned after looking at these same questions: optimistic, not a held-out estimate."}
