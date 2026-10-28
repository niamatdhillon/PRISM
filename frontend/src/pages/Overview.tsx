import { useEffect, useState } from "react";
import { api } from "../api";
import { store } from "../store";
import { useStatus } from "../App";
import { PrismArt, SpectralField } from "../components/HeroArt";
import { SourceBadge, Note } from "../components/ui";
import type { Any, SessionRecord } from "../types";

const MODULES = [
  { id: "workload", n: "01", t: "Cognitive workload & attention", d: "How do visual clutter, movement and distraction relate to reaction time, errors and NASA-TLX workload ratings?", preset: "workload" },
  { id: "stress", n: "02", t: "Stress responses", d: "Do sensory conditions shift self-reported stress between a pre-task and post-task rating? Self-report only — never a diagnosis.", preset: "stress" },
  { id: "multisensory", n: "03", t: "Multisensory perception", d: "Within one session: the same localisation task with a visual cue vs a visual cue plus a tone (redundant-signal comparison).", preset: "multisensory" },
  { id: "longitudinal", n: "04", t: "Exploratory cognitive health", d: "Repeat the same baseline condition across sessions to look at within-person variability. Exploratory; no disease detection.", preset: "longitudinal" },
];

export default function Overview() {
  const { status } = useStatus();
  const [recs, setRecs] = useState<SessionRecord[]>([]);
  const [an, setAn] = useState<Any>(null);
  useEffect(() => {
    if (!status) return;
    store.list(status).then(async (r) => { setRecs(r); if (r.length) setAn(await api.analytics(r)); }).catch(() => undefined);
  }, [status]);
  const p = an?.participant, s = an?.synthetic;
  return (
    <>
      <section className="hero">
        <SpectralField /><PrismArt />
        <span className="vert">Predictive Research through Interactive Sensory Mapping</span>
        <div className="wrap">
          <span className="kicker">Experimental research instrument · v0.1</span>
          <h1 className="wordmark" data-t="PRISM">PRISM</h1>
          <p className="tagline">Understand the signals. Explore the patterns. Ground the insight in evidence.</p>
          <div className="row">
            <a className="btn" href="#/lab">Enter the sensory lab →</a>
            <a className="btn ghost" href="#/nlp">Open NLP + RAG laboratory</a>
          </div>
          <p className="mono mt" style={{ maxWidth: 560 }}>Can interactions with controlled sensory environments yield useful behavioural signals for predicting task-related cognitive workload — and can NLP and retrieval-augmented generation connect participants’ reflections to scientific evidence?</p>
        </div>
      </section>

      <div className="wrap">
        <section className="block">
          <span className="kicker">Four experimental areas</span>
          <h2>One task battery, four analytic lenses</h2>
          <div className="grid g4">
            {MODULES.map((m) => (
              <article key={m.id} className="panel sweep">
                <div className="mono" style={{ color: "var(--violet)" }}>MODULE {m.n}</div>
                <h3 style={{ marginTop: 8 }}>{m.t}</h3>
                <p className="small">{m.d}</p>
                <a className="btn sm ghost" href={`#/lab?preset=${m.preset}`}>Start with this preset</a>
              </article>
            ))}
          </div>
        </section>

        <section className="block">
          <span className="kicker">Live session statistics</span>
          <h2>Computed from stored sessions</h2>
          <div className="grid g4">
            <div className="panel"><SourceBadge source="participant" /><div className="stat mt">{p?.n_completed ?? 0}</div><div className="stat-l">completed sessions · {p?.n_participants ?? 0} participants</div></div>
            <div className="panel"><SourceBadge source="synthetic" /><div className="stat mt">{s?.n_completed ?? 0}</div><div className="stat-l">synthetic demo sessions · {s?.n_participants ?? 0} synthetic participants</div></div>
            <div className="panel"><SourceBadge source="public" /><div className="stat mt">{status?.retrieval.documents ?? "–"}</div><div className="stat-l">literature documents · {status?.retrieval.chunks ?? "–"} retrievable passages</div></div>
            <div className="panel"><span className="badge b-info">Persistence</span><div className="stat mt">{status ? (status.persistence === "sqlite" ? "SQLite" : "Browser") : "–"}</div><div className="stat-l">{status?.mode === "hosted" ? "hosted: nothing is stored on the server" : "local database"}</div></div>
          </div>
          {recs.length === 0 && <Note kind="info">No sessions yet. Complete a session in the <a href="#/lab">Sensory Lab</a>, or load clearly-labelled <strong>synthetic demonstration data</strong> from the <a href="#/dashboard">Dashboard</a> to explore the analytics.</Note>}
        </section>

        <section className="block">
          <div className="grid g3">
            <div className="panel"><span className="kicker">What PRISM is</span><p>A working research prototype: a speeded-localisation task battery, NASA-TLX and stress ratings, a descriptive + exploratory statistics dashboard, a participant-grouped workload classifier, and an NLP/RAG lab over a verified literature corpus.</p></div>
            <div className="panel"><span className="kicker">What it is not</span><p>It is not a diagnostic tool and has no ethics approval. It cannot detect stress disorders or cognitive impairment. Synthetic data is never presented as human results.</p></div>
            <div className="panel"><span className="kicker">Operating mode</span><p><strong>{status?.mode === "hosted" ? "Hosted" : "Local"}</strong>. {status?.persistence_note} {status?.mode === "local" ? (status.ollama.available ? `Ollama model “${status.ollama.model}” is available for generation.` : `Ollama: ${status.ollama.reason}`) : "Generation is unavailable in hosted mode; answers are extractive."}</p></div>
          </div>
        </section>
      </div>
    </>
  );
}
