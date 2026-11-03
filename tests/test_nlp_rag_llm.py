import os

import pytest
import requests

from backend import llm, nlp, rag


# ---------------- NLP
def test_tokenise_stem_lemma():
    assert nlp.tokenise("It's 3.5 seconds!") == ["it's", "3.5", "seconds"]
    assert nlp.stem("distracted") == nlp.stem("distracting")
    assert "the" not in nlp.content_stems("The screen was flickering")
    toks = nlp.preprocess("The beeps were flickering")["tokens"]; assert all("lemma" in t for t in toks)
    assert dict((t["text"], t["lemma"]) for t in toks)["beeps"] == "beep"


def test_negation_flips_lexicon_polarity():
    assert nlp.themes_and_polarity("It was easy and calm")["lexicon_polarity"]["score"] > 0 > nlp.themes_and_polarity("It was not easy and not calm")["lexicon_polarity"]["score"]


def test_vader_and_caveat():
    s = nlp.vader_sentiment("This was a great and enjoyable task")
    assert s["available"] and s["compound"] > 0.05 and "not stress" in s["caveat"].lower()
    assert nlp.vader_sentiment("This was terrible and frustrating")["compound"] < -0.05


def test_keywords():
    k = nlp.extract_keywords("The flickering background made the visual search very difficult.")
    assert k and all({"phrase", "score"} <= set(x) for x in k) and "the" not in [p["phrase"] for p in k]


def test_theme_modelling_refuses_small_samples():
    r = nlp.corpus_themes(["only a few words here to test"] * 3); assert r["status"] == "insufficient_data" and "topics" not in r


def test_theme_modelling_runs_with_enough_real_text():
    texts = [f"The {w} made the search {v} and I felt {u}" for w, v, u in [("flicker", "hard", "rushed"), ("beep", "easy", "calm"), ("clutter", "tiring", "tense"), ("motion", "hard", "rushed"), ("sound", "easy", "calm"),
             ("flicker", "tiring", "tense"), ("beep", "easy", "focused"), ("clutter", "hard", "rushed"), ("motion", "tiring", "tense"), ("sound", "easy", "calm"), ("flicker", "hard", "tense")]]
    assert nlp.corpus_themes(texts)["status"] == "ok"  # mechanics test on hand-written sentences; output is not stored or reported anywhere


# ---------------- corpus + retrieval + citations
def test_corpus_metadata_is_complete_and_citations_resolve():
    docs = rag.load_documents(); ids = [d["id"] for d in docs]
    assert len(ids) == len(set(ids)) >= 25
    for d in docs:
        assert d["abstract"].strip() and d["authors"] and d["year"] > 1990 and d["url"].startswith("https://")
        assert d["doi"] or d["url"].startswith("https://arxiv.org/abs/")
        for c in rag.chunk_document(d):
            assert c["text"] in d["abstract"] and c["doc_id"] == d["id"] and d["abstract"][c["char_start"]:c["char_end"]] == c["text"]


def test_vector_index_matches_embeddings():
    s = rag.state(); assert s["index"] is not None and s["index"].ntotal == len(s["chunks"]) and "faiss" in rag.info()["vector_store"]
    q = "redundant audio and visual signals reaction time"; assert "diederich2004" in {h["doc_id"] for h in rag.search(q, 3)["semantic"]}


def test_retrieval_eval_has_valid_metrics():
    e = rag.evaluate_retrieval(); assert e["n_queries"] >= 25
    for m in ("tfidf", "semantic"):
        assert all(0 <= v <= 1 for v in e["results"][m]["metrics"].values())


@pytest.mark.parametrize("q", ["What is the capital of France?", "How do I bake sourdough bread?", "Who won the 2018 football World Cup?"])
def test_unsupported_questions_get_insufficient_evidence(q):
    a = rag.ask(q, use_llm=False); assert a["mode"] == "insufficient_evidence" and a["verification"] is None


def test_extractive_answer_is_labelled_and_every_citation_resolves():
    a = rag.ask("Does background noise impair performance?", use_llm=False)
    assert a["mode"] == "extractive" and a["generator"]["type"] == "extractive-fallback" and a["verification"]["all_supported"]
    by_rank = {p["rank"]: p for p in a["passages"]}
    for e in a["extracted"]:
        assert e["cite"] in by_rank and e["sentence"] in by_rank[e["cite"]]["text"] and by_rank[e["cite"]]["url"].startswith("https://")


def test_verifier_flags_invalid_citations_unsupported_claims_and_invented_papers():
    hits = [{"rank": 1, "text": "Noise is a pervasive source of stress.", "authors": "Szalma JL, Hancock PA.", "year": 2011, "doi": "10.1037/a0023987"}]
    v = rag.verify_answer("Noise is a source of stress [1]. Coffee cures migraines [1]. Bananas are yellow [7].", hits)
    assert [s["supported"] for s in v["sentences"]] == [True, False, False] and v["sentences"][2]["invalid_citations"] == [7] and not v["all_supported"]
    ghost = rag.verify_answer("Noise is a source of stress [1]. Smith et al. 2019 confirmed this. See doi 10.9999/fake.123 [1].", hits)
    assert any("Smith" in g for g in ghost["unsupported_references"]) and any("10.9999" in g for g in ghost["unsupported_references"]) and not ghost["all_supported"]
    ok = rag.verify_answer("Szalma and Hancock (2011) describe noise as a source of stress [1].", hits); assert ok["unsupported_references"] == []


