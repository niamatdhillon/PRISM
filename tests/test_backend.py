import os
os.environ.setdefault("PRISM_EMBEDDINGS", "lsa")
os.environ["PRISM_DB"] = "/tmp/prism_test.sqlite3"
import pytest
from fastapi.testclient import TestClient

from backend import analytics, nlp, rag, synthetic, ml
from backend.app import app
from backend.schema import SessionRecord

client = TestClient(app)


def test_stem_and_tokenise():
    assert nlp.stem("distracted") == nlp.stem("distracting") == nlp.stem("distractions") or nlp.stem("distracted") == nlp.stem("distracting")
    assert "the" not in nlp.content_stems("The screen was flickering")
    assert nlp.tokenise("It's 3.5 seconds!") == ["it's", "3.5", "seconds"]


def test_negation_flips_polarity():
    pos = nlp.themes_and_polarity("It was easy and calm")["lexicon_polarity"]["score"]
    neg = nlp.themes_and_polarity("It was not easy and not calm")["lexicon_polarity"]["score"]
    assert pos > 0 > neg


def test_chunks_preserve_metadata_and_text():
    for d in rag.load_documents():
        chunks = rag.chunk_document(d)
        assert chunks and all(c["doc_id"] == d["id"] and c["url"] and c["text"] in d["abstract"] for c in chunks)


def test_retrieval_returns_relevant_source():
    r = rag.search("redundant audio and visual signals reaction time", 3)
    assert "diederich2004" in {h["doc_id"] for h in r["lexical"]} and "diederich2004" in {h["doc_id"] for h in r["semantic"]}


def test_retrieval_eval_has_metrics_in_range():
    e = rag.evaluate_retrieval()
    for m in ("tfidf", "semantic"):
        assert all(0 <= v <= 1 for v in e["results"][m]["metrics"].values())
    assert e["n_queries"] >= 12


@pytest.mark.parametrize("q", ["What is the capital of France?", "How do I bake sourdough bread?", "Who won the 2018 football World Cup?"])
def test_unanswerable_gets_insufficient_evidence(q):
    assert rag.ask(q, use_llm=False)["mode"] == "insufficient_evidence"


def test_answerable_question_is_extractive_and_verified():
    a = rag.ask("Does background noise impair performance?", use_llm=False)
    assert a["mode"] == "extractive" and a["generator"]["type"] == "extractive-fallback"
    assert a["verification"]["all_supported"]
    assert all(s["sentence"] in " ".join(p["text"] for p in a["passages"]) for s in a["extracted"])


def test_verify_flags_invalid_citation_and_unsupported_claim():
    hits = [{"rank": 1, "text": "Noise is a pervasive source of stress."}]
    v = rag.verify_answer("Noise is a source of stress [1]. Coffee cures migraines [1]. Bananas are yellow [7].", hits)
    assert [s["supported"] for s in v["sentences"]] == [True, False, False]
    assert v["sentences"][2]["invalid_citations"] == [7]


def test_synthetic_records_validate_and_are_labelled():
    recs = synthetic.generate(8, 3)
    assert len(recs) == 24 and all(r["source"] == "synthetic" for r in recs)
    for r in recs:
        SessionRecord(**r)


def test_participant_requires_consent():
    r = synthetic.generate(1, 1)[0]
    r.update(source="participant", consent=False)
    assert client.post("/api/sessions", json=r).status_code == 422
    r.update(consent=True, consent_version="v0.1-demo")
    assert client.post("/api/sessions", json=r).json()["stored"] is True
    assert client.get("/api/sessions?source=participant").json()["records"][0]["session_id"] == r["session_id"]
    assert client.delete("/api/sessions?source=participant").json()["deleted"] == 1


def test_analytics_and_csv():
    recs = synthetic.generate(10, 3)
    a = analytics.analyse(recs)
    assert a["participant"]["n_sessions"] == 0 and a["synthetic"]["n_sessions"] == 30
    assert a["public"]["n_sessions"] == 0
    csv = analytics.to_csv(recs, "sessions").splitlines()
    assert len(csv) == 31 and "tlx_global" in csv[0]
    assert len(analytics.to_csv(recs, "trials").splitlines()) == 1 + sum(len(r["trials"]) for r in recs)


def test_ml_grouped_split_has_no_participant_leakage_and_beats_nothing_dishonestly():
    recs = synthetic.generate()
    X, y, g = ml.build_dataset(recs)
    tr, te, _ = ml._split(y, g)
    assert not (set(g[tr]) & set(g[te]))
    res = ml.evaluate(recs, "synthetic")
    assert res["status"] == "ok" and "SYNTHETIC" in res["label"]
    assert res["feature_sets"]["behaviour_only"]["models"]["baseline_majority"]["f1"] == 0.0


def test_ml_refuses_to_evaluate_tiny_real_data():
    res = ml.evaluate(synthetic.generate(3, 2), "participant")
    assert res["status"] == "insufficient_data" and "UNEVALUATED" in res["label"]


def test_api_status_and_nlp():
    s = client.get("/api/status").json()
    assert s["mode"] == "local" and "ollama" in s
    n = client.post("/api/nlp/analyze", json={"text": "The flickering was distracting and I felt rushed, but the beep helped."}).json()
    assert n["features"]["tokens"] > 5 and any(t["id"] == "distraction" for t in n["themes"])
    assert client.post("/api/nlp/analyze", json={"text": "  "}).status_code == 422


# ---- Ollama path exercised with a fake client (Ollama itself is not installed on the dev machine)
def _fake_llm(monkeypatch, reply=None, fail=False):
    from backend import llm
    monkeypatch.setattr(llm, "status", lambda: {"available": True, "reason": "ok", "models": ["fake"], "model": "fake"})
    def chat(model, system, user):
        assert "numbered passages" in system and "[1]" in user
        if fail:
            raise RuntimeError("boom")
        return reply
    monkeypatch.setattr(llm, "chat", chat)


def test_generated_answer_is_labelled_and_verified(monkeypatch):
    _fake_llm(monkeypatch, "Noise is a pervasive source of stress that affects performance [1]. Cats can fly [2].")
    a = rag.ask("Does background noise impair performance?", use_llm=True)
    assert a["mode"] == "generated" and a["generator"] == {"type": "ollama", "model": "fake"}
    assert [s["supported"] for s in a["verification"]["sentences"]] == [True, False] and not a["verification"]["all_supported"]


def test_llm_refusal_and_failure_paths(monkeypatch):
    _fake_llm(monkeypatch, "INSUFFICIENT_EVIDENCE")
    assert rag.ask("Does background noise impair performance?")["mode"] == "insufficient_evidence"
    _fake_llm(monkeypatch, fail=True)
    a = rag.ask("Does background noise impair performance?")
    assert a["mode"] == "extractive" and "Ollama call failed" in a["generator"]["reason"]


def test_hosted_mode_never_contacts_ollama(monkeypatch):
    from backend import config, llm
    monkeypatch.setattr(config, "IS_HOSTED", True)
    st = llm.status()
    assert st["available"] is False and "Hosted mode" in st["reason"]
