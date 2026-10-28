import { useCallback, useEffect, useRef, useState } from "react";
import { FieldEngine, SET_SIZES, Tone } from "../components/fieldEngine";
import { Note, Slider, ErrorBox, fmt } from "../components/ui";
import { participantId, resetParticipantId, store } from "../store";
import { download } from "../api";
import { useStatus } from "../App";
import type { Condition, Ratings, SessionRecord, Trial } from "../types";

type Phase = "consent" | "pre" | "setup" | "practice" | "block-intro" | "run" | "arith-intro" | "arith" | "post" | "done";
const CONSENT_VERSION = "v0.1-demo";
const N_BLOCK = 12, N_ARITH = 6, N_PRACTICE = 3, TIMEOUT = 2500;
const PRESETS: Record<string, { cx: 0 | 1 | 2; mv: boolean; ds: boolean; au: boolean; note: string }> = {
  workload: { cx: 2, mv: false, ds: true, au: false, note: "Module 1 preset: high visual complexity with distraction." },
  stress: { cx: 1, mv: true, ds: true, au: false, note: "Module 2 preset: moving items and distraction (higher sensory load)." },
  multisensory: { cx: 1, mv: false, ds: false, au: true, note: "Module 3 preset: sound on, so one block is visual-only and one audiovisual." },
  longitudinal: { cx: 1, mv: false, ds: false, au: false, note: "Module 4 preset: a fixed baseline condition. Repeat it on different days." },
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const device = (): SessionRecord["device"] => { const t = navigator.maxTouchPoints > 0, w = window.innerWidth; return t && w < 640 ? "phone" : t && w < 1100 ? "tablet" : "desktop"; };
const shuffle = <T,>(a: T[]) => (Math.random() < 0.5 ? a : [...a].reverse());
const NULL_RATINGS: Ratings = { pre_stress: null, post_stress: null, tlx_mental: null, tlx_physical: null, tlx_temporal: null, tlx_performance: null, tlx_effort: null, tlx_frustration: null };

export default function Lab({ preset }: { preset: string | null }) {
  const { status } = useStatus();
  const p0 = preset ? PRESETS[preset] : undefined;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [phase, setPhase] = useState<Phase>("consent");
  const [checks, setChecks] = useState([false, false, false]);
  const [cx, setCx] = useState<0 | 1 | 2>(p0?.cx ?? 1);
  const [mv, setMv] = useState(p0?.mv ?? false);
  const [ds, setDs] = useState(p0?.ds ?? false);
  const [au, setAu] = useState(p0?.au ?? false);
  const [ratings, setRatings] = useState<Ratings>(NULL_RATINGS);
  const [reflection, setReflection] = useState("");
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(0.3);
  const [hud, setHud] = useState({ label: "", n: 0, total: 0 });
  const [feedback, setFeedback] = useState("");
  const [arith, setArith] = useState<{ q: string } | null>(null);
  const [answerMode, setAnswerMode] = useState<"side" | "tf" | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [saved, setSaved] = useState<SessionRecord | null>(null);
  const [modsPlan, setModsPlan] = useState<("visual" | "audiovisual")[]>(["visual", "visual"]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<FieldEngine | null>(null);
  const tone = useRef(new Tone());
  const mutedRef = useRef(false);
  const trials = useRef<Trial[]>([]);
  const respond = useRef<((v: string) => void) | null>(null);
  const cont = useRef<(() => void) | null>(null);
  const runId = useRef(0);
  const started = useRef("");
  const sessionId = useRef("");

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { tone.current.volume = vol; }, [vol]);
  const showField = ["setup", "practice", "run", "block-intro", "arith-intro", "arith"].includes(phase);
  useEffect(() => {
    if (!showField || !canvasRef.current) return;
    engine.current = new FieldEngine(canvasRef.current, { complexity: cx, movement: mv, distraction: ds });
    return () => { engine.current?.destroy(); engine.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showField]);
  useEffect(() => { engine.current?.setConfig({ complexity: cx, movement: mv, distraction: ds }); }, [cx, mv, ds]);
  useEffect(() => () => { runId.current++; }, []);

  const press = useCallback((v: string) => { respond.current?.(v); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      const m: Record<string, string> = { f: "left", F: "left", ArrowLeft: "left", j: "right", J: "right", ArrowRight: "right", t: "true", T: "true", n: "false", N: "false" };
      if (m[e.key]) press(m[e.key]);
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [press]);

  const waitFor = (ms: number | null) => new Promise<{ v: string | null; t: number }>((res) => {
    const timer = ms ? setTimeout(() => { respond.current = null; res({ v: null, t: performance.now() }); }, ms) : null;
    respond.current = (v) => { if (timer) clearTimeout(timer); respond.current = null; res({ v, t: performance.now() }); };
  });
  const waitClick = () => new Promise<void>((r) => { cont.current = () => { cont.current = null; r(); }; });

  async function targetTrial(block: number, idx: number, modality: "visual" | "audiovisual", record: boolean, id: number) {
    const eng = engine.current!; setAnswerMode(null); setFeedback(""); eng.clearTarget(); eng.setFixation(true);
    await sleep(700 + Math.random() * 700); if (id !== runId.current) return;
    eng.setFixation(false);
    const side: "left" | "right" = Math.random() < 0.5 ? "left" : "right";
    const delivered: "visual" | "audiovisual" = modality === "audiovisual" && !mutedRef.current ? "audiovisual" : "visual";
    const onset = await new Promise<number>((res) => eng.showTarget(side, res));
    if (delivered === "audiovisual") tone.current.beep();
    setAnswerMode("side");
    const { v, t } = await waitFor(TIMEOUT);
    eng.clearTarget(); setAnswerMode(null); if (id !== runId.current) return;
    const rt = v ? t - onset : null;
    const correct = v === null ? null : v === side;
    const anticipatory = rt !== null && rt < 150;
    setFeedback(v === null ? "Too slow ⏱" : correct ? "Correct ✓" : "Incorrect ✗");
    if (record) trials.current.push({ idx, block, kind: "target", modality: delivered, set_size: SET_SIZES[cx], target_side: side, response: v, correct, rt_ms: rt === null ? null : Math.round(rt * 10) / 10, timeout: v === null, anticipatory });
    await sleep(450);
  }

  async function runSession() {
    const id = ++runId.current; trials.current = []; setErr(null);
    started.current = new Date().toISOString(); sessionId.current = "s-" + crypto.randomUUID().slice(0, 12);
    if (au) tone.current.ensure();
    const plan: ("visual" | "audiovisual")[] = au ? shuffle(["visual", "audiovisual"]) : ["visual", "visual"]; setModsPlan(plan);
    setPhase("practice"); setHud({ label: "Practice (not recorded)", n: 0, total: N_PRACTICE });
    await sleep(300);
    for (let i = 0; i < N_PRACTICE; i++) { setHud({ label: "Practice (not recorded)", n: i + 1, total: N_PRACTICE }); await targetTrial(0, i, "visual", false, id); if (id !== runId.current) return; }
    let idx = 0;
    for (let b = 0; b < 2; b++) {
      setPhase("block-intro"); setHud({ label: `Block ${b + 1} of 2`, n: 0, total: N_BLOCK }); await waitClick(); if (id !== runId.current) return;
      setPhase("run");
      for (let i = 0; i < N_BLOCK; i++) { setHud({ label: `Block ${b + 1} of 2 · ${plan[b] === "audiovisual" ? "visual + tone" : "visual only"}`, n: i + 1, total: N_BLOCK }); await targetTrial(b, idx++, plan[b], true, id); if (id !== runId.current) return; }
    }
    setPhase("arith-intro"); await waitClick(); if (id !== runId.current) return;
    setPhase("arith"); setAnswerMode("tf");
    for (let i = 0; i < N_ARITH; i++) {
      const a = 12 + Math.floor(Math.random() * 28), b = 6 + Math.floor(Math.random() * 18), truth = Math.random() < 0.5, shown = truth ? a + b : a + b + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3));
      setArith({ q: `${a} + ${b} = ${shown}` }); setHud({ label: "Mental arithmetic", n: i + 1, total: N_ARITH });
      const t0 = performance.now(); const { v, t } = await waitFor(9000); if (id !== runId.current) return;
      trials.current.push({ idx: idx++, block: 2, kind: "arithmetic", modality: "none", set_size: 0, target_side: null, response: v, correct: v === null ? null : (v === "true") === truth, rt_ms: v ? Math.round((t - t0) * 10) / 10 : null, timeout: v === null, anticipatory: false });
    }
    setAnswerMode(null); setArith(null); setPhase("post");
  }

  async function finish() {
    setErr(null);
    const condition: Condition = { complexity: cx, movement: mv, distraction: ds, audio_enabled: au, block_modalities: modsPlan };
    const rec: SessionRecord = { session_id: sessionId.current, participant_id: participantId(), source: "participant", consent: true, consent_version: CONSENT_VERSION,
      created_at: started.current, completed_at: new Date().toISOString(), completed: true, device: device(), condition, ratings, reflection: reflection.trim() || null, trials: trials.current };
    try { await store.save(status, rec); setSaved(rec); if (rec.reflection) sessionStorage.setItem("prism.reflection", rec.reflection); setPhase("done"); }
    catch (e) { setErr(e); setSaved(rec); }
  }

  const setR = (k: keyof Ratings) => (v: number | null) => setRatings((r) => ({ ...r, [k]: v }));
  const randomise = () => { setCx([0, 1, 2][Math.floor(Math.random() * 3)] as 0 | 1 | 2); setMv(Math.random() < 0.5); setDs(Math.random() < 0.5); };
  const steps = ["Consent", "Baseline", "Setup", "Tasks", "Reflect"];
  const stepIdx = { consent: 0, pre: 1, setup: 2, practice: 3, "block-intro": 3, run: 3, "arith-intro": 3, arith: 3, post: 4, done: 4 }[phase];
  const tlxAnswered = [ratings.tlx_mental, ratings.tlx_physical, ratings.tlx_temporal, ratings.tlx_performance, ratings.tlx_effort, ratings.tlx_frustration].filter((x) => x !== null).length;

  return (
    <div className="wrap" style={{ paddingTop: 36 }}>
      <span className="kicker">Sensory laboratory</span>
      <h2>Spatial search · workload · stress · multisensory</h2>
      <ol className="row mono" style={{ listStyle: "none", padding: 0, margin: "0 0 18px" }} aria-label="Progress">
        {steps.map((s, i) => <li key={s} className="badge" style={{ borderColor: i === stepIdx ? "var(--cyan)" : "var(--line)", color: i === stepIdx ? "var(--cyan)" : "var(--ink3)" }} aria-current={i === stepIdx ? "step" : undefined}>{i + 1}. {s}</li>)}
      </ol>
      {p0 && phase === "consent" && <Note kind="info">{p0.note}</Note>}

      {phase === "consent" && (
        <div className="panel">
          <h3>Informed consent (demonstration protocol {CONSENT_VERSION})</h3>
          <p>This is a short exploratory study (~3 minutes). You will search for a target among shapes, answer a small arithmetic task, and rate how stressed and how mentally loaded you felt. Optionally you may write a short reflection.</p>
          <ul className="clean small">
            <li><strong>Collected:</strong> a random pseudonymous ID, your responses and reaction times, ratings, coarse device type (phone/tablet/desktop), timestamps, and your optional reflection. <strong>Not collected:</strong> name, email, IP, location, camera or microphone data.</li>
            <li><strong>Storage:</strong> {status?.persistence === "sqlite" ? "in a local SQLite database on the machine running PRISM." : "only in this browser (localStorage). The hosted server does not store sessions. Clearing site data deletes them."} You can export or delete your data from the Dashboard at any time.</li>
            <li>This prototype has <strong>no ethics-committee approval</strong>; it is not a clinical test, and results say nothing about your health. Please do not write personal identifiers in the reflection.</li>
            <li><strong>Safety:</strong> the “distraction” condition shows a slow (2 Hz), low-contrast flicker. Do not take part if flickering light may trigger photosensitive symptoms. You can stop at any time by leaving the page.</li>
          </ul>
          {["I am 18 or over and I understand this is a research demonstration, not a medical or diagnostic test.", "I consent to PRISM recording the study data listed above.", "I understand I can export or delete my data and stop at any time."].map((t, i) => (
            <label key={i} className="check"><input type="checkbox" checked={checks[i]} onChange={(e) => setChecks((c) => c.map((x, j) => (j === i ? e.target.checked : x)))} />{t}</label>
          ))}
          <div className="row"><button className="btn" disabled={!checks.every(Boolean)} onClick={() => setPhase("pre")}>I consent — continue</button>
            <small>Your pseudonymous ID: <span className="mono">{participantId()}</span> · <button className="btn sm ghost" onClick={() => { resetParticipantId(); location.reload(); }}>New ID</button></small></div>
        </div>
      )}

      {phase === "pre" && (
        <div className="panel">
          <h3>Baseline</h3>
          <Slider id="pre" label="How stressed do you feel right now?" left="Not at all" right="Extremely" value={ratings.pre_stress} onChange={setR("pre_stress")} hint="Single-item self-rating (0–100). Not a clinical measure." />
          <button className="btn" onClick={() => setPhase("setup")}>Continue</button>
        </div>
      )}

      {(phase === "setup" || showField) && (
        <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
          <div className="stage">
            <div className="hud"><span>{phase === "setup" ? "PREVIEW · no target shown" : hud.label}</span><span>{hud.total ? `${hud.n}/${hud.total}` : ""}</span></div>
            <canvas ref={canvasRef} role="img" aria-label={`Spatial search field with ${SET_SIZES[cx]} items${mv ? ", drifting" : ""}${ds ? ", with flicker distraction" : ""}`} />
            {phase === "block-intro" && (
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(2,3,10,.82)", padding: 20, textAlign: "center" }}>
                <div><h3>{hud.label}</h3><p style={{ maxWidth: 480 }}>Find the <strong style={{ color: "var(--cyan)" }}>bright cyan diamond</strong> (not the violet diamonds, not circles). Tell us whether it is on the <strong>left</strong> or <strong>right</strong> half as fast and accurately as you can — buttons below, or keys <span className="mono">F</span> / <span className="mono">J</span>.
                  {modsPlan[Number(hud.label.match(/\d/)?.[0] ?? 1) - 1] === "audiovisual" && !muted ? " A short tone will play when the target appears." : ""}</p><button className="btn" onClick={() => cont.current?.()}>Begin block</button></div>
              </div>
            )}
            {phase === "arith-intro" && (
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(2,3,10,.9)", padding: 20, textAlign: "center" }}>
                <div><h3>Quick arithmetic</h3><p style={{ maxWidth: 440 }}>Six sums are shown. Say whether each is <strong>True</strong> or <strong>False</strong> (keys <span className="mono">T</span> / <span className="mono">N</span>).</p><button className="btn" onClick={() => cont.current?.()}>Start</button></div>
              </div>
            )}
            {phase === "arith" && arith && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(2,3,10,.92)" }}><div className="stat" style={{ fontSize: "clamp(2.5rem,9vw,5rem)" }} aria-live="assertive">{arith.q}</div></div>}
          </div>
          <div aria-live="polite" className="mono" style={{ minHeight: 24, textAlign: "center", color: "var(--cyan)" }}>{feedback}</div>
          {answerMode === "side" && <div className="answers"><button className="btn" onClick={() => press("left")}>◀ Left <small>(F)</small></button><button className="btn" onClick={() => press("right")}>Right ▶ <small>(J)</small></button></div>}
          {answerMode === "tf" && <div className="answers"><button className="btn" onClick={() => press("true")}>✓ True <small>(T)</small></button><button className="btn" onClick={() => press("false")}>✗ False <small>(N)</small></button></div>}
          {phase !== "setup" && hud.total > 0 && <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={hud.total} aria-valuenow={hud.n}><i style={{ width: `${(hud.n / hud.total) * 100}%` }} /></div>}
          {(au || phase === "setup") && phase !== "arith" && (
            <div className="row">
              <button className="btn sm ghost" aria-pressed={muted} onClick={() => setMuted((m) => !m)}>{muted ? "🔇 Sound muted" : "🔊 Sound on"}</button>
              <label className="small" style={{ margin: 0 }}>Volume <input type="range" min={0.05} max={0.6} step={0.05} value={vol} onChange={(e) => setVol(Number(e.target.value))} style={{ width: 120, verticalAlign: "middle" }} /></label>
              {phase === "setup" && <button className="btn sm ghost" onClick={() => tone.current.beep()}>Test tone</button>}
            </div>
          )}
        </div>
      )}

      {phase === "setup" && (
        <div className="panel mt">
          <h3>Configure the environment</h3>
          {reduce && <Note>Your system requests reduced motion. Movement and distraction are off by default; you can still enable them as experimental conditions.</Note>}
          <fieldset style={{ border: 0, padding: 0, margin: "0 0 14px" }}><legend className="mono">Visual complexity</legend>
            <div className="choice">{(["Low · 6 items", "Medium · 18", "High · 36"] as const).map((l, i) => <label key={l}><input type="radio" name="cx" checked={cx === i} onChange={() => setCx(i as 0 | 1 | 2)} /><span>{l}</span></label>)}</div></fieldset>
          <div className="row" style={{ gap: 24, marginBottom: 14 }}>
            <label className="check"><input type="checkbox" checked={mv} onChange={(e) => setMv(e.target.checked)} />Moving items</label>
            <label className="check"><input type="checkbox" checked={ds} onChange={(e) => setDs(e.target.checked)} />Distraction flicker</label>
            <label className="check"><input type="checkbox" checked={au} onChange={(e) => setAu(e.target.checked)} />Include sound (adds an audiovisual block)</label>
          </div>
          <p className="small">Everything you choose is recorded as the session’s experimental condition. Prefer unbiased allocation? <button className="btn sm ghost" onClick={randomise}>Randomise for me</button></p>
          <p className="small">Session = 3 practice trials (not recorded) → 2 blocks × {N_BLOCK} trials → {N_ARITH} arithmetic items → ratings. About 3 minutes.</p>
          <button className="btn" onClick={runSession}>Start session</button>
        </div>
      )}

      {phase === "post" && (
        <div className="panel mt">
          <h3>After the tasks</h3>
          <Slider id="post" label="How stressed do you feel right now?" left="Not at all" right="Extremely" value={ratings.post_stress} onChange={setR("post_stress")} />
          <h4 className="mt">Workload (NASA-TLX, raw/unweighted)</h4>
          <Slider id="t1" label="Mental demand" hint="How mentally demanding was the task?" left="Very low" right="Very high" value={ratings.tlx_mental} onChange={setR("tlx_mental")} />
          <Slider id="t2" label="Physical demand" hint="How physically demanding was the task?" left="Very low" right="Very high" value={ratings.tlx_physical} onChange={setR("tlx_physical")} />
          <Slider id="t3" label="Temporal demand" hint="How hurried or rushed was the pace?" left="Very low" right="Very high" value={ratings.tlx_temporal} onChange={setR("tlx_temporal")} />
          <Slider id="t4" label="Performance" hint="How successful were you in accomplishing the task?" left="Perfect" right="Failure" value={ratings.tlx_performance} onChange={setR("tlx_performance")} />
          <Slider id="t5" label="Effort" hint="How hard did you have to work?" left="Very low" right="Very high" value={ratings.tlx_effort} onChange={setR("tlx_effort")} />
          <Slider id="t6" label="Frustration" hint="How insecure, discouraged, irritated, stressed were you?" left="Very low" right="Very high" value={ratings.tlx_frustration} onChange={setR("tlx_frustration")} />
          <label htmlFor="refl">Optional reflection (2–3 sentences about what the experience was like)</label>
          <textarea id="refl" value={reflection} maxLength={4000} onChange={(e) => setReflection(e.target.value)} placeholder="e.g. The flickering made it hard to find the diamond and I felt rushed…" />
          <small>Please avoid names or personal details. The text is analysed by classical NLP in the NLP lab and is not used to infer stress or health.</small>
          {tlxAnswered < 6 && <Note>{6 - tlxAnswered} workload item(s) unanswered. The session will be saved, but its NASA-TLX score will be missing (flagged in the dashboard).</Note>}
          <ErrorBox error={err} />
          <div className="row mt"><button className="btn" onClick={finish}>Save session</button>
            {saved && err != null && <button className="btn ghost" onClick={() => download(`prism-${saved.session_id}.json`, JSON.stringify(saved, null, 1), "application/json")}>Download record (JSON)</button>}</div>
        </div>
      )}

      {phase === "done" && saved && <Done rec={saved} again={() => { setPhase("pre"); setRatings(NULL_RATINGS); setReflection(""); setSaved(null); setFeedback(""); setHud({ label: "", n: 0, total: 0 }); }} />}
    </div>
  );
}

function Done({ rec, again }: { rec: SessionRecord; again: () => void }) {
  const t = rec.trials.filter((x) => x.kind === "target");
  const ok = t.filter((x) => x.correct && !x.anticipatory && x.rt_ms !== null);
  const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const rt = mean(ok.map((x) => x.rt_ms as number));
  const r = rec.ratings; const tl = [r.tlx_mental, r.tlx_physical, r.tlx_temporal, r.tlx_performance, r.tlx_effort, r.tlx_frustration];
  const tlx = tl.some((x) => x === null) ? null : (tl as number[]).reduce((a, b) => a + b, 0) / 6;
  const byMod = (m: string) => mean(ok.filter((x) => x.modality === m).map((x) => x.rt_ms as number));
  return (
    <div className="panel">
      <h3>Session complete — thank you</h3>
      <p className="small">Saved as <span className="mono">{rec.session_id}</span> ({rec.source}). Mean RT and accuracy below are descriptive for this single session only.</p>
      <div className="grid g4">
        <div><div className="stat">{fmt(rt, 0)}</div><div className="stat-l">mean RT (ms, correct trials)</div></div>
        <div><div className="stat">{t.length ? Math.round((t.filter((x) => x.correct).length / t.length) * 100) : "—"}%</div><div className="stat-l">target accuracy</div></div>
        <div><div className="stat">{fmt(tlx, 0)}</div><div className="stat-l">raw NASA-TLX (0–100)</div></div>
        <div><div className="stat">{r.pre_stress ?? "–"}→{r.post_stress ?? "–"}</div><div className="stat-l">self-rated stress pre→post</div></div>
      </div>
      {rec.condition.audio_enabled && <p className="small mt">Visual-only block mean RT {fmt(byMod("visual"), 0)} ms · audiovisual block {fmt(byMod("audiovisual"), 0)} ms (single session — block order and practice effects are not controlled here).</p>}
      <div className="row mt">
        <a className="btn" href="#/dashboard">View dashboard</a>
        {rec.reflection && <a className="btn ghost" href="#/nlp">Analyse my reflection (NLP lab)</a>}
        <button className="btn ghost" onClick={() => download(`prism-${rec.session_id}.json`, JSON.stringify(rec, null, 1), "application/json")}>Download this session (JSON)</button>
        <button className="btn ghost" onClick={again}>Run another session</button>
      </div>
    </div>
  );
}
