import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { ErrorBox, Note, SourceTag, Spinner } from "../components/ui";
import type { Any } from "../types";

export default function Datasets({ role }: { role: string }) {
  const [d, setD] = useState<Any>(null); const [err, setErr] = useState<unknown>(null); const [job, setJob] = useState<Any>(null);
  const load = useCallback(() => api.admin.datasets().then(setD).catch(setErr), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!job?.running) return; const t = setInterval(async () => { const s = await api.admin.ingestStatus(); setJob(s); if (!s.running) { clearInterval(t); void load(); } }, 2000); return () => clearInterval(t); }, [job, load]);
  const ingest = async () => { setErr(null); try { await api.admin.ingest(); setJob({ running: true }); } catch (e) { setErr(e); } };
  if (!d) return <><ErrorBox error={err} /><Spinner /></>;
  return (
    <>
      <Note kind="info">Three data sources are kept strictly separate: <strong>PRISM participant observations</strong> (Dashboard), <strong>public datasets</strong> (this page; never merged with PRISM data) and <strong>literature</strong> (RAG only). {d.prism_own_data}</Note>
      <ErrorBox error={err} />
      {d.ingested.map((x: Any) => (
        <div className="panel" key={x.slug}><div className="row spread"><h3 style={{ margin: 0 }}>{x.name}</h3><SourceTag source="public" /></div>
          <div className="scroll-x"><table><tbody>
            <tr><td>Source</td><td><a href={x.meta.source_url} target="_blank" rel="noreferrer">{x.meta.source_url}</a> · DOI {x.meta.doi}</td></tr><tr><td>Publisher</td><td>{x.meta.publisher}</td></tr>
            <tr><td>Licence</td><td>{x.meta.licence}</td></tr><tr><td>Paper</td><td>{x.meta.primary_paper}</td></tr><tr><td>Participants</td><td>{x.meta.participants}</td></tr><tr><td>Recording</td><td>{x.meta.recording}</td></tr>
            <tr><td>Observations</td><td>{x.meta.observations}</td></tr><tr><td>Features available</td><td>{x.meta.available_features}</td></tr><tr><td>Missing values</td><td>{x.meta.missing_values}</td></tr><tr><td>Target</td><td>{x.meta.target}</td></tr><tr><td>Suitability</td><td>{x.meta.suitability}</td></tr>
            <tr><td>Limitations</td><td><ul className="clean">{x.meta.limitations.map((l: string) => <li key={l}>{l}</li>)}</ul></td></tr></tbody></table></div>
          <p className="mono small">Status: <strong>{x.status}</strong>{x.ingested_at ? ` · ingested ${new Date(x.ingested_at).toLocaleString()}` : ""} · local archive {x.archive_present ? "present" : "NOT present (download it first — see docs/DATASETS.md)"}</p>
          {x.summary && <div className="note info"><strong>Ingestion summary (computed from the files):</strong> {x.summary.n_subjects} subjects · {x.summary.n_recordings} recordings · {x.summary.n_epochs} epochs ({JSON.stringify(x.summary.class_counts)}) · checksums {x.summary.checksums.checked ? `${x.summary.checksums.files_ok} OK / ${x.summary.checksums.files_mismatch} mismatched` : "not checked"} · NaN cells {x.summary.missing_values.nan_cells}/{x.summary.missing_values.total_cells}<br /><small>{x.summary.preprocessing}</small></div>}
          {role === "admin" ? <button className="btn" disabled={!x.archive_present || job?.running} onClick={ingest}>{job?.running ? "Ingesting…" : x.status === "ingested" ? "Re-ingest" : "Ingest dataset"}</button> : <small>Ingestion is admin-only.</small>}{job?.error && <ErrorBox error={job.error} />}
        </div>))}
      <h3 className="mt2">Reviewed but not used</h3>
      <div className="scroll-x panel"><table><thead><tr><th>Dataset</th><th>Licence</th><th>Size</th><th>Why not used</th></tr></thead><tbody>{d.reviewed_not_used.map((r: Any) => <tr key={r.url}><td><a href={r.url} target="_blank" rel="noreferrer">{r.name}</a></td><td>{r.licence}</td><td>{r.size}</td><td>{r.reason}</td></tr>)}</tbody></table>
        <small>Only catalogue metadata (Zenodo API) was reviewed for these; their contents were not verified.</small></div>
    </>
  );
}
