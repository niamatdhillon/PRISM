import { useApp } from "../context";
import { useAsync } from "../components/ui";
import { api } from "../api";
import type { Any } from "../types";

export default function About() {
  const { study } = useApp();
  return (
    <div className="wrap" style={{ paddingTop: 36 }}>
      <span className="kicker">Research information</span><h2>About PRISM, consent and privacy</h2>
      <section className="block"><h3>Research questions</h3>
        <div className="panel"><ul className="clean"><li><strong>RQ1.</strong> Can behavioural signals from controlled sensory tasks (reaction time, accuracy, variability) relate to self-reported task workload?</li>
          <li><strong>RQ2.</strong> Do visual and auditory conditions relate to self-reported stress change?</li><li><strong>RQ3.</strong> Do redundant audiovisual cues change responses compared with visual cues alone?</li>
          <li><strong>RQ4.</strong> Do repeated measurements reveal stable within-person patterns (exploratory; no clinical inference)?</li><li><strong>RQ5.</strong> Can NLP and retrieval-augmented generation connect participants’ free-text reflections to published evidence, transparently?</li></ul></div></section>
      <section className="block"><h3>What you would do</h3><div className="grid g2">
        {study && Object.entries(study.protocol.tasks).map(([k, t]) => <div className="panel" key={k}><h4>{t.title}</h4><p className="small"><strong>Objective:</strong> {t.objective}</p><p className="small"><strong>Measured:</strong> {t.dependent.join(", ")}.</p></div>)}</div></section>
      <section className="block"><h3>Consent information ({study?.consent.version})</h3><div className="panel">{study?.consent.paragraphs.map((p, i) => <p key={i} className="small">{p}</p>)}
        <p className="small mono">{study?.collection_open && study.ethics ? `Ethics approval: ${study.ethics.body}, ref ${study.ethics.reference}.` : "Ethics approval is not recorded: data collection is closed."}</p></div></section>
      <section className="block"><h3>Your rights and the camera</h3><div className="grid g2">
        <div className="panel"><h4>Participant controls</h4><ul className="clean small"><li>View everything linked to your code in <a href="#/my-data">My data</a>.</li><li>Download it (JSON or CSV), delete individual sessions or all sessions.</li><li>Withdraw: deletes all your task data and reflections and disables your code.</li><li>Only a minimal consent record (code, consent version, timestamps) is kept for research governance.</li></ul></div>
        <div className="panel"><h4>Camera, sound and sensors</h4><ul className="clean small"><li>The camera starts only when you press the button and the browser asks permission; you can stop it at any time.</li><li>Video stays inside your browser. No frames are recorded, stored or uploaded.</li><li>Sound and device motion sensors are optional.</li><li>Camera access requires HTTPS (or localhost).</li></ul></div></div></section>
      <section className="block"><h3>Limitations</h3><div className="panel"><ul className="clean"><li>Self-selected participants, uncontrolled devices, screens, audio hardware and environments; browser reaction times include display and input latency.</li><li>Self-reported stress and workload are subjective; single-item stress is not a validated scale.</li><li>Results are exploratory associations, not causal effects, and not clinical findings.</li><li>The camera overlay is not spatial AR; WebXR is available only on supported browsers/devices.</li></ul></div></section>
      <Bibliography />
    </div>
  );
}

function Bibliography() {
  const { data } = useAsync<Any>(() => fetch("/api/public/literature").then((r) => r.json()).catch(() => null), []);
  void api;
  if (!data?.documents) return null;
  return (
    <section className="block"><h3>Scientific literature used for evidence retrieval ({data.documents.length} sources)</h3>
      <div className="panel"><ol className="clean">{data.documents.map((d: Any) => <li key={d.id} className="small">{d.authors} ({d.year}). {d.title} <em>{d.venue}</em>. <a href={d.url} target="_blank" rel="noreferrer">{d.pmid ? `PMID ${d.pmid}` : "arXiv"}</a>{d.doi && <> · <a href={`https://doi.org/${d.doi}`} target="_blank" rel="noreferrer">doi:{d.doi}</a></>}</li>)}</ol>
        <small>Abstracts and metadata retrieved from Europe PMC and arXiv; copyright remains with the publishers/authors.</small></div></section>
  );
}
