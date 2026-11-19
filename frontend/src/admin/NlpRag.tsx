import { useState } from "react";
import { api } from "../api";
import { Ask, RagEvaluation, Retrieval, TextAnalysis } from "../components/LabPanels";
import { ErrorBox, Note, SourceTag, Spinner, Tabs, useAsync } from "../components/ui";
import type { Any } from "../types";

function Themes() {
  const { data, error, loading } = useAsync<Any>(() => api.admin.themes(), []);
  return <><SourceTag source="prism" /><ErrorBox error={error} />{loading && <Spinner />}{data && (data.status === "ok" ? <div className="panel mt"><p className="small">{data.n_documents} participant reflections · NMF topics over TF-IDF</p>{data.topics.map((t: Any) => <p key={t.topic}><strong>Topic {t.topic}:</strong> {t.top_terms.join(", ")}</p>)}<small>{data.note}</small></div> : <Note kind="bad"><span className="badge b-bad">INSUFFICIENT DATA</span><p style={{ marginTop: 8 }}>{data.message}</p></Note>)}</>;
}

export default function NlpRag() {
  const [tab, setTab] = useState("reflect");
  return (
    <>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "reflect", label: "Text analysis" }, { id: "themes", label: "Reflection themes" }, { id: "retrieve", label: "Keyword vs semantic" }, { id: "ask", label: "Evidence-grounded Q&A" }, { id: "eval", label: "Evaluation & corpus" }]} />
      {tab === "reflect" && <TextAnalysis scope="admin" />}{tab === "themes" && <Themes />}{tab === "retrieve" && <Retrieval scope="admin" />}{tab === "ask" && <Ask scope="admin" />}{tab === "eval" && <RagEvaluation scope="admin" />}
    </>
  );
}
