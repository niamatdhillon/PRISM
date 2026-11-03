// Three.js stage shared by three display modes:
//   scene3d         - opaque 3D environment (real WebGL perspective, depth, parallax)
//   camera_overlay  - transparent canvas composited over a live <video> camera feed. This is a 2D-screen overlay: it is NOT spatial AR
//                     (no world tracking; objects do not stay anchored to the room).
//   webxr           - genuine WebXR immersive-ar session (device pose tracking, passthrough) where the browser/device supports it.
// Task: find the bright cyan octahedron among cyan spheres and violet octahedra; report whether it is on the left or right of the view axis.
import * as THREE from "three";
import { SET_SIZES } from "../components/fieldEngine";
import type { DisplayMode } from "../types";

export interface StageConfig { complexity: 0 | 1 | 2; movement: boolean; distraction: boolean; brightness: number }
interface Item { mesh: THREE.Mesh; az: number; el: number; r: number; vaz: number; ph: number; target?: boolean }

export class SpatialStage {
  readonly mode: DisplayMode;
  private renderer: THREE.WebGLRenderer; private scene = new THREE.Scene(); private camera: THREE.PerspectiveCamera;
  private items: Item[] = []; private target: Item | null = null; private onset: ((t: number) => void) | null = null;
  private cfg: StageConfig; private raf = 0; private last = 0; private frameTimes: number[] = []; private container: HTMLElement; private fixation: THREE.Group;
  private flicker: THREE.Mesh; private flash: THREE.Mesh; private mats: THREE.MeshBasicMaterial[] = []; private offset = new THREE.Vector2(); private pointer = new THREE.Vector2();
  private orient: { beta: number; gamma: number } | null = null; private useOrientation = false; private xrSession: XRSession | null = null; private fixationOn = false;
  private onResize = () => this.resize();
  private onPointer = (e: PointerEvent) => { const r = this.container.getBoundingClientRect(); this.pointer.set(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2); };
  private onOrient = (e: DeviceOrientationEvent) => { if (e.beta !== null && e.gamma !== null) this.orient = { beta: e.beta, gamma: e.gamma }; };

