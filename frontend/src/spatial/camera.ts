// Camera access: explicit user-initiated start, typed errors, stream kept in memory only (never recorded, stored or uploaded).
export type CameraErrorKind = "insecure" | "unsupported" | "denied" | "not_found" | "in_use" | "constraint" | "unknown";
export class CameraError extends Error { constructor(public kind: CameraErrorKind, message: string) { super(message); } }

const EXPLAIN: Record<CameraErrorKind, string> = {
  insecure: "Camera access needs a secure (HTTPS) connection.",
  unsupported: "This browser does not support camera access.",
  denied: "Camera permission was denied. You can continue with the 3D environment without camera, or allow the camera in your browser's site settings and try again.",
  not_found: "No camera was found on this device.",
  in_use: "The camera is in use by another application or could not be started.",
  constraint: "The requested camera (front/rear) is not available on this device.",
  unknown: "The camera could not be started.",
};

export function describeCameraError(e: unknown): { kind: CameraErrorKind; message: string } {
  if (e instanceof CameraError) return { kind: e.kind, message: EXPLAIN[e.kind] };
  return { kind: "unknown", message: EXPLAIN.unknown };
}

export function classify(e: unknown): CameraErrorKind {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "not_found";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "in_use";
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") return "constraint";
  return "unknown";
}

export class CameraController {
  stream: MediaStream | null = null;
  facing: "user" | "environment" = "environment";
  onEnded: (() => void) | null = null;
  private hide = () => { if (document.visibilityState === "hidden" && this.stream) { this.stop(); this.onEnded?.(); } };  // never keep the camera running in a background tab

  /** Starts the camera. Tries the requested facing mode, then any camera; throws a typed CameraError. */
  async start(video: HTMLVideoElement, facing: "user" | "environment", deviceId?: string): Promise<{ facing: string; label: string }> {
    if (!window.isSecureContext) throw new CameraError("insecure", "insecure context");
    if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("unsupported", "no getUserMedia");
    this.stop();
    const attempts: MediaStreamConstraints[] = deviceId
      ? [{ audio: false, video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } }]
      : [{ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } } }, { audio: false, video: true }];
    let lastErr: unknown = null;
    for (const c of attempts) {
      try { this.stream = await navigator.mediaDevices.getUserMedia(c); lastErr = null; break; }
      catch (e) { lastErr = e; if (classify(e) === "denied") break; }   // a denial is final; other errors may succeed with looser constraints
    }
    if (!this.stream) throw new CameraError(classify(lastErr), String((lastErr as Error)?.message || lastErr));
    this.facing = facing;
    video.setAttribute("playsinline", ""); video.setAttribute("muted", ""); video.muted = true; video.playsInline = true; video.autoplay = true;   // required by iOS Safari
    video.srcObject = this.stream;
    try { await video.play(); } catch { /* the stream is attached; the first user gesture will start playback */ }
    const t = this.stream.getVideoTracks()[0];
    t.addEventListener("ended", () => { this.stream = null; this.onEnded?.(); }, { once: true });
    document.addEventListener("visibilitychange", this.hide); window.addEventListener("pagehide", this.hide);
    return { facing: (t.getSettings().facingMode as string) || facing, label: t.label || "camera" };
  }

  async devices(): Promise<{ id: string; label: string }[]> {
    try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput").map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })); } catch { return []; }
  }

  stop(video?: HTMLVideoElement | null) {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (video) video.srcObject = null;
    document.removeEventListener("visibilitychange", this.hide); window.removeEventListener("pagehide", this.hide);
  }
  get active() { return !!this.stream && this.stream.getVideoTracks().some((t) => t.readyState === "live"); }
}
