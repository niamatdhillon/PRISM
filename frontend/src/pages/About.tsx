import { useApp } from "../context";

const STEPS = [
  ["Perceive", "Participants complete short sensory tasks in a controlled 3D, camera or AR environment while reaction time and accuracy are measured."],
  ["Reflect", "Self-ratings (NASA-TLX workload, stress) and an optional written reflection add the subjective side."],
  ["Interpret", "Classical NLP and retrieval over verified literature connect reflections to published evidence — with sources shown."],
  ["Predict", "Leakage-safe models are evaluated with participant-grouped splits; every result states its data and limits."],
];

export default function About() {
  const { study } = useApp();
  return (
    <div className="wrap" style={{ paddingTop: 36 }}>
      <span className="kicker">About PRISM</span><h2>An interdisciplinary research instrument</h2>
      <p style={{ maxWidth: 760 }}>PRISM — Predictive Research through Interactive Sensory Mapping — brings together human–computer interaction, cognitive psychology, natural language processing and machine learning. It studies how controlled sensory conditions relate to attention, task performance and self-reported workload and stress. It is exploratory research, not a diagnostic tool.</p>
      <section className="block"><h3>How it works</h3><div className="grid g4">{STEPS.map(([t, d], i) => <div className="panel" key={t}><div className="mono" style={{ color: "var(--violet)" }}>0{i + 1}</div><h4 style={{ marginTop: 6 }}>{t}</h4><p className="small">{d}</p></div>)}</div></section>
      <section className="block"><h3>The tasks</h3><div className="grid g3">{study && Object.entries(study.protocol.tasks).map(([k, t]) => <div className="panel" key={k}><h4>{t.title}</h4><p className="small">{t.objective}</p><p className="small mono">Measures: {t.dependent.slice(0, 3).join(" · ")}</p></div>)}</div></section>
      <section className="block"><h3>Under the hood</h3>
        <div className="panel"><div className="row">{["React · TypeScript", "Three.js · WebXR", "FastAPI · PostgreSQL", "scikit-learn", "MiniLM embeddings", "TF-IDF · VADER · NMF", "Ollama · Qwen 2.5 3B", "PhysioNet EEG"].map((x) => <span key={x} className="chip">{x}</span>)}</div>
          <p className="small mt">Every figure in the research views is computed from real data: consented PRISM sessions, a public PhysioNet EEG dataset, and peer-reviewed literature. There is no simulated data. <a href="#/research">Read the research and privacy information →</a></p></div></section>
    </div>
  );
}
