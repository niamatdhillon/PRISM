import { useApp } from "../context";
import { PrismArt, SpectralField } from "../components/HeroArt";
import { Note } from "../components/ui";

const MODULES = [
  { n: "01", t: "Cognitive workload & attention", d: "Visual search, pattern recognition and arithmetic under controlled complexity and distraction, with NASA-TLX workload ratings.", preset: "workload" },
  { n: "02", t: "Stress perception", d: "Pre- and post-task self-reported stress alongside motion and flicker conditions. Self-report only — never a diagnosis.", preset: "stress" },
  { n: "03", t: "Multisensory perception", d: "Visual vs audiovisual cues and an auditory tone-detection task, in 3D, camera-overlay or WebXR environments.", preset: "multisensory" },
  { n: "04", t: "Cognitive flexibility & repeated measures", d: "Task-switching and flanker interference, repeated on different days to study within-person variability. Exploratory only.", preset: "longitudinal" },
];

export default function Landing() {
  const { study } = useApp();
  return (
    <>
      <section className="hero">
        <SpectralField /><PrismArt />
        <span className="vert">Predictive Research through Interactive Sensory Mapping</span>
        <div className="wrap">
          <span className="kicker">Experimental research instrument · v2</span>
          <h1 className="wordmark" data-t="PRISM">PRISM</h1>
          <p className="tagline">Understand the signals. Explore the patterns. Ground the insight in evidence.</p>
          <div className="row"><a className="btn" href="#/participate">Enter the sensory lab →</a><a className="btn ghost" href="#/about">Research &amp; privacy</a></div>
          <p className="mono mt" style={{ maxWidth: 560 }}>Can interactions with controlled sensory environments yield useful behavioural signals for task-related cognitive workload — and can NLP and retrieval-augmented generation connect participants’ reflections to scientific evidence?</p>
        </div>
      </section>
      <div className="wrap">
        {study && !study.collection_open && <section className="block"><Note kind="bad"><strong>Data collection is currently closed.</strong> PRISM only records participant data after an ethics approval is recorded by the research team. You can still try the tasks in practice mode — nothing is stored.</Note></section>}
        {study?.collection_open && study.ethics && <section className="block"><Note kind="info"><strong>Study open.</strong> Ethics approval: {study.ethics.body} · ref {study.ethics.reference}. Participation is voluntary, anonymous (pseudonymous code) and you can withdraw at any time.</Note></section>}
        <section className="block">
          <span className="kicker">Four research areas</span><h2>One task battery, four lenses</h2>
          <div className="grid g4">{MODULES.map((m) => (
            <article key={m.n} className="panel sweep"><div className="mono" style={{ color: "var(--violet)" }}>AREA {m.n}</div><h3 style={{ marginTop: 8 }}>{m.t}</h3><p className="small">{m.d}</p><a className="btn sm ghost" href={`#/participate?preset=${m.preset}`}>Try this preset</a></article>))}</div>
        </section>
        <section className="block">
          <div className="grid g3">
            <div className="panel"><span className="kicker">Immersive, with honest labels</span><p>The visual-search task runs in a 3D environment, over your live camera (a camera overlay — <strong>not</strong> spatial AR), or in a genuine WebXR AR session on supported Android Chrome devices. PRISM tells you which mode is active and never substitutes silently.</p></div>
            <div className="panel"><span className="kicker">Your data, your control</span><p>No name, email or IP address. A random participant code lets you view, download, delete your data or withdraw entirely. The camera is never recorded or uploaded.</p></div>
            <div className="panel"><span className="kicker">Not a diagnostic tool</span><p>PRISM cannot detect stress disorders, cognitive impairment or any medical condition. Findings are exploratory associations from small samples.</p></div>
          </div>
        </section>
      </div>
    </>
  );
}
