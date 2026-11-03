import { useEffect, useMemo, useRef, useState } from "react";
import { api, download } from "../api";
import { useApp } from "../context";
import { Tone } from "../components/fieldEngine";
import { ErrorBox, Note, Slider } from "../components/ui";
import { ChoiceTask, TrialSpec } from "../tasks/ChoiceTask";
import { Oddball } from "../tasks/Oddball";
import { arithmeticItems, flankerTrials, patternItems, switchingTrials } from "../tasks/generators";
import { VisualSearchTask, VSResult } from "./VisualSearchTask";
import { Capabilities, deviceCategory, detectCapabilities } from "../spatial/capabilities";
import type { DisplayMode, Ratings, SessionPayload, TaskId, Trial } from "../types";

type Phase = "consent" | "pre" | "setup" | "intro" | "task" | "post" | "done";
const NULL_R: Ratings = { pre_stress: null, post_stress: null, perceived_difficulty: null, tlx_mental: null, tlx_physical: null, tlx_temporal: null, tlx_performance: null, tlx_effort: null, tlx_frustration: null };
const PRESETS: Record<string, { cx: 0 | 1 | 2; mv: boolean; ds: boolean; audio: boolean; tasks: TaskId[]; note: string }> = {
  workload: { cx: 2, mv: false, ds: true, audio: false, tasks: ["visual_search", "arithmetic", "pattern"], note: "Workload preset: high complexity + distraction, with arithmetic and pattern tasks." },
  stress: { cx: 1, mv: true, ds: true, audio: false, tasks: ["visual_search", "flanker"], note: "Stress-perception preset: motion + distraction." },
  multisensory: { cx: 1, mv: false, ds: false, audio: true, tasks: ["visual_search", "auditory_oddball"], note: "Multisensory preset: sound on (audiovisual block + tone detection)." },
  longitudinal: { cx: 1, mv: false, ds: false, audio: false, tasks: ["visual_search", "task_switching", "flanker"], note: "Repeat-measures preset: fixed baseline condition; repeat on different days." },
};
const ORDER: TaskId[] = ["visual_search", "auditory_oddball", "task_switching", "flanker", "pattern", "arithmetic"];

