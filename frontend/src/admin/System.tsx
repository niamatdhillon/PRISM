import { useEffect, useState } from "react";
import { api } from "../api";
import { ErrorBox, Spinner } from "../components/ui";
import type { Any } from "../types";

export default function System() {
  const [sys, setSys] = useState<Any>(null); const [audit, setAudit] = useState<Any[]>([]); const [errs, setErrs] = useState<Any[]>([]); const [err, setErr] = useState<unknown>(null);
  useEffect(() => { Promise.all([api.admin.system(), api.admin.audit(), api.admin.errors()]).then(([s, a, e]) => { setSys(s); setAudit(a.events); setErrs(e.errors); }).catch(setErr); }, []);
  if (!sys) return <><ErrorBox error={err} /><Spinner /></>;
  return (
    <>
      <div className="grid g3">
        <div className="panel"><h4>Runtime</h4><p className="small mono">python {sys.python} · env {sys.env} · db {sys.database} · secure cookies {String(sys.cookie_secure)}</p></div>
        <div className="panel"><h4>Retrieval</h4><p className="small">{sys.retrieval.documents} docs / {sys.retrieval.chunks} passages<br />{sys.retrieval.semantic_method}<br />{sys.retrieval.vector_store}</p></div>
        <div className="panel"><h4>Ollama</h4><p className="small">{sys.ollama.available ? `ready · ${sys.ollama.model}` : `${sys.ollama.state}: ${sys.ollama.reason}`}</p></div></div>
      <h3 className="mt2">Error log ({sys.errors_logged})</h3>
      <div className="panel scroll-x">{errs.length ? <table><thead><tr><th>Time</th><th>Path</th><th>Type</th><th>Message</th></tr></thead><tbody>{errs.map((e, i) => <tr key={i}><td>{new Date(e.ts).toLocaleString()}</td><td className="mono small">{e.path}</td><td>{e.type}</td><td className="small">{e.message.slice(0, 160)}</td></tr>)}</tbody></table> : <small>No server errors recorded.</small>}</div>
      <h3 className="mt2">Audit log (latest {audit.length})</h3>
      <div className="panel scroll-x"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead><tbody>{audit.map((e, i) => <tr key={i}><td>{new Date(e.ts).toLocaleString()}</td><td className="small">{e.actor_type}{e.actor ? ` · ${e.actor}` : ""}</td><td className="mono small">{e.action}</td><td className="small">{e.target ?? ""}</td><td className="mono small">{e.detail ? JSON.stringify(e.detail).slice(0, 80) : ""}</td></tr>)}</tbody></table></div>
    </>
  );
}
