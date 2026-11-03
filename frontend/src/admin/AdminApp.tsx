import { useState } from "react";
import { api } from "../api";
import { useApp } from "../context";
import { ErrorBox } from "../components/ui";
import Dashboard from "./Dashboard";
import Participants from "./Participants";
import Datasets from "./Datasets";
import NlpRag from "./NlpRag";
import Predict from "./Predict";
import Settings from "./Settings";
import System from "./System";

const TABS = [["", "Dashboard"], ["participants", "Participants"], ["datasets", "Datasets"], ["nlp", "NLP + RAG"], ["prediction", "Prediction"], ["settings", "Study & Ollama"], ["system", "System"]] as const;

export default function AdminApp({ sub }: { sub: string }) {
  const { staff, refreshStaff } = useApp();
  if (!staff) return <Login onDone={refreshStaff} />;
  const page = sub.split("/")[0];
  return (
    <div className="wrap" style={{ paddingTop: 30 }}>
      <div className="row spread"><div><span className="kicker">Researcher area</span><h2 style={{ margin: 0 }}>Signed in as {staff.email} <span className="badge b-info">{staff.role}</span></h2></div></div>
      <nav className="subnav mt" aria-label="Researcher">{TABS.map(([p, l]) => <a key={p} href={"#/admin" + (p ? "/" + p : "")} aria-current={p === page ? "page" : undefined}>{l}</a>)}</nav>
      {page === "" && <Dashboard />}{page === "participants" && <Participants role={staff.role} />}{page === "datasets" && <Datasets role={staff.role} />}
      {page === "nlp" && <NlpRag />}{page === "prediction" && <Predict />}{page === "settings" && <Settings role={staff.role} />}{page === "system" && <System />}
    </div>
  );
}

function Login({ onDone }: { onDone: () => Promise<void> }) {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(null); try { await api.login(email, pw); await onDone(); } catch (x) { setErr(x); } finally { setBusy(false); } };
  return (
    <div className="wrap" style={{ paddingTop: 50, maxWidth: 480 }}>
      <span className="kicker">Researcher sign-in</span><h2>Sign in</h2>
      <form className="panel" onSubmit={go}>
        <label htmlFor="em">Email</label><input id="em" type="text" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="pw" className="mt">Password</label><input id="pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} style={{ width: "100%", background: "rgba(5,8,20,.7)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 13px", font: "400 1rem var(--f-body)" }} />
        <ErrorBox error={err} /><div className="mt"><button className="btn" disabled={busy || !email || !pw}>Sign in</button></div>
        <p className="small mt">Accounts are created by an administrator (<code>python -m backend.cli create-admin</code>). There is no self-registration. After 5 failed attempts an account is locked for 15 minutes.</p>
      </form>
    </div>
  );
}