export default function Lab({ preset }: { preset: string | null }) {
  const { study, me, refreshMe } = useApp();
  const p0 = preset ? PRESETS[preset] : undefined;
  const open = !!study?.collection_open;
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [phase, setPhase] = useState<Phase>("consent");
  const [checks, setChecks] = useState([false, false, false]); const [enrolled, setEnrolled] = useState<{ code: string; recovery_code: string } | null>(null);
  const [cx, setCx] = useState<0 | 1 | 2>(p0?.cx ?? 1); const [mv, setMv] = useState(p0?.mv ?? false); const [ds, setDs] = useState(p0?.ds ?? false); const [bright, setBright] = useState(1);
  const [audio, setAudio] = useState(p0?.audio ?? false); const [mode, setMode] = useState<DisplayMode>("scene3d"); const [tasks, setTasks] = useState<TaskId[]>(p0?.tasks ?? ["visual_search", "arithmetic"]);
  const [ratings, setRatings] = useState<Ratings>(NULL_R); const [reflection, setReflection] = useState(""); const [err, setErr] = useState<unknown>(null); const [taskPos, setTaskPos] = useState(0);
  const [saved, setSaved] = useState<SessionPayload | null>(null); const [saving, setSaving] = useState(false); const [practiceOnly, setPracticeOnly] = useState(false);
  const tone = useRef(new Tone()); const trials = useRef<Trial[]>([]); const vs = useRef<VSResult | null>(null); const started = useRef(""); const sid = useRef("");
  const [cameraLive, setCameraLive] = useState(false);

  useEffect(() => { detectCapabilities().then((c) => { setCaps(c); setMode(c.webgl ? "scene3d" : "canvas2d"); }); }, []);
  useEffect(() => { if (study && !open) { setPracticeOnly(true); } }, [study, open]);
  useEffect(() => { if (me && !enrolled && phase === "consent") setPhase("pre"); }, [me, enrolled, phase]);  // returning participants skip consent; new ones see their recovery code first
  useEffect(() => { if (study && !open && phase === "consent") setPhase("pre"); }, [study, open, phase]);

  const ordered = useMemo(() => ORDER.filter((t) => tasks.includes(t)), [tasks]);
  const cur = ordered[taskPos];
  const spec = cur ? study?.protocol.tasks[cur] : undefined;
  const cond = { complexity: cx, movement: mv, distraction: ds, brightness: bright };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const enroll = async () => { setErr(null); try { const r = await api.enroll(study!.consent.version); setEnrolled(r); await refreshMe(); } catch (e) { setErr(e); } };
  const toggleTask = (t: TaskId) => setTasks((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));
  const startSession = () => { trials.current = []; vs.current = null; started.current = new Date().toISOString(); sid.current = "s-" + crypto.randomUUID().replace(/-/g, "").slice(0, 16); setTaskPos(0); setPhase("intro"); };
  const finishTask = (t: Trial[]) => { trials.current.push(...t); if (taskPos + 1 < ordered.length) { setTaskPos(taskPos + 1); setPhase("intro"); } else setPhase("post"); };

  const build = (): SessionPayload => {
    const r = vs.current;
    return { session_id: sid.current, protocol_version: study!.protocol.version, started_at: started.current, completed_at: new Date().toISOString(), completed: true, device: deviceCategory(),
      display_mode: r?.displayMode ?? (mode === "webxr" || mode === "camera_overlay" ? "scene3d" : mode), camera_used: r?.cameraUsed ?? false, audio_enabled: audio, condition: { ...cond, complexity: cx, block_modalities: r?.blockModalities ?? ["visual", "visual"] },
      tasks_completed: ordered, ratings, timing: { median_frame_ms: r?.medianFrameMs ?? null, viewport: `${innerWidth}x${innerHeight}` }, reflection: reflection.trim() || null,
      trials: trials.current.map((t, i) => ({ ...t, idx: i })) };
  };
  const finish = async () => {
    setErr(null); setSaving(true); const payload = build();
    try { if (!practiceOnly) { await api.submitSession(payload); await refreshMe(); } setSaved(payload); if (payload.reflection) sessionStorage.setItem("prism.reflection", payload.reflection); setPhase("done"); }
    catch (e) { setErr(e); setSaved(payload); } finally { setSaving(false); }
  };
  const setR = (k: keyof Ratings) => (v: number | null) => setRatings((r) => ({ ...r, [k]: v }));
  const tlxN = ["tlx_mental", "tlx_physical", "tlx_temporal", "tlx_performance", "tlx_effort", "tlx_frustration"].filter((k) => ratings[k as keyof Ratings] !== null).length;
  const steps = ["Consent", "Baseline", "Setup", "Tasks", "Reflect"]; const si = { consent: 0, pre: 1, setup: 2, intro: 3, task: 3, post: 4, done: 4 }[phase];

  if (!study) return <div className="wrap" style={{ paddingTop: 40 }}><p>Loading study information…</p></div>;
  return (
    <div className="wrap" style={{ paddingTop: 36 }}>
      <span className="kicker">Sensory laboratory</span><h2>Participate in a PRISM session</h2>
      <ol className="row mono" style={{ listStyle: "none", padding: 0, margin: "0 0 18px" }} aria-label="Progress">{steps.map((s, i) => <li key={s} className="badge" style={{ borderColor: i === si ? "var(--cyan)" : "var(--line)", color: i === si ? "var(--cyan)" : "var(--ink3)" }} aria-current={i === si ? "step" : undefined}>{i + 1}. {s}</li>)}</ol>
      {practiceOnly && <Note kind="bad"><strong>Practice mode — nothing is stored.</strong> Data collection is closed because no ethics approval is recorded for this study. You can try the tasks; no data is sent or saved.</Note>}
      {p0 && phase === "consent" && <Note kind="info">{p0.note}</Note>}
      <ErrorBox error={err} />

      {phase === "consent" && open && !me && (
        <div className="panel"><h3>Informed consent ({study.consent.version})</h3>
          <p className="small mono">Ethics approval: {study.ethics?.body} · ref {study.ethics?.reference}{study.ethics?.approved_on ? ` · ${study.ethics.approved_on}` : ""}</p>
          {study.consent.paragraphs.map((p, i) => <p key={i} className="small">{p}</p>)}
          {["I am 18 or over and I understand this is a research study, not a medical or diagnostic test.", "I consent to PRISM recording the study data described above.", "I understand I can view, download and delete my data, withdraw, and stop at any time."].map((t, i) => (
            <label key={i} className="check"><input type="checkbox" checked={checks[i]} onChange={(e) => setChecks((c) => c.map((x, j) => (j === i ? e.target.checked : x)))} />{t}</label>))}
          {!enrolled ? <button className="btn" disabled={!checks.every(Boolean)} onClick={enroll}>I consent — create my participant code</button> : (
            <div className="note info"><p>Your participant code: <strong className="mono">{enrolled.code}</strong></p>
              <p className="small">Recovery code (shown once; lets you access your data from another device):</p><p className="mono" style={{ wordBreak: "break-all" }}>{enrolled.recovery_code}</p>
              <div className="row"><button className="btn sm ghost" onClick={() => navigator.clipboard?.writeText(enrolled.recovery_code)}>Copy recovery code</button><button className="btn" onClick={() => setPhase("pre")}>Continue</button></div></div>)}
        </div>)}

      {phase === "pre" && <div className="panel"><h3>Baseline</h3>
        <Slider id="pre" label="How stressed do you feel right now?" left="Not at all" right="Extremely" value={ratings.pre_stress} onChange={setR("pre_stress")} hint="Single-item self-rating (0–100). Not a clinical measure." />
        <button className="btn" onClick={() => setPhase("setup")}>Continue</button></div>}

      {phase === "setup" && caps && (
        <div className="panel"><h3>Choose tasks and environment</h3>
          <fieldset style={{ border: 0, padding: 0 }}><legend className="mono">Tasks (at least one)</legend>
            {ORDER.map((t) => { const s = study.protocol.tasks[t]; const blocked = t === "auditory_oddball" && !caps.audio; return (
              <label key={t} className="check"><input type="checkbox" checked={tasks.includes(t)} disabled={blocked} onChange={() => toggleTask(t)} /><span><strong>{s.title}</strong> <small>({s.trials} trials) — {s.objective}</small>{blocked && <small> Audio is unavailable on this device.</small>}</span></label>); })}</fieldset>
          {tasks.includes("visual_search") && <>
            <fieldset style={{ border: 0, padding: 0, margin: "14px 0" }}><legend className="mono">Visual-search display mode</legend>
              <div className="choice">{([["scene3d", "3D environment", caps.webgl, "needs WebGL"], ["camera_overlay", "Camera overlay (not spatial AR)", caps.camera && caps.webgl, caps.secureContext ? "needs a camera + WebGL" : "needs HTTPS"], ["webxr", "WebXR AR", caps.webxrAr && caps.webgl, "needs a WebXR immersive-ar browser/device (e.g. Chrome on supported Android)"], ["canvas2d", "2D canvas (basic)", true, ""]] as const).map(([v, l, ok, why]) => (
                <label key={v} title={ok ? "" : why}><input type="radio" name="mode" disabled={!ok} checked={mode === v} onChange={() => setMode(v)} /><span>{l}{ok ? "" : " — unavailable"}</span></label>))}</div>
              <small>Detected: WebGL {caps.webgl ? "yes" : "no"} · camera API {caps.camera ? "yes" : caps.secureContext ? "no" : "needs HTTPS"} · WebXR AR {caps.webxrAr ? "yes" : "no"} · audio {caps.audio ? "yes" : "no"} · motion sensors {caps.deviceOrientation ? "yes" : "no"}. Unsupported modes are disabled; nothing falls back silently.</small></fieldset>
            <fieldset style={{ border: 0, padding: 0, margin: "0 0 14px" }}><legend className="mono">Visual complexity</legend>
              <div className="choice">{["Low · 6 items", "Medium · 18", "High · 36"].map((l, i) => <label key={l}><input type="radio" name="cx" checked={cx === i} onChange={() => setCx(i as 0 | 1 | 2)} /><span>{l}</span></label>)}</div></fieldset>
            <div className="row" style={{ gap: 24 }}>
              <label className="check"><input type="checkbox" checked={mv} onChange={(e) => setMv(e.target.checked)} />Moving items</label>
              <label className="check"><input type="checkbox" checked={ds} onChange={(e) => setDs(e.target.checked)} />Distraction flicker (2 Hz, low contrast)</label>
              <label className="check"><input type="checkbox" checked={audio} disabled={!caps.audio} onChange={(e) => setAudio(e.target.checked)} />Sound (adds an audiovisual block)</label></div>
            <label htmlFor="br">Stimulus brightness: <span className="mono">{Math.round(bright * 100)}%</span></label><input id="br" type="range" min={0.2} max={1} step={0.05} value={bright} onChange={(e) => setBright(Number(e.target.value))} />
            {reduce && <Note>Your system requests reduced motion. Movement and flicker are optional conditions; leave them off if you prefer.</Note>}
            <p className="small">Everything you choose is recorded as the experimental condition. <button className="btn sm ghost" onClick={() => { setCx([0, 1, 2][Math.floor(Math.random() * 3)] as 0 | 1 | 2); setMv(Math.random() < 0.5 && !reduce); setDs(Math.random() < 0.5 && !reduce); }}>Randomise condition</button> (random allocation supports causal comparison; self-chosen does not).</p></>}
          <button className="btn" disabled={!tasks.length} onClick={startSession}>Start session</button></div>)}

      {phase === "intro" && spec && cur && (
        <div className="panel"><span className="kicker">Task {taskPos + 1} of {ordered.length}</span><h3>{spec.title}</h3>
          <p><strong>Objective:</strong> {spec.objective}</p><p><strong>Procedure:</strong> {spec.procedure}</p><p className="small"><strong>What is measured:</strong> {spec.dependent.join(", ")}. {spec.measures}</p>
          <button className="btn" onClick={() => { if (cur === "auditory_oddball") tone.current.ensure(); setPhase("task"); }}>Start task</button></div>)}

      {phase === "task" && cur === "visual_search" && caps && <VisualSearchTask requestedMode={mode} caps={caps} cond={cond} audioOn={audio} tone={tone.current} startIdx={0} onCameraStateChange={setCameraLive}
        onFinish={(r) => { vs.current = r; finishTask(r.trials); }} />}
      {phase === "task" && cur === "auditory_oddball" && <Oddball tone={tone.current} onFinish={finishTask} />}
      {phase === "task" && cur === "flanker" && <FlankerRun onFinish={finishTask} />}
      {phase === "task" && cur === "task_switching" && <SwitchRun onFinish={finishTask} />}
      {phase === "task" && cur === "pattern" && <PatternRun onFinish={finishTask} />}
      {phase === "task" && cur === "arithmetic" && <ArithRun onFinish={finishTask} />}
      {cameraLive && <p className="small mt">● Camera is live and is not being recorded. It stops automatically when the task ends.</p>}

      {phase === "post" && (
        <div className="panel"><h3>After the tasks</h3>
          <Slider id="post" label="How stressed do you feel right now?" left="Not at all" right="Extremely" value={ratings.post_stress} onChange={setR("post_stress")} />
          <Slider id="diff" label="Overall, how difficult was the session?" left="Very easy" right="Very difficult" value={ratings.perceived_difficulty} onChange={setR("perceived_difficulty")} />
          <h4 className="mt">Workload (NASA-TLX, raw/unweighted)</h4>
          <Slider id="t1" label="Mental demand" hint="How mentally demanding was the task?" left="Very low" right="Very high" value={ratings.tlx_mental} onChange={setR("tlx_mental")} />
          <Slider id="t2" label="Physical demand" hint="How physically demanding was the task?" left="Very low" right="Very high" value={ratings.tlx_physical} onChange={setR("tlx_physical")} />
          <Slider id="t3" label="Temporal demand" hint="How hurried or rushed was the pace?" left="Very low" right="Very high" value={ratings.tlx_temporal} onChange={setR("tlx_temporal")} />
          <Slider id="t4" label="Performance" hint="How successful were you in accomplishing the task?" left="Perfect" right="Failure" value={ratings.tlx_performance} onChange={setR("tlx_performance")} />
          <Slider id="t5" label="Effort" hint="How hard did you have to work?" left="Very low" right="Very high" value={ratings.tlx_effort} onChange={setR("tlx_effort")} />
          <Slider id="t6" label="Frustration" hint="How insecure, discouraged, irritated, stressed were you?" left="Very low" right="Very high" value={ratings.tlx_frustration} onChange={setR("tlx_frustration")} />
          <label htmlFor="refl">Optional reflection (2–3 sentences about what the experience was like)</label>
          <textarea id="refl" value={reflection} maxLength={4000} onChange={(e) => setReflection(e.target.value)} />
          <small>Please avoid names or personal details. Reflections are described with text statistics only; they are never used to infer stress or health.</small>
          {tlxN < 6 && <Note>{6 - tlxN} workload item(s) unanswered; the TLX score will be missing for this session (flagged in analyses).</Note>}
          <div className="row mt"><button className="btn" disabled={saving} onClick={finish}>{practiceOnly ? "Finish (not stored)" : "Save session"}</button>
            {saved && !!err && <button className="btn ghost" onClick={() => download(`prism-${saved.session_id}.json`, JSON.stringify(saved, null, 1), "application/json")}>Download record (JSON)</button>}</div></div>)}

      {phase === "done" && saved && <Done rec={saved} stored={!practiceOnly} again={() => { setPhase("pre"); setRatings(NULL_R); setReflection(""); setSaved(null); setTaskPos(0); }} />}
    </div>
  );
}

