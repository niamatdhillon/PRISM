import { lazy, Suspense } from "react";
import { useApp } from "../context";
import { SpectralField } from "../components/HeroArt";

const PrismHero3D = lazy(() => import("../components/PrismHero3D"));
const PILLARS = [
  { n: "01", t: "Cognitive workload & attention", d: "Visual search, pattern recognition and arithmetic under controlled complexity, motion and distraction.", preset: "workload" },
  { n: "02", t: "Stress perception", d: "Pre- and post-task self-ratings alongside sensory load. Self-report only — never a diagnosis.", preset: "stress" },
  { n: "03", t: "Multisensory perception", d: "Visual versus audiovisual cues and tone detection, in 3D, camera and AR environments.", preset: "multisensory" },
  { n: "04", t: "Flexibility & repeated measures", d: "Task switching and flanker interference, repeated over days for within-person patterns.", preset: "longitudinal" },
];
const CAPS = [
  { i: "◈", t: "Immersive sensory lab", d: "A real-time 3D environment with six research tasks and precise timing.", href: "#/lab" },
  { i: "◉", t: "Camera & spatial AR", d: "Live camera inside the scene; true WebXR surface-anchored AR on supported devices.", href: "#/explore?tab=ar" },
  { i: "∿", t: "Language & evidence", d: "Text analysis and a cited, source-grounded Q&A over verified literature.", href: "#/explore?tab=ask" },
  { i: "▦", t: "Real-data modelling", d: "A subject-grouped EEG workload model built on a public PhysioNet dataset.", href: "#/explore?tab=eeg" },
];

export default function Landing() {
  const { study } = useApp();
  return (
    <>
      <section className="hero">
        <SpectralField /><Suspense fallback={null}><PrismHero3D /></Suspense>
        <span className="vert">Predictive Research through Interactive Sensory Mapping</span>
        <div className="wrap">
          <span className="kicker">Cognitive research laboratory</span>
          <h1 className="wordmark" data-t="PRISM">PRISM</h1>
          <p className="tagline">Understand the signals. Explore the patterns. Ground the insight in evidence.</p>
          <div className="row"><a className="btn" href="#/lab">Enter the Sensory Lab →</a><a className="btn ghost" href="#/explore">Explore the instruments</a></div>
          <p className="mono mt" style={{ maxWidth: 540 }}>How do controlled sensory environments shape attention, workload and stress — and how can language models and retrieval connect people’s reflections to scientific evidence?</p>
        </div>
      </section>
      <div className="wrap">
        <section className="block">
          <span className="kicker">Research pillars</span><h2>Four questions, one instrument</h2>
          <div className="grid g4">{PILLARS.map((m) => (
            <article key={m.n} className="panel sweep"><div className="mono" style={{ color: "var(--violet)" }}>{m.n}</div><h3 style={{ marginTop: 8 }}>{m.t}</h3><p className="small">{m.d}</p><a className="btn sm ghost" href={`#/lab?preset=${m.preset}`}>Try this preset</a></article>))}</div>
        </section>
        <section className="block">
          <span className="kicker">Platform</span><h2>Built for real measurement</h2>
          <div className="grid g4">{CAPS.map((c) => <a key={c.t} href={c.href} className="panel sweep cap"><div className="cap-i" aria-hidden>{c.i}</div><h3>{c.t}</h3><p className="small">{c.d}</p></a>)}</div>
        </section>
        <section className="block">
          <div className="grid g2">
            <div className="panel hero-card"><span className="kicker">Try it now</span><h3>Demo session</h3><p className="small">Run any task and see your results instantly. Demo sessions are not saved.</p><a className="btn" href="#/lab">Start a demo</a></div>
            <div className="panel hero-card"><span className="kicker">For participants</span><h3>Research participation</h3>
              <p className="small">{study?.collection_open ? `Open under ${study.ethics?.body} (ref ${study.ethics?.reference}). Pseudonymous, voluntary, and you can withdraw at any time.` : "Opens once the study’s ethics approval is confirmed. Read how your data would be protected."}</p><a className="btn ghost" href="#/research">Research &amp; privacy</a></div>
          </div>
        </section>
      </div>
    </>
  );
}
