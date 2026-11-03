export interface Capabilities { secureContext: boolean; webgl: boolean; camera: boolean; audio: boolean; deviceOrientation: boolean; orientationNeedsPermission: boolean; webxrApi: boolean; webxrAr: boolean; touch: boolean }

function hasWebGL(): boolean {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

export async function detectCapabilities(): Promise<Capabilities> {
  const nav = navigator as Navigator & { xr?: { isSessionSupported: (m: string) => Promise<boolean> } };
  let ar = false;
  try { ar = !!nav.xr && (await nav.xr.isSessionSupported("immersive-ar")); } catch { ar = false; }
  const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  return {
    secureContext: window.isSecureContext, webgl: hasWebGL(), camera: !!navigator.mediaDevices?.getUserMedia && window.isSecureContext,
    audio: !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext), deviceOrientation: "DeviceOrientationEvent" in window,
    orientationNeedsPermission: typeof DOE?.requestPermission === "function", webxrApi: !!nav.xr, webxrAr: ar, touch: navigator.maxTouchPoints > 0,
  };
}

export function deviceCategory(): "desktop" | "tablet" | "phone" {
  const t = navigator.maxTouchPoints > 0, w = Math.min(window.innerWidth, window.innerHeight);
  return t && w < 600 ? "phone" : t && w < 900 ? "tablet" : "desktop";
}

export async function requestOrientationPermission(): Promise<boolean> {
  const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  if (typeof DOE?.requestPermission === "function") { try { return (await DOE.requestPermission()) === "granted"; } catch { return false; } }
  return "DeviceOrientationEvent" in window;
}