  constructor(container: HTMLElement, mode: DisplayMode, cfg: StageConfig) {
    this.mode = mode; this.cfg = cfg; this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: mode !== "scene3d", powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x02030a, mode === "scene3d" ? 1 : 0);
    this.renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:manipulation";
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(65, 1.6, 0.05, 50);
    if (mode === "scene3d") { this.scene.fog = new THREE.Fog(0x02030a, 4, 11); this.addEnvironment(); }
    this.fixation = this.makeFixation(); this.scene.add(this.fixation);
    // slow, low-contrast full-view flicker plane + peripheral decoy flash (distraction condition)
    this.flicker = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshBasicMaterial({ color: 0xff78dc, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.flicker.position.z = -0.6; this.flicker.renderOrder = 999; this.camera.add(this.flicker);
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffc857, transparent: true, opacity: 0, depthTest: false }));
    this.flash.position.set(0.45, 0.28, -0.6); this.flash.renderOrder = 1000; this.camera.add(this.flash); this.scene.add(this.camera);
    this.populate(); this.resize();
    window.addEventListener("resize", this.onResize); container.addEventListener("pointermove", this.onPointer);
    this.renderer.setAnimationLoop((t) => this.frame(t)); // setAnimationLoop also drives WebXR sessions
  }

  private makeFixation() {
    const g = new THREE.Group(); const m = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false });
    const mk = (a: number[], b: number[]) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]), m);
    g.add(mk([-0.03, 0, 0], [0.03, 0, 0]), mk([0, -0.03, 0], [0, 0.03, 0])); g.position.set(0, 0, -1); g.visible = false; g.renderOrder = 998;
    this.camera.add(g); return g;
  }
  private addEnvironment() {
    const grid = new THREE.GridHelper(24, 48, 0x2457ff, 0x14246a); grid.position.y = -1.4; (grid.material as THREE.Material).opacity = 0.5; (grid.material as THREE.Material).transparent = true; this.scene.add(grid);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 0.012, 8, 96), new THREE.MeshBasicMaterial({ color: 0x22e5ff, transparent: true, opacity: 0.35 })); ring.rotation.x = Math.PI / 2; ring.position.y = -1.39; this.scene.add(ring);
  }
  private mat(color: number, base: number) { const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: base }); (m.userData as { base: number }).base = base; this.mats.push(m); return m; }
  private pos(it: Item) { it.mesh.position.set(Math.sin(it.az) * Math.cos(it.el) * it.r, Math.sin(it.el) * it.r, -Math.cos(it.az) * Math.cos(it.el) * it.r); }

  private populate() {
    this.items.forEach((i) => this.scene.remove(i.mesh)); this.items = []; this.mats = [];
    const sph = new THREE.SphereGeometry(0.12, 20, 14), oct = new THREE.OctahedronGeometry(0.15);
    const n = SET_SIZES[this.cfg.complexity];
    for (let i = 0; i < n; i++) {
      const diamond = i % 2 === 0; const mesh = new THREE.Mesh(diamond ? oct : sph, this.mat(diamond ? 0x9b6bff : 0x22b8e0, 0.8));
      const it: Item = { mesh, az: (Math.random() * 2 - 1) * 1.0, el: (Math.random() * 2 - 1) * 0.45, r: 2 + Math.random() * 2.6, vaz: (Math.random() - 0.5) * 0.25, ph: Math.random() * 6 };
      if (Math.abs(it.az) < 0.12) it.az = Math.sign(it.az || 1) * 0.12;  // keep the midline clear so left/right is unambiguous
      this.pos(it); this.scene.add(mesh); this.items.push(it);
    }
    this.applyBrightness();
  }
  private applyBrightness() { for (const m of this.mats) { m.opacity = ((m.userData as { base: number }).base) * this.cfg.brightness; } }

  setConfig(cfg: StageConfig) { const re = cfg.complexity !== this.cfg.complexity; this.cfg = cfg; if (re) this.populate(); else this.applyBrightness(); }
  setFixation(on: boolean) { this.fixationOn = on; this.fixation.visible = on; }
  async enableOrientation(): Promise<boolean> {
    const { requestOrientationPermission } = await import("./capabilities");
    if (!(await requestOrientationPermission())) return false;
    window.addEventListener("deviceorientation", this.onOrient); this.useOrientation = true; return true;
  }

  showTarget(side: "left" | "right", cb: (t: number) => void) {
    this.clearTarget();
    const az = (side === "left" ? -1 : 1) * (0.2 + Math.random() * 0.6);
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.19), new THREE.MeshBasicMaterial({ color: 0x22f0ff, transparent: true, opacity: Math.min(1, 0.55 + 0.45 * this.cfg.brightness) }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0xffffff })); mesh.add(edges);
    const t: Item = { mesh, az, el: (Math.random() * 2 - 1) * 0.3, r: 2.2 + Math.random() * 1.2, vaz: 0, ph: 0, target: true };
    this.pos(t); this.scene.add(mesh); this.target = t; this.onset = cb;
  }
  clearTarget() { if (this.target) { this.scene.remove(this.target.mesh); this.target = null; } this.onset = null; }
  get targetSide(): "left" | "right" | null { return this.target ? (this.target.az < 0 ? "left" : "right") : null; }

  async startXR(overlayRoot: HTMLElement): Promise<XRSession> {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr) throw new Error("WebXR is not available in this browser");
    const session = await xr.requestSession("immersive-ar", { requiredFeatures: ["local"], optionalFeatures: ["dom-overlay"], domOverlay: { root: overlayRoot } } as XRSessionInit);
    this.renderer.xr.enabled = true; this.renderer.xr.setReferenceSpaceType("local");
    await this.renderer.xr.setSession(session); this.xrSession = session;
    session.addEventListener("end", () => { this.xrSession = null; this.renderer.xr.enabled = false; });
    return session;
  }
  async endXR() { await this.xrSession?.end(); }
  get inXR() { return !!this.xrSession; }

  private resize() {
    const w = this.container.clientWidth || 640, h = this.container.clientHeight || 400;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  private frame(t: number) {
    const dt = Math.min(0.05, (t - this.last) / 1000 || 0);
    if (this.last) { this.frameTimes.push(t - this.last); if (this.frameTimes.length > 120) this.frameTimes.shift(); }
    this.last = t;
    if (this.cfg.movement) for (const it of this.items) { it.az += it.vaz * dt; it.ph += dt; it.el += Math.sin(it.ph) * 0.02 * dt; if (it.az > 1.05) it.az = -1.0; if (it.az < -1.05) it.az = 1.0; this.pos(it); }
    if (this.target && this.cfg.movement) { this.target.ph += dt; this.target.mesh.rotation.y += dt * 1.5; }
    if (this.target) this.target.mesh.rotation.y += dt * 0.8;
    if (!this.renderer.xr.isPresenting) {  // desktop/phone parallax; in WebXR the device pose drives the camera
      let ox = this.pointer.x * 0.12, oy = -this.pointer.y * 0.06;
      if (this.useOrientation && this.orient) { ox = Math.max(-1, Math.min(1, this.orient.gamma / 45)) * 0.25; oy = Math.max(-1, Math.min(1, (this.orient.beta - 60) / 45)) * -0.12; }
      this.offset.lerp(new THREE.Vector2(ox, oy), 0.08); this.camera.position.set(this.offset.x, this.offset.y, 0); this.camera.lookAt(0, 0, -3);
    }
    const on = Math.floor(t / 250) % 2 === 0;  // 2 Hz
    (this.flicker.material as THREE.MeshBasicMaterial).opacity = this.cfg.distraction && on ? 0.1 * this.cfg.brightness : 0;
    (this.flash.material as THREE.MeshBasicMaterial).opacity = this.cfg.distraction && on ? 0.4 : 0;
    this.renderer.render(this.scene, this.camera);
    if (this.target && this.onset) { const cb = this.onset; this.onset = null; cb(performance.now()); }  // onset = first frame after the target was added to the scene
  }

  get medianFrameMs(): number | null {
    if (this.frameTimes.length < 10) return null;
    const s = [...this.frameTimes].sort((a, b) => a - b); return Math.round(s[Math.floor(s.length / 2)] * 10) / 10;
  }

  dispose() {
    this.renderer.setAnimationLoop(null); window.removeEventListener("resize", this.onResize); window.removeEventListener("deviceorientation", this.onOrient);
    this.container.removeEventListener("pointermove", this.onPointer); void this.xrSession?.end().catch(() => undefined);
    this.scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose()); });
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
