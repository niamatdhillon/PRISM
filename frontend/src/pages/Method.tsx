import { api } from "../api";
import { ErrorBox, Note, useAsync } from "../components/ui";
import { useStatus } from "../App";
import type { Any } from "../types";

const METHOD_REFS = [
  { c: "Hart, S. G., & Staveland, L. E. (1988). Development of NASA-TLX (Task Load Index): Results of empirical and theoretical research. Advances in Psychology, 52, 139–183.", doi: "10.1016/S0166-4115(08)62386-9" },
  { c: "Hart, S. G. (2006). NASA-Task Load Index (NASA-TLX); 20 years later. Proceedings of the Human Factors and Ergonomics Society Annual Meeting, 50(9).", doi: "10.1177/154193120605000909" },
  { c: "Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. Cognitive Science, 12(2), 257–285.", doi: "10.1207/s15516709cog1202_4" },
  { c: "Wickens, C. D. (2008). Multiple resources and mental workload. Human Factors, 50(3), 449–455.", doi: "10.1518/001872008X288394" },
];

export default function Method() {
  const { status } = useStatus();
  const dict = useAsync<Any>(() => api.dictionary(), []);
  const corpus = useAsync<Any>(() => api.corpus(), []);
  return (
    <div className="wrap" style={{ paddingTop: 36 }}>
      <span className="kicker">Methodology & evidence</span>
      <h2>How PRISM works — and what it cannot tell you</h2>

      <section className="block"><h3>Research questions & hypotheses</h3>
        <div className="grid g2"><div className="panel"><p><strong>RQ1.</strong> Can behavioural signals from a controlled sensory task (RT, errors, variability) predict task-related perceived workload?</p><p><strong>RQ2.</strong> Do sensory conditions relate to self-reported stress change?</p><p><strong>RQ3.</strong> Do redundant audiovisual cues change RT relative to visual-only cues?</p><p><strong>RQ4.</strong> Can NLP and RAG connect participants’ reflections to published evidence transparently?</p></div>
          <div className="panel"><p className="mono">Exploratory, pre-specified directions (none tested confirmatorily):</p><ul className="clean"><li>H1: higher visual complexity, movement and distraction → longer RT, lower accuracy, higher TLX (cf. load theory of attention, Lavie 2005).</li><li>H2: higher sensory load → larger post−pre stress increase.</li><li>H3: audiovisual blocks → shorter RT (redundant-signal effect, Diederich & Colonius 2004).</li><li>H4: RT variability is a stable within-person trait that can be tracked over repeated sessions; no clinical inference (Hultsch 2002; Haynes 2017 concern older adult cohorts).</li></ul></div></div></section>

      <section className="block"><h3>Experimental design</h3>
        <div className="panel"><ul className="clean"><li><strong>Task:</strong> find the cyan diamond among cyan circles and violet diamonds (conjunction search) rendered in a pseudo-3D depth field; report left/right. 3 unrecorded practice trials, then 2 blocks × 12 trials, then 6 arithmetic true/false items.</li>
          <li><strong>Factors:</strong> visual complexity (6/18/36 items), movement (static/drifting), distraction (none/2 Hz low-contrast flicker), sound (off/on). With sound on, one block is visual-only and one adds a 880 Hz tone at target onset; block order is randomised, task and instructions are identical.</li>
          <li><strong>Measures:</strong> RT from the first animation frame that draws the target (<span className="mono">performance.now</span>), correctness, timeouts (2.5 s), anticipations (&lt;150 ms, excluded from RT summaries); pre/post single-item stress (0–100); six NASA-TLX items (raw, unweighted mean).</li>
          <li><strong>Allocation:</strong> participants choose conditions, or press “Randomise”. Self-chosen conditions confound preference with outcome — only randomised allocation supports causal reading.</li></ul>
          <Note>Timing caveats: browser RT includes display latency (≈16–50 ms), input latency and audio output latency that differ across devices. Audio-visual onset synchrony is not hardware-verified. Device category is recorded for later stratification.</Note></div></section>

      <section className="block"><h3>Modules</h3>
        <div className="grid g4">{[["1 Workload & attention", "RT, accuracy, TLX vs complexity/movement/distraction."], ["2 Stress", "Pre/post stress change by condition. Self-report only."], ["3 Multisensory", "Within-session visual vs audiovisual block RT (Wilcoxon, exploratory)."], ["4 Exploratory cognitive health", "Within-person SD/slope of session RT for participants with ≥ 3 sessions. No disease detection."]].map(([t, d]) => <div className="panel" key={t}><h4>{t}</h4><p className="small">{d}</p></div>)}</div></section>

      <section className="block"><h3>NLP & RAG methodology</h3>
        <div className="panel"><ol className="clean"><li><strong>Ingest:</strong> abstracts and metadata for {corpus.data?.info.documents ?? 16} sources fetched from Europe PMC (PubMed records) and arXiv by script, using identifiers verified against those APIs.</li>
          <li><strong>Chunk:</strong> {corpus.data?.info.chunking ?? "3-sentence windows, stride 2"} with source offsets preserved.</li>
          <li><strong>Index:</strong> TF-IDF (sublinear tf, light stemming, stop-word removal) and a semantic index: <strong>{corpus.data?.info.semantic_method ?? "…"}</strong>{corpus.data && !corpus.data.info.semantic_neural && " (LSA = TF-IDF + truncated SVD; not neural)"}. Cosine similarity for both.</li>
          <li><strong>Retrieve:</strong> side-by-side comparison; for Q&A, reciprocal-rank fusion of both rankings.</li>
          <li><strong>Sufficiency gate:</strong> if no single passage covers enough of the question’s terms (or, with neural embeddings, the cosine is too low), the system answers “insufficient evidence”.</li>
          <li><strong>Answer:</strong> with a local Ollama model: a prompt restricted to numbered passages, then citation verification. Otherwise: <em>extractive</em> — the highest-scoring sentences quoted verbatim with [n] citations. Extractive ≠ generative.</li>
          <li><strong>Verify:</strong> each answer sentence must cite an existing passage and share ≥ 50% of its content stems with it. This catches fabricated citations and unsupported text; it cannot prove entailment.</li></ol>
          <p className="small">Operating mode now: <strong>{status?.mode ?? "…"}</strong>. {status?.persistence_note}</p></div></section>

      <section className="block"><h3>Evaluation methodology</h3>
        <div className="grid g2"><div className="panel"><h4>Prediction</h4><p className="small">Participant-grouped hold-out + grouped CV; majority baseline; precision/recall/F1/ROC-AUC; confusion matrix; permutation importance. Real-data evaluation is refused below 30 sessions / 10 participants / 8 per class. The shipped model is trained on <strong>synthetic</strong> data and says nothing about people.</p></div>
          <div className="panel"><h4>Retrieval & generation</h4><p className="small">16 developer-judged queries (single annotator, document-level) → P@k, R@k, MRR for each method. Answers are checked for citation existence and lexical support. Three off-topic probe questions must return “insufficient evidence” (automated test).</p></div>
          <div className="panel"><h4>Experimental statistics</h4><p className="small">Descriptive means with 95% CIs; Spearman ρ and Wilcoxon signed-rank as exploratory, uncorrected tests. Sessions from one participant are not independent. All findings are associations, not causal effects.</p></div>
          <div className="panel"><h4>Threats to validity</h4><p className="small">Self-selected participants; uncontrolled devices, screens, audio hardware and environments; single-item stress; self-report bias; small samples; practice and order effects; participant variability dominates condition effects.</p></div></div></section>

      <section className="block"><h3>Ethical safeguards</h3><div className="panel"><ul className="clean"><li>Consent required before any observation is stored (server rejects participant records without consent).</li><li>No names, emails, IPs, camera or microphone; pseudonymous random ID; coarse device class only.</li><li>Participants can export CSV and delete their data from the dashboard.</li><li>Synthetic and participant data are tagged at the record level and never pooled in analyses.</li><li>Language and RT analyses are descriptive; no diagnostic or clinical claims. A real study would need ethics-committee approval, a privacy notice and a data-protection review.</li><li>Flicker is slow, low-contrast and opt-in with a photosensitivity warning; reduced-motion preference is respected.</li></ul></div></section>

      <section className="block"><h3>Known limitations & future work</h3><div className="panel"><ul className="clean"><li>No public labelled workload dataset is integrated; supervised results use simulated data until enough real sessions exist.</li><li>Corpus is 16 abstracts, not full texts; retrieval metrics are from a tiny, single-annotator test set.</li><li>True camera/WebXR AR is not implemented — the “spatial” environment is a 2D canvas with depth cues.</li><li>Hosted mode has no durable server database (sessions stay in the browser) and no LLM.</li><li>Future: full-text open-access ingestion, multi-annotator qrels, BM25 baseline, durable hosted database, ethics-approved randomised protocol, validated stress scale (e.g. PSS-4).</li></ul></div></section>

      <section className="block"><h3>Data dictionary</h3><ErrorBox error={dict.error} />
        {dict.data && Object.entries(dict.data.tables).map(([t, rows]) => (
          <div className="panel scroll-x mt" key={t}><h4 className="mono">{t}</h4><table><thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead><tbody>{(rows as Any[]).map((r) => <tr key={r.field}><td className="mono">{r.field}</td><td className="mono small">{r.type}{r.values ? ` · ${r.values}` : ""}</td><td>{r.description}</td></tr>)}</tbody></table></div>
        ))}</section>

      <section className="block"><h3>Bibliography</h3>
        <div className="panel"><h4>Retrieval corpus (abstracts ingested)</h4><ol className="clean">{corpus.data?.documents.map((d: Any) => <li key={d.id} className="small">{d.authors} ({d.year}). {d.title} <em>{d.venue}</em>. <a href={d.url} target="_blank" rel="noreferrer">{d.pmid ? `PMID ${d.pmid}` : d.venue}</a>{d.doi && <> · <a href={`https://doi.org/${d.doi}`} target="_blank" rel="noreferrer">doi:{d.doi}</a></>}</li>)}</ol>
          <h4 className="mt">Methodological references (cited, DOI verified against Crossref, not ingested)</h4><ol className="clean">{METHOD_REFS.map((r) => <li key={r.doi} className="small">{r.c} <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">doi:{r.doi}</a></li>)}</ol></div></section>
    </div>
  );
}
