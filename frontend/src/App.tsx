import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";
import type { Status } from "./types";
import Overview from "./pages/Overview";
import Lab from "./pages/Lab";
import Dashboard from "./pages/Dashboard";
import NlpRag from "./pages/NlpRag";
import Predict from "./pages/Predict";
import Method from "./pages/Method";

export const StatusCtx = createContext<{ status: Status | null; error: string | null }>({ status: null, error: null });
export const useStatus = () => useContext(StatusCtx);

const ROUTES: { path: string; label: string; el: (q: URLSearchParams) => JSX.Element }[] = [
  { path: "", label: "Overview", el: () => <Overview /> },
  { path: "lab", label: "Sensory Lab", el: (q) => <Lab preset={q.get("preset")} /> },
  { path: "dashboard", label: "Dashboard", el: () => <Dashboard /> },
  { path: "nlp", label: "NLP + RAG", el: () => <NlpRag /> },
  { path: "predict", label: "Prediction", el: () => <Predict /> },
  { path: "method", label: "Method", el: () => <Method /> },
];

function parseHash() {
  const [p, qs] = (location.hash.replace(/^#\/?/, "")).split("?");
  return { path: p || "", q: new URLSearchParams(qs || "") };
}

export default function App() {
  const [route, setRoute] = useState(parseHash());
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const on = () => { setRoute(parseHash()); window.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => { api.status().then(setStatus).catch((e) => setError(String(e.message))); }, []);
  const cur = ROUTES.find((r) => r.path === route.path) || ROUTES[0];
  useEffect(() => { document.title = (cur.path ? cur.label + " · " : "") + "PRISM — Sensory Intelligence Lab"; }, [cur]);
  return (
    <StatusCtx.Provider value={{ status, error }}>
      <a className="skip" href="#main">Skip to content</a>
      <header className="nav">
        <div className="wrap">
          <a className="brand" href="#/" aria-label="PRISM home">PRISM</a>
          <nav className="nav-links" aria-label="Primary">
            {ROUTES.map((r) => <a key={r.path} href={"#/" + r.path} aria-current={r.path === cur.path ? "page" : undefined}>{r.label}</a>)}
          </nav>
          <span className="modepill" title={status?.persistence_note}>{status ? (status.mode === "local" ? "LOCAL MODE" : "HOSTED MODE") : error ? "API OFFLINE" : "…"}</span>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {error && <div className="wrap"><div className="err mt" role="alert">Cannot reach the PRISM API ({error}). Start it with <code>uvicorn backend.app:app --port 8000</code> (see README). Pages needing the server will show errors.</div></div>}
        {cur.el(route.q)}
      </main>
      <footer className="wrap small" style={{ padding: "28px 0 40px", borderTop: "1px solid var(--line)" }}>
        PRISM is an exploratory research prototype — not a clinically validated or diagnostic system. No medical claims are made.
        {status && <> · {status.persistence_note}</>}
      </footer>
    </StatusCtx.Provider>
  );
}
