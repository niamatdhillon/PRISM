import { useEffect, useState } from "react";
import { api } from "../api";
import { useStatus } from "../App";
import { ErrorBox, Note, Spinner, Tabs, useAsync } from "../components/ui";
import type { Any } from "../types";

const SAMPLE = "The flickering made it hard to find the diamond and I felt rushed. The beep helped a little, but I wasn't calm — the cluttered screen was tiring and quite frustrating.";
const QUESTIONS = ["Does background noise impair performance?", "Do redundant sound and light signals speed up responses?", "Can reaction time variability indicate cognitive decline?", "What is the capital of France?"];

function Evidence({ p, id }: { p: Any; id: string }) {
  return (
    <div className="evidence" id={id}>
      <div className="row spread"><span className="ref">[{p.rank}] {p.chunk_id}</span>
        <span className="mono small">{p.score !== undefined ? `score ${p.score}` : `semantic ${p.score_semantic} · tf-idf ${p.score_tfidf}`}</span></div>
      <p style={{ margin: "8px 0" }}>{p.text}</p>
      <div className="small">{p.authors} ({p.year}). <em>{p.title}</em> {p.venue}.
        {" "}<a href={p.url} target="_blank" rel="noreferrer">Source record ↗</a>{p.doi_url && <> · <a href={p.doi_url} target="_blank" rel="noreferrer">DOI {p.doi} ↗</a></>}
        {" "}· chars {p.char_start}–{p.char_end} of the abstract</div>
    </div>
  );
}
const jump = (id: string) => { const el = document.getElementById(id); if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); } };