function FlankerRun({ onFinish }: { onFinish: (t: Trial[]) => void }) {
  const mk = (s: ReturnType<typeof flankerTrials>[number]): TrialSpec => ({ trial_type: s.trial_type, stimulus: s.stimulus, render: <div className="big">{s.stimulus}</div>, choices: [{ value: "left", label: "◀ Left", key: "f" }, { value: "right", label: "Right ▶", key: "j" }], correct: s.center });
  const [p] = useState(() => flankerTrials(4).map(mk)); const [t] = useState(() => flankerTrials(32).map(mk));
  return <ChoiceTask task="flanker" practice={p} trials={t} timeoutMs={2000} onFinish={onFinish} />;
}
function SwitchRun({ onFinish }: { onFinish: (t: Trial[]) => void }) {
  const mk = (s: ReturnType<typeof switchingTrials>[number]): TrialSpec => ({ trial_type: s.trial_type, stimulus: s.stimulus, cue: <div className="cue">{s.rule.toUpperCase()}</div>, correct: s.correct,
    render: <div className={`shape ${s.shape} ${s.colour}`} role="img" aria-label={`${s.colour} ${s.shape}`} />,
    choices: s.rule === "colour" ? [{ value: "cyan", label: "Cyan", key: "f" }, { value: "violet", label: "Violet", key: "j" }] : [{ value: "circle", label: "Circle", key: "f" }, { value: "diamond", label: "Diamond", key: "j" }] });
  const [p] = useState(() => switchingTrials(4).map(mk)); const [t] = useState(() => switchingTrials(32).map(mk));
  return <ChoiceTask task="task_switching" practice={p} trials={t} cueMs={700} timeoutMs={3000} onFinish={onFinish} />;
}
function PatternRun({ onFinish }: { onFinish: (t: Trial[]) => void }) {
  const mk = (s: ReturnType<typeof patternItems>[number]): TrialSpec => ({ trial_type: s.trial_type, stimulus: s.stimulus, render: <div className="big">{s.seq.join("  ")}  ?</div>, correct: String(s.answer), choices: s.options.map((o) => ({ value: String(o), label: String(o) })) });
  const [p] = useState(() => patternItems(2).map(mk)); const [t] = useState(() => patternItems(8).map(mk));
  return <ChoiceTask task="pattern" practice={p} trials={t} timeoutMs={15000} onFinish={onFinish} />;
}
function ArithRun({ onFinish }: { onFinish: (t: Trial[]) => void }) {
  const mk = (s: ReturnType<typeof arithmeticItems>[number]): TrialSpec => ({ trial_type: null, stimulus: s.q, render: <div className="big">{s.q}</div>, correct: s.truth ? "true" : "false", choices: [{ value: "true", label: "✓ True", key: "t" }, { value: "false", label: "✗ False", key: "n" }] });
  const [t] = useState(() => arithmeticItems(6).map(mk));
  return <ChoiceTask task="arithmetic" practice={[]} trials={t} timeoutMs={9000} onFinish={onFinish} />;
}

