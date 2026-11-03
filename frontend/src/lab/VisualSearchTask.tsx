import { useCallback, useEffect, useRef, useState } from "react";
import { FieldEngine, SET_SIZES, Tone } from "../components/fieldEngine";
import type { SpatialStage } from "../spatial/SpatialStage";  // loaded lazily (three.js is large)
import { CameraController, describeCameraError } from "../spatial/camera";
import type { Capabilities } from "../spatial/capabilities";
import type { Condition, DisplayMode, Trial } from "../types";
import { Note } from "../components/ui";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const N_BLOCK = 12, N_PRACTICE = 3, TIMEOUT = 2500;
interface StageLike { showTarget(side: "left" | "right", cb: (t: number) => void): void; clearTarget(): void; setFixation(on: boolean): void; setConfig(c: Condition | { complexity: 0 | 1 | 2; movement: boolean; distraction: boolean; brightness: number }): void; destroy(): void }

export interface VSResult { trials: Trial[]; displayMode: DisplayMode; cameraUsed: boolean; medianFrameMs: number | null; blockModalities: ("visual" | "audiovisual")[] }

export function VisualSearchTask({ requestedMode, caps, cond, audioOn, tone, startIdx, onFinish, onCameraStateChange }: {
  requestedMode: DisplayMode; caps: Capabilities; cond: Omit<Condition, "block_modalities">; audioOn: boolean; tone: Tone; startIdx: number; onFinish: (r: VSResult) => void; onCameraStateChange?: (on: boolean) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null); const host = useRef<HTMLDivElement>(null); const video = useRef<HTMLVideoElement>(null); const overlay = useRef<HTMLDivElement>(null);
  const stage = useRef<StageLike | null>(null); const spatial = useRef<SpatialStage | null>(null); const cam = useRef(new CameraController());
  const [mode, setMode] = useState<DisplayMode>(requestedMode === "webxr" || requestedMode === "camera_overlay" ? requestedMode : caps.webgl ? requestedMode : "canvas2d");
  const [camOn, setCamOn] = useState(false); const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [msg, setMsg] = useState<string>(""); const [phase, setPhase] = useState<"ready" | "running">("ready"); const [feedback, setFeedback] = useState(""); const [hud, setHud] = useState("");
  const [stageReady, setStageReady] = useState(0); const [answers, setAnswers] = useState(false); const [muted, setMuted] = useState(false); const [vol, setVol] = useState(0.3); const [tilt, setTilt] = useState(false); const [xrOn, setXrOn] = useState(false);
  const resp = useRef<((v: string, ts: number) => void) | null>(null); const alive = useRef(true); const mutedRef = useRef(false); const camUsedEver = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { mutedRef.current = muted; }, [muted]); useEffect(() => { tone.volume = vol; }, [vol, tone]);

  // (re)build the stage when the effective mode changes
  useEffect(() => {
    const el = host.current!; el.innerHTML = ""; let cancelled = false;
    if (mode === "canvas2d" || !caps.webgl) {
      const c = document.createElement("canvas"); c.style.cssText = "width:100%;height:100%;display:block"; el.appendChild(c);
      const f = new FieldEngine(c, { ...cond }); stage.current = { showTarget: (s, cb) => f.showTarget(s, cb), clearTarget: () => f.clearTarget(), setFixation: (o) => f.setFixation(o), setConfig: (c2) => f.setConfig(c2 as never), destroy: () => f.destroy() }; spatial.current = null;
    } else {
      void import("../spatial/SpatialStage").then(({ SpatialStage: SS }) => {
        if (cancelled) return;
        const s = new SS(el, mode, cond); spatial.current = s;
        stage.current = { showTarget: (side, cb) => s.showTarget(side, cb), clearTarget: () => s.clearTarget(), setFixation: (o) => s.setFixation(o), setConfig: (c2) => s.setConfig(c2 as never), destroy: () => s.dispose() };
        setStageReady((n) => n + 1);
      });
    }
    return () => { cancelled = true; stage.current?.destroy(); stage.current = null; spatial.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  useEffect(() => { stage.current?.setConfig(cond); }, [cond]);
  useEffect(() => () => { cam.current.stop(video.current); onCameraStateChange?.(false); }, [onCameraStateChange]);

  const startCamera = async (f = facing) => {
    setMsg("");
    try { await cam.current.start(video.current!, f); setCamOn(true); camUsedEver.current = true; setFacing(f); onCameraStateChange?.(true); }
    catch (e) { const d = describeCameraError(e); setMsg(d.message); setCamOn(false); onCameraStateChange?.(false); }
  };
  const stopCamera = () => { cam.current.stop(video.current); setCamOn(false); onCameraStateChange?.(false); };
  const enterXR = async () => {
    setMsg("");
    try { await spatial.current!.startXR(overlay.current!); setXrOn(true); }
    catch (e) { setMsg(`WebXR AR could not start (${(e as Error).message}). Falling back to the camera overlay, which is NOT spatial AR.`); setMode(caps.camera ? "camera_overlay" : "scene3d"); }
  };
  const enableTilt = async () => { setTilt(!!(await spatial.current?.enableOrientation())); if (!spatial.current) setMsg("Tilt parallax needs the 3D modes."); };
  const fallback3d = () => { stopCamera(); setMode(caps.webgl ? "scene3d" : "canvas2d"); setMsg(""); };

  const press = useCallback((v: string, ts: number) => resp.current?.(v, ts), []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { const m: Record<string, string> = { f: "left", F: "left", ArrowLeft: "left", j: "right", J: "right", ArrowRight: "right" }; if (m[e.key]) press(m[e.key], e.timeStamp); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [press]);

  async function trial(block: number, idx: number, modality: "visual" | "audiovisual", record: boolean, out: Trial[]) {
    const st = stage.current!; setAnswers(false); setFeedback(""); st.clearTarget(); st.setFixation(true); await sleep(600 + Math.random() * 700); if (!alive.current) return false;
    st.setFixation(false);
    const side: "left" | "right" = Math.random() < 0.5 ? "left" : "right";
    const delivered: "visual" | "audiovisual" = modality === "audiovisual" && !mutedRef.current ? "audiovisual" : "visual";
    const onset = await new Promise<number>((res) => st.showTarget(side, res));
    if (delivered === "audiovisual") tone.beep(880, 0.09);
    setAnswers(true);
    const got = await new Promise<{ v: string | null; ts: number }>((res) => { const t = setTimeout(() => { resp.current = null; res({ v: null, ts: performance.now() }); }, TIMEOUT); resp.current = (v, ts) => { clearTimeout(t); resp.current = null; res({ v, ts }); }; });
    st.clearTarget(); setAnswers(false); if (!alive.current) return false;
    const rt = got.v ? Math.max(0, Math.round((got.ts - onset) * 10) / 10) : null, correct = got.v === null ? null : got.v === side;
    setFeedback(got.v === null ? "Too slow ⏱" : correct ? "Correct ✓" : "Incorrect ✗");
    if (record) out.push({ idx, task: "visual_search", block, modality: delivered, trial_type: null, set_size: SET_SIZES[cond.complexity], stimulus: side, response: got.v, correct, rt_ms: rt, onset_epoch_ms: Math.round((performance.timeOrigin + onset) * 10) / 10, timeout: got.v === null, anticipatory: rt !== null && rt < 150 });
    await sleep(400); return true;
  }

  async function run() {
    setPhase("running"); const out: Trial[] = []; if (audioOn) tone.ensure();
    const plan: ("visual" | "audiovisual")[] = audioOn ? (Math.random() < 0.5 ? ["visual", "audiovisual"] : ["audiovisual", "visual"]) : ["visual", "visual"];
    for (let i = 0; i < N_PRACTICE; i++) { setHud(`Practice (not recorded) ${i + 1}/${N_PRACTICE}`); if (!(await trial(0, i, "visual", false, out))) return; }
    let idx = startIdx;
    for (let b = 0; b < 2; b++) {
      setHud(`Block ${b + 1}/2 — ${plan[b] === "audiovisual" ? "visual + tone" : "visual only"}`); setFeedback(`Block ${b + 1} starting…`); await sleep(1200);
      for (let i = 0; i < N_BLOCK; i++) { setHud(`Block ${b + 1}/2 · trial ${i + 1}/${N_BLOCK}`); if (!(await trial(b, idx++, plan[b], true, out))) return; }
    }
    const used = camUsedEver.current; stopCamera();
    if (spatial.current?.inXR) await spatial.current.endXR();
    onFinish({ trials: out, displayMode: mode, cameraUsed: used && mode === "camera_overlay", medianFrameMs: spatial.current?.medianFrameMs ?? null, blockModalities: plan });
  }

  const showVideo = mode === "camera_overlay";
  return (
    <div className="panel" ref={wrap}>
      <div className="row spread"><h3 style={{ margin: 0 }}>Spatial visual search</h3>
        <span className="badge b-info">{{ canvas2d: "2D canvas (no WebGL)", scene3d: "3D environment", camera_overlay: "camera overlay · not spatial AR", webxr: "WebXR AR" }[mode]}</span></div>
      {mode === "camera_overlay" && <Note kind="info">Camera overlay: your live camera is shown behind 3D shapes. This is <strong>not</strong> spatial AR — shapes do not stay anchored in the room. Video stays in your browser; nothing is recorded, saved or uploaded.</Note>}
      {mode === "webxr" && <Note kind="info">WebXR AR uses your device's motion tracking and camera passthrough (Chrome on supported Android devices). Camera pixels are handled by the browser/OS and are not exposed to PRISM.</Note>}
      {msg && <div className="err" role="alert">{msg}</div>}
      <div ref={overlay} className="xr-root" style={{ position: "relative" }}>
        <div className="stage" style={{ aspectRatio: undefined }}>
          <video ref={video} playsInline muted aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: showVideo && camOn ? "block" : "none", transform: facing === "user" ? "scaleX(-1)" : "none" }} />
          <div ref={host} className="stagehost" role="img" aria-label={`Search field with ${SET_SIZES[cond.complexity]} items${cond.movement ? ", moving" : ""}${cond.distraction ? ", with flicker distraction" : ""}`} />
          <div className="hud"><span>{phase === "ready" ? "PREVIEW · no target" : hud}</span><span>{camOn ? "● camera live (not recorded)" : ""}</span></div>
        </div>
        <div aria-live="polite" className="mono" style={{ minHeight: 24, textAlign: "center", color: "var(--cyan)", marginTop: 6 }}>{feedback}</div>
        {answers && <div className="answers"><button className="btn" onClick={(e) => press("left", e.nativeEvent.timeStamp)}>◀ Left <small>(F)</small></button><button className="btn" onClick={(e) => press("right", e.nativeEvent.timeStamp)}>Right ▶ <small>(J)</small></button></div>}
      </div>
      <div className="row mt">
        {mode === "camera_overlay" && (camOn
          ? <><button className="btn sm ghost" onClick={stopCamera}>Stop camera</button><button className="btn sm ghost" onClick={() => startCamera(facing === "user" ? "environment" : "user")}>Switch to {facing === "user" ? "rear" : "front"} camera</button></>
          : <button className="btn sm" onClick={() => startCamera()}>Start camera (asks permission)</button>)}
        {mode === "camera_overlay" && !camOn && <button className="btn sm ghost" onClick={fallback3d}>Continue without camera (3D environment)</button>}
        {mode === "webxr" && !xrOn && phase === "ready" && <><button className="btn sm" onClick={enterXR}>Enter AR session</button><button className="btn sm ghost" onClick={fallback3d}>Use 3D environment instead</button></>}
        {(mode === "scene3d" || mode === "camera_overlay") && caps.deviceOrientation && phase === "ready" && <button className="btn sm ghost" aria-pressed={tilt} onClick={enableTilt}>{tilt ? "Tilt parallax on" : "Enable tilt parallax (device sensors)"}</button>}
        {audioOn && <><button className="btn sm ghost" aria-pressed={muted} onClick={() => setMuted((m) => !m)}>{muted ? "🔇 Muted" : "🔊 Sound on"}</button>
          <label className="small" style={{ margin: 0 }}>Volume <input type="range" min={0.05} max={0.6} step={0.05} value={vol} onChange={(e) => setVol(Number(e.target.value))} style={{ width: 110, verticalAlign: "middle" }} /></label>
          {phase === "ready" && <button className="btn sm ghost" onClick={() => tone.beep(880, 0.09)}>Test tone</button>}</>}
      </div>
      {phase === "ready" && <div className="mt"><p className="small"><strong>Instructions:</strong> find the <strong style={{ color: "var(--cyan)" }}>bright cyan octahedron</strong> (not the violet ones, not the spheres) and say whether it is on the <strong>left</strong> or <strong>right</strong> of the centre — buttons below, or keys F / J. 3 practice trials come first. Be fast and accurate.</p>
        <button className="btn" disabled={!stage.current && stageReady === 0 || (mode === "camera_overlay" && !camOn) || (mode === "webxr" && !xrOn)} onClick={run}>Begin visual search</button>
        {mode === "camera_overlay" && !camOn && <small> Start the camera first, or continue without it.</small>}{mode === "webxr" && !xrOn && <small> Enter the AR session first, or use the 3D environment.</small>}</div>}
    </div>
  );
}