function Reflection() {
  const [text, setText] = useState(() => { try { return sessionStorage.getItem("prism.reflection") || SAMPLE; } catch { return SAMPLE; } });
  const [res, setRes] = useState<Any>(null); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); setErr(null); try { setRes(await api.nlp(text)); } catch (e) { setErr(e); } finally { setBusy(false); } };
  useEffect(() => { void go(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return (
    <>
      <label htmlFor="rt">Reflection text</label>
      <textarea id="rt" value={text} onChange={(e) => setText(e.target.value)} maxLength={6000} />
      <div className="row mt"><button className="btn" onClick={go} disabled={busy || !text.trim()}>Analyse text</button><button className="btn ghost" onClick={() => setText(SAMPLE)}>Use sample</button>{busy && <Spinner />}</div>
      <ErrorBox error={err} />
      {res && (
        <div className="mt">
          <div className="grid g2">
            <div className="panel"><h3>1 · Preprocessing</h3>
              <p className="small">Raw → normalised: <span className="mono">{res.preprocessing.normalised}</span></p>
              <p>{res.preprocessing.tokens.map((t: Any, i: number) => <span key={i} className={"chip" + (t.stopword ? " stop" : "")} title={`stem: ${t.stem}${t.stopword ? " · stop word (removed)" : ""}`}>{t.text}{!t.stopword && t.stem !== t.text ? <small> → {t.stem}</small> : null}</span>)}</p>
              <small>Struck-through chips are stop words (dropped from TF-IDF). “→” shows the light stem.</small>
              <details><summary>Transformations applied</summary><ol className="clean">{res.preprocessing.steps.map((s: Any) => <li key={s.name}><strong>{s.name}.</strong> {s.detail}</li>)}</ol></details></div>
            <div className="panel"><h3>2 · Linguistic features</h3><table><tbody>{Object.entries(res.features).map(([k, v]) => <tr key={k}><td>{k.replace(/_/g, " ")}</td><td className="num">{String(v)}</td></tr>)}</tbody></table>
              <small>Descriptive surface statistics. Type–token ratio falls with length, so compare only texts of similar size.</small></div>
            <div className="panel"><h3>3 · TF-IDF terms</h3>
              {res.tfidf.top_terms.length ? res.tfidf.top_terms.map((t: Any) => <div key={t.term} style={{ display: "grid", gridTemplateColumns: "110px 1fr 54px", gap: 8, alignItems: "center", marginBottom: 5 }}><span className="mono">{t.term}</span><div className="bar"><i style={{ width: `${Math.min(100, t.tfidf * 220)}%` }} /></div><span className="mono small">{t.tfidf}</span></div>) : <p className="small">No in-vocabulary terms.</p>}
              <small>{res.tfidf.note} Vocabulary: {res.tfidf.vocabulary_size} stems. Not weighted (out-of-vocabulary): {res.tfidf.out_of_vocabulary.join(", ") || "none"}.</small></div>
            <div className="panel"><h3>4 · Themes & lexicon polarity</h3>
              {res.themes.length ? res.themes.map((t: Any) => <div key={t.id} style={{ marginBottom: 8 }}><strong>{t.label}</strong> <span className="badge b-info">{t.count} hit{t.count > 1 ? "s" : ""}</span><div>{t.matched_words.map((w: string) => <span key={w} className="chip hit">{w}</span>)}</div></div>) : <p className="small">No theme words matched.</p>}
              <p className="mt small"><strong>Lexicon polarity:</strong> {res.lexicon_polarity.score ?? "n/a"} — {res.lexicon_polarity.interpretation} ({res.lexicon_polarity.positive_hits}+ / {res.lexicon_polarity.negative_hits}−)</p>
              <Note>{res.limitations}</Note></div>
          </div>
          <div className="panel mt"><h3>5 · Nearest literature (does this text resemble any source?)</h3>
            <div className="grid g2">{(["tfidf", "semantic"] as const).map((m) => <div key={m}><h4>{m === "tfidf" ? "TF-IDF cosine" : `Semantic (${res.nearest_literature.semantic_method})`}</h4>{res.nearest_literature[m].map((n: Any) => <p key={n.chunk_id} className="small"><span className="mono">{n.score}</span> · {n.title} ({n.year}) <span className="mono">{n.chunk_id}</span></p>)}</div>)}</div>
            <small>Surface resemblance to abstracts only; it does not show that the literature explains this participant’s experience.</small></div>
        </div>
      )}
    </>
  );
}

function Retrieval() {
  const [q, setQ] = useState("why do people respond faster when sound and light are combined?");
  const [res, setRes] = useState<Any>(null); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); setErr(null); try { setRes(await api.search(q, 5)); } catch (e) { setErr(e); } finally { setBusy(false); } };
  useEffect(() => { void go(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return (
    <>
      <label htmlFor="rq">Search query</label>
      <div className="row" style={{ flexWrap: "nowrap" }}><input id="rq" type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} /><button className="btn" onClick={go} disabled={busy || q.length < 2}>Search</button></div>
      <ErrorBox error={err} /> {busy && <Spinner />}
      {res && (
        <>
          <div className="note info mt">Overlap of top-{res.k} passages: <strong>{res.comparison.shared_chunks.length}</strong> shared (Jaccard {res.comparison.jaccard_chunks}). Documents only in TF-IDF: <span className="mono">{res.comparison.only_lexical_docs.join(", ") || "none"}</span> · only in semantic: <span className="mono">{res.comparison.only_semantic_docs.join(", ") || "none"}</span>. Query stems: <span className="mono">{res.query_stems.join(" ")}</span></div>
          <div className="grid g2">
            {(["lexical", "semantic"] as const).map((m) => (
              <div key={m}><h3>{m === "lexical" ? "Keyword · TF-IDF cosine" : `Semantic · ${res.semantic_method}`}</h3>
                {res[m].map((h: Any) => <div key={h.chunk_id} className="evidence" style={{ borderLeftColor: m === "lexical" ? "var(--cyan)" : "var(--violet)" }}>
                  <div className="row spread"><span className="ref">#{h.rank} {h.chunk_id}</span><span className="mono small">{h.score}{res.comparison.rank_shift[h.chunk_id] ? ` · also in ${m === "lexical" ? "semantic" : "TF-IDF"} at #${res.comparison.rank_shift[h.chunk_id][m === "lexical" ? "semantic" : "lexical"]}` : " · only here"}</span></div>
                  <p className="small" style={{ margin: "6px 0" }}>{h.text}</p><div className="small">{h.authors} ({h.year}) <em>{h.title}</em> · <a href={h.url} target="_blank" rel="noreferrer">source ↗</a></div></div>)}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Ask() {
  const { status } = useStatus();
  const [q, setQ] = useState(QUESTIONS[0]); const [llm, setLlm] = useState(true);
  const [res, setRes] = useState<Any>(null); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const go = async (question = q) => { setBusy(true); setErr(null); try { setRes(await api.ask(question, llm)); } catch (e) { setErr(e); } finally { setBusy(false); } };
  const renderAnswer = (t: string) => t.split(/(\[\d+\])/g).map((part, i) => { const m = part.match(/^\[(\d+)\]$/); return m ? <button key={i} className="cite" onClick={() => jump("ev-" + m[1])} aria-label={`Jump to evidence ${m[1]}`}>{part}</button> : <span key={i}>{part}</span>; });
  const g = res?.generator;
  return (
    <>
      <div className="row">
        <span className={"badge " + (status?.ollama.available ? "b-real" : "b-synth")}>{status?.mode === "hosted" ? "Hosted mode · no LLM · extractive only" : status?.ollama.available ? `Ollama ready · ${status.ollama.model}` : "Ollama unavailable · extractive fallback"}</span>
        {status?.mode === "local" && <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={llm} onChange={(e) => setLlm(e.target.checked)} />Use local LLM when available</label>}
      </div>
      {status && !status.ollama.available && <small>{status.ollama.reason}</small>}
      <label htmlFor="aq" className="mt">Research question</label>
      <div className="row" style={{ flexWrap: "nowrap" }}><input id="aq" type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} /><button className="btn" onClick={() => go()} disabled={busy || q.length < 3}>Ask the corpus</button></div>
      <div className="row mt">{QUESTIONS.map((x) => <button key={x} className="btn sm ghost" onClick={() => { setQ(x); void go(x); }}>{x}</button>)}</div>
      <ErrorBox error={err} /> {busy && <Spinner label="Retrieving and answering…" />}
      {res && (
        <div className="mt">
          <div className="row" style={{ marginBottom: 10 }}>
            {res.mode === "generated" && <span className="badge b-real">✦ GENERATED by local LLM · {g.model}</span>}
            {res.mode === "extractive" && <span className="badge b-info">≡ EXTRACTIVE FALLBACK · verbatim sentences, no generation</span>}
            {res.mode === "insufficient_evidence" && <span className="badge b-bad">✕ INSUFFICIENT EVIDENCE</span>}
            <span className="small">Retrieval: {res.retrieval}; semantic = {res.semantic_method}</span>
          </div>
          <div className="answer" aria-live="polite">{renderAnswer(res.answer)}</div>
          {res.mode === "extractive" && <small>{g.reason ? `Why not generative: ${g.reason}. ` : ""}An extractive system selects and quotes sentences from retrieved text; it does not compose new text and is not generative RAG.</small>}
          {res.mode === "insufficient_evidence" && <Note kind="bad">{(res.evidence.reasons || []).join(" · ") || "The model judged the passages insufficient."} The retrieved passages below are shown for transparency but are not claimed to answer the question.</Note>}
          {res.verification && (
            <details open className="mt"><summary>Citation verification — {res.verification.all_supported ? "✓ every sentence cites an existing passage and is lexically supported" : "⚠ some sentences are unsupported"}</summary>
              {res.verification.sentences.map((s: Any, i: number) => <p key={i} className="small">{s.supported ? "✓" : "✗"} <span className="mono">support {s.support}</span> · cites {s.citations.join(", ") || "none"}{s.invalid_citations.length ? ` (invalid: ${s.invalid_citations.join(",")})` : ""} — {s.sentence.slice(0, 120)}{s.sentence.length > 120 ? "…" : ""}</p>)}
              <small>{res.verification.method}</small></details>
          )}
          <p className="small mt">Evidence check: best-passage term coverage {res.evidence.best_passage_term_coverage} · best semantic score {res.evidence.best_semantic_score} · sufficient: {String(res.evidence.sufficient)}</p>
          <h3 className="mt">Retrieved evidence</h3>
          {res.passages.map((p: Any) => <Evidence key={p.chunk_id} p={p} id={"ev-" + p.rank} />)}
        </div>
      )}
    </>
  );
}

function Evaluation() {
  const { data, error, loading } = useAsync(() => api.retrievalEval(), []);
  const { data: corpus } = useAsync(() => api.corpus(), []);
  return (
    <>
      <ErrorBox error={error} /> {loading && <Spinner />}
      {data && (
        <>
          <Note kind="info"><strong>Annotation:</strong> {data.annotation}</Note>
          <div className="panel scroll-x"><h3>Retrieval metrics ({data.n_queries} queries · unit: {data.unit})</h3>
            <table><thead><tr><th>Method</th>{Object.keys(data.results.tfidf.metrics).map((m) => <th key={m} className="num">{m}</th>)}</tr></thead>
              <tbody>{(["tfidf", "semantic"] as const).map((m) => <tr key={m}><td>{m === "tfidf" ? "TF-IDF (keyword)" : `Semantic · ${data.semantic_method}`}</td>{Object.values(data.results[m].metrics).map((v, i) => <td key={i} className="num">{String(v)}</td>)}</tr>)}</tbody></table>
            <small>P@k = relevant documents in the top-k ÷ k; R@k = relevant found ÷ all relevant; MRR = mean reciprocal rank of the first relevant document. With 16 queries and a single annotator the differences between methods are not statistically meaningful.</small></div>
          <div className="panel scroll-x mt"><h3>Per-query judgements</h3>
            <table><thead><tr><th>Query</th><th>Judged relevant</th><th className="num">1st rel. rank TF-IDF</th><th className="num">semantic</th></tr></thead>
              <tbody>{data.queries.map((q: Any, i: number) => <tr key={q.id}><td>{q.query}</td><td className="mono small">{q.relevant_docs.join(", ")}</td><td className="num">{data.results.tfidf.per_query[i].first_relevant_rank ?? "—"}</td><td className="num">{data.results.semantic.per_query[i].first_relevant_rank ?? "—"}</td></tr>)}</tbody></table></div>
        </>
      )}
      {corpus && (
        <div className="panel mt scroll-x"><h3>Corpus: {corpus.info.documents} documents → {corpus.info.chunks} passages</h3>
          <p className="small">Chunking: {corpus.info.chunking}. Semantic method: <strong>{corpus.info.semantic_method}</strong> — {corpus.info.semantic_description} {corpus.info.note}</p>
          <table><thead><tr><th>Source</th><th>Topic</th><th>Links</th></tr></thead><tbody>{corpus.documents.map((d: Any) => <tr key={d.id}><td>{d.authors} ({d.year}). {d.title} <em>{d.venue}</em></td><td className="mono small">{d.topic}</td><td><a href={d.url} target="_blank" rel="noreferrer">{d.pmid ? "PubMed" : "arXiv"} ↗</a>{d.doi && <> · <a href={`https://doi.org/${d.doi}`} target="_blank" rel="noreferrer">DOI ↗</a></>}</td></tr>)}</tbody></table>
          <small>Only titles, metadata and abstracts are stored (retrieved from Europe PMC and arXiv); copyright remains with the publishers/authors.</small></div>
      )}
    </>
  );
}

export default function NlpRag() {
  const [tab, setTab] = useState("reflect");
  return (
    <div className="wrap" style={{ paddingTop: 36 }}>
      <span className="kicker">NLP + RAG laboratory</span>
      <h2>From reflections to evidence</h2>
      <p className="small" style={{ maxWidth: 780 }}>A classical, inspectable NLP pipeline (normalise → tokenise → TF-IDF → themes) and a retrieval-augmented question-answering workflow over a small verified literature corpus. Every answer shows its sources and says whether it was <strong>generated</strong> by a local LLM or merely <strong>extracted</strong>.</p>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "reflect", label: "Reflection analysis" }, { id: "retrieve", label: "Keyword vs semantic retrieval" }, { id: "ask", label: "Evidence-grounded Q&A" }, { id: "eval", label: "Evaluation & corpus" }]} />
      {tab === "reflect" && <Reflection />}{tab === "retrieve" && <Retrieval />}{tab === "ask" && <Ask />}{tab === "eval" && <Evaluation />}
    </div>
  );
}