function Done({ rec, stored, again }: { rec: SessionPayload; stored: boolean; again: () => void }) {
  const t = rec.trials; const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const per = rec.tasks_completed.map((k) => { const x = t.filter((y) => y.task === k); const ok = x.filter((y) => y.correct && y.rt_ms !== null && !y.anticipatory); return { k, n: x.length, acc: x.length ? Math.round((x.filter((y) => y.correct).length / x.length) * 100) : null, rt: mean(ok.map((y) => y.rt_ms as number)) }; });
  return (
    <div className="panel"><h3>Session complete — thank you</h3>
      <p className="small">{stored ? <>Saved as <span className="mono">{rec.session_id}</span>. You can review, download or delete it in <a href="#/my-data">My data</a>.</> : "Practice mode: nothing was stored."} Figures are descriptive for this single session; oddball accuracy includes correct rejections.</p>
      <div className="scroll-x"><table><thead><tr><th>Task</th><th className="num">Trials</th><th className="num">Accuracy</th><th className="num">Mean RT (correct, ms)</th></tr></thead>
        <tbody>{per.map((p) => <tr key={p.k}><td>{p.k.replace(/_/g, " ")}</td><td className="num">{p.n}</td><td className="num">{p.acc ?? "—"}%</td><td className="num">{p.rt ? Math.round(p.rt) : "—"}</td></tr>)}</tbody></table></div>
      <p className="small">Display: {rec.display_mode}{rec.camera_used ? " (camera used, not recorded)" : ""} · median frame interval {rec.timing.median_frame_ms ?? "n/a"} ms.</p>
      <div className="row mt">{stored && <a className="btn" href="#/my-data">My data</a>}<button className="btn ghost" onClick={() => download(`prism-${rec.session_id}.json`, JSON.stringify(rec, null, 1), "application/json")}>Download this session (JSON)</button><button className="btn ghost" onClick={again}>Run another session</button></div></div>
  );
}
