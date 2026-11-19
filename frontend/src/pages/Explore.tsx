import { lazy, Suspense, useEffect, useState } from "react";
import { demo } from "../api";
import { Ask, Retrieval, RagEvaluation, TextAnalysis } from "../components/LabPanels";
import { ErrorBox, Note, SourceTag, Spinner, Tabs, useAsync } from "../components/ui";
import { Result } from "../admin/Predict";
import type { Any } from "../types";

const ExploreAR = lazy(() => import("../components/ExploreAR"));

function EegModel() {
  const { data, error, loading } = useAsync<Any>(() => demo.eeg(), []);
  if (loading) return <Spinner label="Loading the evaluation…" />;
  if (error) return <ErrorBox error={error} />;
  const d = data.dataset;
  return (
    <>
      <div className="panel"><div className="row spread"><h3 style={{ margin: 0 }}>{d.name}</h3><SourceTag source="public" /></div>
        <p className="small mt">Real public data — <a href={d.source_url} target="_blank" rel="noreferrer">PhysioNet</a> · DOI {d.doi} · {d.licence}. {d.participants}</p>
        <p className="small"><strong>Target:</strong> {d.target}</p>
        <details><summary>Provenance, preprocessing and limitations</summary><p className="small"><strong>Recording:</strong> {d.recording}</p><p className="small"><strong>Observations:</strong> {d.observations}</p><p className="small"><strong>Suitability:</strong> {d.suitability}</p>
          <ul className="clean small">{d.limitations.map((l: string) => <li key={l}>{l}</li>)}</ul><p className="small">{d.primary_paper}</p>{data.summary && <p className="small">{data.summary.preprocessing}</p>}</details></div>
      <div className="mt"><Result r={data.result} classes={["Rest", "Task"]} allowExplain={false} /></div>
      <p className="small mt">Results come from a single subject-grouped hold-out split of the public dataset. This is separate from PRISM participant data and makes no clinical claim.</p>
    </>
  );
}

export default function Explore({ tab: initial }: { tab: string | null }) {
  const [tab, setTab] = useState(initial || "ar");
  useEffect(() => { if (initial) setTab(initial); }, [initial]);
  return (
    <div className="wrap" style={{ paddingTop: 36 }}>
      <span className="kicker">Explore</span><h2>Try PRISM’s instruments</h2>
      <p className="small" style={{ maxWidth: 720 }}>Everything here runs on public literature and public data, or on text you type. Nothing you do on this page is saved.</p>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "ar", label: "Hologram · 3D & AR" }, { id: "nlp", label: "Text analysis" }, { id: "retrieve", label: "Keyword vs semantic" }, { id: "ask", label: "Evidence Q&A" }, { id: "eeg", label: "EEG model" }, { id: "eval", label: "Retrieval quality" }]} />
      {tab === "ar" && <Suspense fallback={<Spinner label="Loading the 3D environment…" />}><ExploreAR /></Suspense>}
      {tab === "nlp" && <TextAnalysis scope="demo" />}{tab === "retrieve" && <Retrieval scope="demo" />}{tab === "ask" && <Ask scope="demo" />}{tab === "eeg" && <EegModel />}{tab === "eval" && <RagEvaluation scope="demo" />}
      {tab === "ask" && <Note kind="info">Answers are grounded in a small corpus of 26 verified scientific abstracts and show their sources. If the evidence isn’t there, PRISM says so.</Note>}
    </div>
  );
}
