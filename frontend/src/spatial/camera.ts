// Camera access: explicit user-initiated start, typed errors, stream kept in memory only (never recorded, stored or uploaded).
export type CameraErrorKind = "insecure" | "unsupported" | "denied" | "not_found" | "in_use" | "constraint" | "unknown";
export class CameraError extends Error { constructor(public kind: CameraErrorKind, message: string) { super(message); } }

const EXPLAIN: Record<CameraErrorKind, string> = {
  insecure: "Camera access needs HTTPS (or localhost). This page is not in a secure context.",
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

  async start(video: HTMLVideoElement, facing: "user" | "environment"): Promise<{ facing: string; label: string }> {
    if (!window.isSecureContext) throw new CameraError("insecure", "insecure context");
    if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("unsupported", "no getUserMedia");
    this.stop();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    } catch (e) { throw new CameraError(classify(e), String((e as Error)?.message || e)); }
    this.facing = facing;
    video.srcObject = this.stream; video.muted = true; video.playsInline = true;
    try { await video.play(); } catch { /* autoplay policies: playsInline+muted normally succeeds */ }
    const t = this.stream.getVideoTracks()[0];
    return { facing: (t.getSettings().facingMode as string) || facing, label: t.label || "camera" };
  }

  stop(video?: HTMLVideoElement | null) {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (video) video.srcObject = null;
  }
  get active() { return !!this.stream && this.stream.getVideoTracks().some((t) => t.readyState === "live"); }
}
