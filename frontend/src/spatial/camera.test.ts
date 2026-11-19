import { afterEach, describe, expect, it, vi } from "vitest";
import { CameraController, CameraError, classify, describeCameraError } from "./camera";

const video = () => { const v = document.createElement("video"); v.play = vi.fn().mockResolvedValue(undefined); return v; };
const setSecure = (b: boolean) => Object.defineProperty(window, "isSecureContext", { value: b, configurable: true });
const setGUM = (fn: unknown) => Object.defineProperty(navigator, "mediaDevices", { value: fn === undefined ? undefined : { getUserMedia: fn }, configurable: true });
afterEach(() => { setSecure(true); });

describe("camera permission handling", () => {
  it("maps browser errors to explicit kinds", () => {
    expect(classify({ name: "NotAllowedError" })).toBe("denied"); expect(classify({ name: "NotFoundError" })).toBe("not_found"); expect(classify({ name: "NotReadableError" })).toBe("in_use");
    expect(classify({ name: "OverconstrainedError" })).toBe("constraint"); expect(classify(new Error("x"))).toBe("unknown");
  });
  it("permission denial throws a typed error with a helpful message and leaves no active stream", async () => {
    setSecure(true); setGUM(vi.fn().mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" })));
    const c = new CameraController(); await expect(c.start(video(), "environment")).rejects.toMatchObject({ kind: "denied" });
    expect(c.active).toBe(false); expect(describeCameraError(new CameraError("denied", "x")).message).toMatch(/continue with the 3D environment/i);
  });
  it("refuses on insecure contexts and unsupported browsers without calling getUserMedia", async () => {
    const gum = vi.fn(); setGUM(gum); setSecure(false);
    await expect(new CameraController().start(video(), "user")).rejects.toMatchObject({ kind: "insecure" }); expect(gum).not.toHaveBeenCalled();
    setSecure(true); setGUM(undefined); await expect(new CameraController().start(video(), "user")).rejects.toMatchObject({ kind: "unsupported" });
  });
  it("falls back to any camera if the requested facing mode is unavailable, but never retries after a denial", async () => {
    const track = { stop: vi.fn(), readyState: "live", getSettings: () => ({}), label: "cam", addEventListener: vi.fn() }; const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
    const gum = vi.fn().mockRejectedValueOnce(Object.assign(new Error("x"), { name: "OverconstrainedError" })).mockResolvedValueOnce(stream); setSecure(true); setGUM(gum);
    await new CameraController().start(video(), "environment"); expect(gum).toHaveBeenCalledTimes(2); expect(gum.mock.calls[1][0].video).toBe(true);
    const deny = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" })); setGUM(deny);
    await expect(new CameraController().start(video(), "environment")).rejects.toMatchObject({ kind: "denied" }); expect(deny).toHaveBeenCalledTimes(1);
  });
  it("stops the camera when the tab is hidden (no background capture)", async () => {
    const track = { stop: vi.fn(), readyState: "live", getSettings: () => ({}), label: "cam", addEventListener: vi.fn() }; const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
    setSecure(true); setGUM(vi.fn().mockResolvedValue(stream)); const c = new CameraController(); const ended = vi.fn(); c.onEnded = ended; await c.start(video(), "user");
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange"));
    expect(track.stop).toHaveBeenCalled(); expect(ended).toHaveBeenCalled(); expect(c.active).toBe(false); Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
  it("requests video only (no audio) and stop() ends every track", async () => {
    const track = { stop: vi.fn(), readyState: "live", getSettings: () => ({ facingMode: "user" }), label: "cam", addEventListener: vi.fn() }; const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
    const gum = vi.fn().mockResolvedValue(stream); setSecure(true); setGUM(gum); const v = video();
    const c = new CameraController(); const info = await c.start(v, "user");
    expect(gum.mock.calls[0][0].audio).toBe(false); expect(info.facing).toBe("user"); expect(c.active).toBe(true);
    c.stop(v); expect(track.stop).toHaveBeenCalled(); expect(c.active).toBe(false); expect(v.srcObject).toBeNull();
  });
});
