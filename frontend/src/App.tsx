import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "./api";
import { AppProvider, useApp } from "./context";
import { Spinner } from "./components/ui";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Landing from "./pages/Landing";
import About from "./pages/About";
import Research from "./pages/Research";
import MyData from "./pages/MyData";

const Lab = lazy(() => import("./lab/Lab"));
const Explore = lazy(() => import("./pages/Explore"));
const AdminApp = lazy(() => import("./admin/AdminApp"));

function parseHash() {
  const [p, qs] = location.hash.replace(/^#\/?/, "").split("?"); const path = p === "participate" ? "lab" : p;   // "participate" kept as an alias
  return { path: path || "", q: new URLSearchParams(qs || "") };
}
const PUBLIC = [{ path: "", label: "Home" }, { path: "about", label: "About" }, { path: "explore", label: "Explore" }, { path: "lab", label: "Sensory Lab" }, { path: "research", label: "Research" }];

function Shell() {
  const { staff, study, studyError, refreshStaff, ready } = useApp();
  const [route, setRoute] = useState(parseHash()); const [open, setOpen] = useState(false);
  useEffect(() => { const on = () => { setRoute(parseHash()); setOpen(false); window.scrollTo({ top: 0 }); }; window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  const isAdmin = route.path === "admin" || route.path.startsWith("admin/");
  const cur = PUBLIC.find((r) => r.path === route.path) || (route.path === "my-data" ? PUBLIC[4] : isAdmin ? null : PUBLIC[0]);
  useEffect(() => { document.title = (isAdmin ? "Researcher · " : cur?.path ? cur.label + " · " : "") + "PRISM — Cognitive Research Laboratory"; }, [cur, isAdmin]);
  const logout = async () => { await api.logout(); await refreshStaff(); location.hash = "#/"; };
  let page;
  if (isAdmin) page = <AdminApp sub={route.path.replace(/^admin\/?/, "")} />;
  else if (route.path === "lab") page = <Lab preset={route.q.get("preset")} />;
  else if (route.path === "explore") page = <Explore tab={route.q.get("tab")} />;
  else if (route.path === "my-data") page = <MyData />;
  else if (route.path === "research") page = <Research />;
  else if (route.path === "about") page = <About />;
  else page = <Landing />;
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="nav"><div className="wrap">
        <a className="brand" href="#/" aria-label="PRISM home">PRISM</a>
        <button className="btn sm ghost navtoggle" aria-expanded={open} aria-controls="primary-nav" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Menu"}</button>
        <nav id="primary-nav" className={"nav-links" + (open ? " open" : "")} aria-label="Primary">
          {PUBLIC.map((r) => <a key={r.path} href={"#/" + r.path} aria-current={!isAdmin && r.path === cur?.path ? "page" : undefined}>{r.label}</a>)}
          {staff && <a href="#/admin" aria-current={isAdmin ? "page" : undefined}>Researcher</a>}
        </nav>
        {ready && study?.collection_open && <span className="modepill" title="Research participation is open">● STUDY OPEN</span>}
        {staff && <button className="btn sm ghost" onClick={logout}>Sign out</button>}
      </div></header>
      <main id="main" tabIndex={-1}>
        {studyError && <div className="wrap"><div className="err mt" role="alert">We can’t reach the PRISM server right now. Please check your connection and reload.</div></div>}
        <ErrorBoundary resetKey={route.path}><Suspense fallback={<div className="wrap" style={{ paddingTop: 60 }}><Spinner label="Loading…" /></div>}>{page}</Suspense></ErrorBoundary>
      </main>
      <footer className="site-footer"><div className="wrap">
        <div className="row spread"><div><span className="brand" style={{ fontSize: "1.3rem" }}>PRISM</span><p className="small" style={{ margin: "6px 0 0" }}>Predictive Research through Interactive Sensory Mapping</p></div>
          <div className="foot-links"><a href="#/about">About</a><a href="#/explore">Explore</a><a href="#/lab">Sensory Lab</a><a href="#/research">Research &amp; privacy</a>{!staff && <a href="#/admin">Researcher sign-in</a>}</div></div>
        <p className="small" style={{ marginTop: 18 }}>Exploratory research platform — not a diagnostic or clinical tool. Camera and sound are optional; camera video is never recorded or uploaded.</p>
      </div></footer>
    </>
  );
}
export default function App() { return <AppProvider><Shell /></AppProvider>; }
