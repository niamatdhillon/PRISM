"""Text-analysis helper shared by the researcher lab and the public demo (no storage, no side effects)."""
from .. import nlp, rag


def analyze_text(text: str) -> dict:
    pre = nlp.preprocess(text)
    s = rag.state()
    vec = s["tfidf"]; q = vec.transform([text]); inv = {i: t for t, i in vec.vocabulary_.items()}; coo = q.tocoo()
    terms = sorted([{"term": inv[c], "tfidf": round(float(v), 4), "idf": round(float(vec.idf_[c]), 3)} for c, v in zip(coo.col, coo.data)], key=lambda d: -d["tfidf"])[:12]
    sims = (s["X"] @ q.T).toarray().ravel(); ssem = rag.semantic_scores(text)
    top = lambda sc: [{"chunk_id": s["chunks"][i]["chunk_id"], "title": s["chunks"][i]["title"], "year": s["chunks"][i]["year"], "score": round(float(sc[i]), 3)} for i in sc.argsort()[::-1][:3]]  # noqa: E731
    return {"preprocessing": pre, "features": nlp.linguistic_features(text), **nlp.themes_and_polarity(text), "sentiment_vader": nlp.vader_sentiment(text), "keywords": nlp.extract_keywords(text),
            "tfidf": {"top_terms": terms, "out_of_vocabulary": sorted({t for t in pre["content_stems"] if t not in vec.vocabulary_}), "vocabulary_size": len(vec.vocabulary_),
                      "note": "TF-IDF is fitted on the scientific corpus; terms absent from it get no weight."},
            "nearest_literature": {"tfidf": top(sims), "semantic": top(ssem), "semantic_method": s["emb"].name}}