# ---------------- Ollama client + integration (mocked unless a real server answers)
def _patch_llm(monkeypatch, reply=None, fail=None):
    monkeypatch.setattr(llm, "status", lambda cfg=None: {"available": True, "state": "ready", "reason": "ok", "models": [], "model": "fake"})
    def chat(cfg, model, system, user, max_tokens=350):
        assert "numbered passages" in system and "[1]" in user
        if fail: raise llm.LlmError(fail, "boom")
        return reply
    monkeypatch.setattr(llm, "chat", chat)


def test_generated_answer_labelled_and_verified(monkeypatch):
    _patch_llm(monkeypatch, "Noise is a pervasive source of stress that affects performance [1]. Cats can fly [2].")
    a = rag.ask("Does background noise impair performance?")
    assert a["mode"] == "generated" and a["generator"] == {"type": "ollama", "model": "fake"} and not a["verification"]["all_supported"]


def test_llm_refusal_and_each_failure_kind_fall_back_honestly(monkeypatch):
    _patch_llm(monkeypatch, "INSUFFICIENT_EVIDENCE"); assert rag.ask("Does background noise impair performance?")["mode"] == "insufficient_evidence"
    for kind in ("timeout", "unreachable", "model_missing", "http_error", "bad_response"):
        _patch_llm(monkeypatch, fail=kind); a = rag.ask("Does background noise impair performance?")
        assert a["mode"] == "extractive" and kind in a["generator"]["reason"] and a["generator"]["type"] == "extractive-fallback"  # never labelled as Ollama


def test_status_states(monkeypatch):
    class R:
        def __init__(s, js, ok=True): s._j, s.ok, s.status_code, s.text = js, ok, 200, ""
        def json(s): return s._j
        def raise_for_status(s): pass
    monkeypatch.setattr(requests, "get", lambda *a, **k: (_ for _ in ()).throw(requests.exceptions.ConnectionError()))
    assert llm.status()["state"] == "unreachable" and not llm.status()["available"]
    monkeypatch.setattr(requests, "get", lambda u, **k: R({"models": []}) if u.endswith("tags") else R({}))
    assert llm.status()["state"] == "no_models"
    monkeypatch.setattr(requests, "get", lambda u, **k: R({"models": [{"name": "m1", "size": 1e9, "details": {}}]}) if u.endswith("tags") else R({"version": "0", "models": []}))
    assert llm.status({"model": "other"})["state"] == "model_missing"
    st = llm.status({"model": "m1"}); assert st["state"] == "ready" and st["model"] == "m1"


def test_ollama_host_validation():
    for bad in ("ftp://localhost", "http://example.com:11434", "http://10.0.0.5:11434", "localhost:11434"):
        with pytest.raises(ValueError): llm.validate_host(bad)
    assert llm.validate_host("http://127.0.0.1:11434/") == "http://127.0.0.1:11434" and llm.validate_host("http://localhost:11434")
    assert llm.status({"host": "http://example.com"})["state"] == "host_rejected"


def test_explain_metrics_flags_invented_numbers(monkeypatch):
    monkeypatch.setattr(llm, "chat", lambda *a, **k: "The model reached an F1 of 0.70 and an AUC of 0.93.")
    r = llm.explain_metrics(None, "m", '{"f1": 0.70, "roc_auc": 0.80}')
    assert r["unverified_numbers"] == ["0.93"] and not r["verified"]
    monkeypatch.setattr(llm, "chat", lambda *a, **k: "F1 was 0.70."); assert llm.explain_metrics(None, "m", '{"f1": 0.70}')["verified"]


def test_admin_ollama_settings_reject_remote_host(admin, researcher):
    assert admin.put("/api/admin/ollama", json={"host": "http://evil.example.com:11434"}).status_code == 422
    assert researcher.put("/api/admin/ollama", json={"model": "m"}).status_code == 403
    assert admin.put("/api/admin/ollama", json={"host": "http://127.0.0.1:11434", "model": "does-not-exist"}).json()["status"]["state"] in ("model_missing", "unreachable")


def test_admin_rag_nlp_endpoints(admin):
    assert admin.post("/api/admin/rag/search", json={"query": "task switching cost"}).json()["lexical"]
    assert admin.post("/api/admin/rag/ask", json={"question": "What is the capital of France?", "use_llm": False}).json()["mode"] == "insufficient_evidence"
    n = admin.post("/api/admin/nlp/analyze", json={"text": "The flickering distracted me but the beep helped."}).json()
    assert n["sentiment_vader"]["available"] and n["keywords"] and n["themes"]
    assert admin.get("/api/admin/rag/gate-evaluation").json()["offtopic_total"] == 12
    assert admin.post("/api/admin/ml/explain", json={"run_id": 99999}).status_code == 404


@pytest.mark.skipif(not (llm.status()["available"]), reason="no local Ollama server with a model")
def test_live_ollama_generation_end_to_end():
    a = rag.ask("Do redundant audio and visual signals speed up responses?", use_llm=True)
    assert a["mode"] in ("generated", "insufficient_evidence") and (a["mode"] != "generated" or a["generator"]["type"] == "ollama")
    if a["mode"] == "generated":
        assert a["verification"]["sentences"] and all(c in [p["rank"] for p in a["passages"]] for s in a["verification"]["sentences"] for c in s["citations"])
