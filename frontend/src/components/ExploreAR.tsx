import { useCallback, useEffect, useRef, useState } from "react";
import type { HologramStage } from "../spatial/HologramStage";
import { CameraController, describeCameraError } from "../spatial/camera";
import { Capabilities, detectCapabilities } from "../spatial/capabilities";
import { Note } from "./ui";

type Mode = "scene3d" | "camera" | "webxr";

/** Interactive hologram: 3D scene, live camera rendered inside the scene (3-DoF gyro option), or a genuine WebXR AR session where supported. */
export default function ExploreAR() {
  const host = useRef<HTMLDivElement>(null); const overlay = useRef<HTMLDivElement>(null); const video = useRef<HTMLVideoElement>(null);
  const stage = useRef<HologramStage | null>(null); const cam = useRef(new CameraController());
  const [caps, setCaps] = useState<Capabilities | null>(null); const [mode, setMode] = useState<Mode>("scene3d"); const [score, setScore] = useState(0);
  const [camOn, setCamOn] = useState(false); const [facing, setFacing] = useState<"user" | "environment">("environment"); const [devices, setDevices] = useState<{ id: string; label: string }[]>([]);
  const [msg, setMsg] = useState(""); const [hint, setHint] = useState(""); const [tilt, setTilt] = useState(false); const [xrOn, setXrOn] = useState(false); const [webgl, setWebgl] = useState(true); const [busy, setBusy] = useState(false);

  useEffect(() => { void detectCapabilities().then((c) => { setCaps(c); setWebgl(c.webgl); }); }, []);
  useEffect(() => {
    if (!host.current || webgl === false) return; let dead = false;
    void import("../spatial/HologramStage").then(({ HologramStage: HS }) => { if (dead || !host.current) return; stage.current = new HS(host.current, setScore, setHint); });
    return () => { dead = true; stage.current?.dispose(); stage.current = null; };
  }, [webgl]);
  useEffect(() => () => { cam.current.stop(video.current); }, []);   // leaving the page always releases the camera

  const stopCamera = useCallback(() => { stage.current?.setVideo(null); cam.current.stop(video.current); setCamOn(false); }, []);
  useEffect(() => { cam.current.onEnded = () => { stage.current?.setVideo(null); setCamOn(false); setMsg("The camera was stopped."); }; }, []);

  const startCamera = async (f = facing, deviceId?: string) => {
    setMsg(""); setBusy(true);
    try {
      const info = await cam.current.start(video.current!, f, deviceId); setFacing(f); setCamOn(true); stage.current?.setMode("camera"); stage.current?.setVideo(video.current, info.facing === "user"); setMode("camera");
      setDevices(await cam.current.devices());
    } catch (e) { const d = describeCameraError(e); setMsg(d.message); setCamOn(false); }
    finally { setBusy(false); }
  };
  const to3d = () => { stopCamera(); stage.current?.setMode("scene3d"); setMode("scene3d"); setMsg(""); };
  const pick = (m: Mode) => { if (m === "scene3d") to3d(); else if (m === "camera") { setMode("camera"); stage.current?.setMode("camera"); } else { stopCamera(); setMode("webxr"); } setMsg(""); setHint(""); };
  const enterXR = async () => {
    setMsg(""); try { await stage.current!.startXR(overlay.current!); setXrOn(true); } catch (e) { setMsg(`AR couldn't start (${(e as Error).message}). You can use the camera or the 3D environment instead.`); }
  };
  const endXR = async () => { await stage.current?.endXR(); setXrOn(false); setMode("scene3d"); };
  const enableTilt = async () => { const ok = await stage.current?.enableOrientation(); setTilt(!!ok); if (!ok) setMsg("Motion sensors aren't available or permission was declined."); };

  const cameraOk = !!caps?.camera && webgl; const xrOk = !!caps?.webxrAr && webgl;
  return (
    <div ref={overlay}>
      <div className="row spread" style={{ marginBottom: 10 }}>
        <div className="choice" role="radiogroup" aria-label="Environment">
          {([["scene3d", "3D environment", webgl, "WebGL is not available on this device"], ["camera", "Live camera", cameraOk, caps?.secureContext === false ? "Camera needs a secure (HTTPS) connection" : "No camera API or WebGL available"], ["webxr", "AR (WebXR)", xrOk, "Needs a WebXR-capable browser and device, e.g. Chrome on a supported Android phone"]] as const).map(([v, l, ok, why]) => (
            <label key={v} title={ok ? "" : why}><input type="radio" name="explore-mode" disabled={!ok} checked={mode === v} onChange={() => pick(v)} /><span>{l}{ok ? "" : " · unavailable"}</span></label>))}
        </div>
        <span className="badge b-info" aria-live="polite">◆ {score} shards popped</span>
      </div>
      <div className="stage" style={{ aspectRatio: undefined }}>
        <div ref={host} className="stagehost" role="img" aria-label="Interactive holographic prism with floating targets. Click or tap a target to pop it." />
        <video ref={video} playsInline muted aria-hidden style={{ position: "absolute", width: 2, height: 2, opacity: 0, pointerEvents: "none" }} />
        <div className="hud"><span>{mode === "camera" && camOn ? "LIVE CAMERA · tap a shard" : mode === "webxr" && xrOn ? "AR SESSION" : "tap or click the shards"}</span><span>{camOn ? "● camera on · not recorded" : ""}</span></div>
        {!webgl && <div className="fallback-3d"><p>3D graphics aren't available on this device, so the interactive hologram can't be shown. The rest of PRISM works normally.</p></div>}
      </div>
      {hint && <p className="small mt" aria-live="polite">{hint}</p>}
      {msg && <div className="err" role="alert">{msg} {mode === "camera" && !camOn && <button className="btn sm ghost" onClick={to3d}>Continue in 3D</button>}</div>}
      <div className="row mt">
        {mode === "camera" && (camOn ? <>
          <button className="btn sm ghost" onClick={stopCamera}>Stop camera</button>
          <button className="btn sm ghost" disabled={busy} onClick={() => startCamera(facing === "user" ? "environment" : "user")}>Use {facing === "user" ? "rear" : "front"} camera</button>
          {devices.length > 1 && <select aria-label="Camera" style={{ width: "auto" }} onChange={(e) => startCamera(facing, e.target.value)}>{devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>}
          {caps?.deviceOrientation && <><button className="btn sm ghost" aria-pressed={tilt} onClick={enableTilt}>{tilt ? "Motion tracking on" : "Track device motion"}</button>{tilt && <button className="btn sm ghost" onClick={() => stage.current?.recenter()}>Recenter</button>}</>}
        </> : <button className="btn" disabled={busy} onClick={() => startCamera()}>{busy ? "Starting camera…" : "Start camera"}</button>)}
        {mode === "webxr" && (xrOn ? <button className="btn sm ghost" onClick={endXR}>Exit AR</button> : <button className="btn" onClick={enterXR}>Enter AR session</button>)}
      </div>
      {mode === "camera" && !camOn && !msg && <p className="small mt">Your browser will ask for camera permission. The video is shown only on this page, is never recorded, stored or uploaded, and stops when you press Stop or leave.</p>}
      {mode === "camera" && camOn && <Note kind="info">Camera overlay: the live image is rendered inside the 3D scene. With motion tracking the hologram holds its direction as you turn the device (orientation only) — it is not anchored to the room. For true spatial anchoring use AR (WebXR) on a supported device.</Note>}
    </div>
  );
}
