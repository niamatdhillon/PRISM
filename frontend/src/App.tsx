import { useEffect, useState } from "react";
import { api } from "./api";
import { AppProvider, useApp } from "./context";
import Landing from "./pages/Landing";
import About from "./pages/About";
import MyData from "./pages/MyData";
import Lab from "./lab/Lab";
import AdminApp from "./admin/AdminApp";

function parseHash() { const [p, qs] = location.hash.replace(/^#\/?/, "").split("?"); return { path: p || "", q: new URLSearchParams(qs || "") }; }

const PUBLIC = [{ path: "", label: "Overview" }, { path: "participate", label: "Participate" }, { path: "my-data", label: "My data" }, { path: "about", label: "Research & privacy" }];

function Shell() {
  const { staff, study, studyError, refreshStaff, ready } = useApp();
  const [route, setRoute] = useState(parseHash()); const [open, setOpen] = useState(false);
  useEffect(() => { const on = () => { setRoute(parseHash()); setOpen(false); window.scrollTo({ top: 0 }); }; window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  const isAdmin = route.path === "admin" || route.path.startsWith("admin/");
  const cur = PUBLIC.find((r) => r.path === route.path) || (isAdmin ? null : PUBLIC[0]);
  useEffect(() => { document.title = (isAdmin ? "Researcher · " : cur?.path ? cur.label + " · " : "") + "PRISM — Sensory Intelligence Lab"; }, [cur, isAdmin]);
  const logout = async () => { await api.logout(); await refreshStaff(); location.hash = "#/"; };
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="nav"><div className="wrap">
        <a className="brand" href="#/" aria-label="PRISM home">PRISM</a>
        <button className="btn sm ghost navtoggle" aria-expanded={open} aria-controls="primary-nav" onClick={() => setOpen((o) => !o)}>Menu</button>
        <nav id="primary-nav" className={"nav-links" + (open ? " open" : "")} aria-label="Primary">
          {PUBLIC.map((r) => <a key={r.path} href={"#/" + r.path} aria-current={!isAdmin && r.path === cur?.path ? "page" : undefined}>{r.label}</a>)}
          {staff && <a href="#/admin" aria-current={isAdmin ? "page" : undefined}>Researcher</a>}
        </nav>
        <span className={"modepill"} title={study?.collection_open ? "Ethics approval recorded" : "Data collection is closed"}>{!ready ? "…" : studyError ? "API OFFLINE" : study?.collection_open ? "STUDY OPEN" : "STUDY CLOSED"}</span>
        {staff && <button className="btn sm ghost" onClick={logout}>Sign out</button>}
      </div></header>
      <main id="main" tabIndex={-1}>
        {studyError && <div className="wrap"><div className="err mt" role="alert">Cannot reach the PRISM API ({studyError}). Start the backend (see README) and reload.</div></div>}
        {isAdmin ? <AdminApp sub={route.path.replace(/^admin\/?/, "")} /> : route.path === "participate" ? <Lab preset={route.q.get("preset")} /> : route.path === "my-data" ? <MyData /> : route.path === "about" ? <About /> : <Landing />}
      </main>
      <footer className="wrap small" style={{ padding: "28px 0 40px", borderTop: "1px solid var(--line)" }}>
        PRISM is an exploratory research platform — not a clinically validated or diagnostic system. {!staff && <><a href="#/admin">Researcher sign-in</a> · </>}Camera and sound are optional; no camera images are recorded or uploaded.
      </footer>
    </>
  );
}
export default function App() { return <AppProvider><Shell /></AppProvider>; }
