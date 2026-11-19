// Interactive holographic stage for the Explore page.
//   scene3d : opaque 3D scene (WebGL, pointer parallax, clickable shards)
//   camera  : live camera rendered INSIDE the scene via VideoBackdrop; optional 3-DoF gyro orientation. Orientation-tracked overlay - NOT spatial/world-anchored AR.
//   webxr   : genuine WebXR immersive-ar session with hit-test: a reticle follows detected real-world surfaces and a tap anchors the hologram there (device 6-DoF tracking).
import * as THREE from "three";
import { buildPrism, PrismObject } from "./prismObject";
import { VideoBackdrop } from "./videoBackdrop";

interface Shard { mesh: THREE.Mesh; r: number; a: number; y: number; speed: number; pop: number }

export class HologramStage {
  private renderer: THREE.WebGLRenderer; private scene = new THREE.Scene(); private camera = new THREE.PerspectiveCamera(60, 1.6, 0.05, 60); private container: HTMLElement;
  private world = new THREE.Group(); private prism: PrismObject; private shards: Shard[] = []; private backdrop: VideoBackdrop | null = null; private grid: THREE.GridHelper;
  private ray = new THREE.Raycaster(); private ptr = new THREE.Vector2(); private offset = new THREE.Vector2(); private score = 0;
  private orient: { a: number; b: number; g: number } | null = null; private yawOffset = 0; private useOrient = false; private reduce: boolean;
  private xr: XRSession | null = null; private hitSource: XRHitTestSource | null = null; private reticle: THREE.Mesh; private placed = false; private ro: ResizeObserver;
  mode: "scene3d" | "camera" | "webxr" = "scene3d";

  constructor(container: HTMLElement, private onScore: (n: number) => void, private onHint?: (s: string) => void) {
    this.container = container; this.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); this.renderer.setClearColor(0x02030a, 1); this.renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none";
    container.appendChild(this.renderer.domElement);
    this.prism = buildPrism(1); this.world.add(this.prism.group); this.world.position.set(0, 0, -3); this.scene.add(this.world, this.camera);
    const sg = new THREE.OctahedronGeometry(0.16);
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: i % 2 ? 0x22e5ff : 0x9b6bff, transparent: true, opacity: 0.9 }));
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(sg), new THREE.LineBasicMaterial({ color: 0xffffff }))); this.world.add(m);
      this.shards.push({ mesh: m, r: 1.5 + Math.random() * 0.9, a: (i / 9) * Math.PI * 2, y: (Math.random() - 0.5) * 1.4, speed: 0.15 + Math.random() * 0.25, pop: 0 });
    }
    this.grid = new THREE.GridHelper(14, 28, 0x2457ff, 0x14246a); this.grid.position.y = -1.3; (this.grid.material as THREE.Material).transparent = true; (this.grid.material as THREE.Material).opacity = 0.5; this.world.add(this.grid);
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.16, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x22e5ff })); this.reticle.visible = false; this.reticle.matrixAutoUpdate = false; this.scene.add(this.reticle);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container); this.resize();
    container.addEventListener("pointermove", this.onMove); container.addEventListener("pointerdown", this.onDown);
    window.addEventListener("deviceorientation", this.onOrient);
    this.renderer.setAnimationLoop((t, f) => this.frame(t, f as XRFrame | undefined));
  }

  private onMove = (e: PointerEvent) => { const r = this.container.getBoundingClientRect(); this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)); };
  private onOrient = (e: DeviceOrientationEvent) => { if (e.alpha !== null && e.beta !== null && e.gamma !== null) this.orient = { a: e.alpha, b: e.beta, g: e.gamma }; };
  private onDown = (e: PointerEvent) => {
    this.onMove(e); if (this.xr) return;
    this.ray.setFromCamera(this.ptr, this.camera);
    const hit = this.ray.intersectObjects(this.shards.map((s) => s.mesh), false)[0];
    if (hit) { const s = this.shards.find((x) => x.mesh === hit.object); if (s && s.pop === 0) { s.pop = 1; this.score++; this.onScore(this.score); } }
  };

  setMode(m: "scene3d" | "camera") {
    this.mode = m; this.grid.visible = m === "scene3d"; this.renderer.setClearColor(0x02030a, m === "scene3d" ? 1 : 0);
    if (m === "scene3d") { this.setVideo(null); }
  }
  setVideo(video: HTMLVideoElement | null, mirror = false) { this.backdrop?.dispose(); this.backdrop = video ? new VideoBackdrop(video, this.camera, mirror) : null; if (video) video.addEventListener("loadedmetadata", () => this.backdrop?.layout(), { once: true }); }
  get cameraFeedLive() { return !!this.backdrop?.ready; }
  async enableOrientation(): Promise<boolean> { const { requestOrientationPermission } = await import("./capabilities"); this.useOrient = await requestOrientationPermission(); this.recenter(); return this.useOrient; }
  recenter() { if (this.orient) this.yawOffset = this.orient.a; }

  async startXR(overlay: HTMLElement): Promise<void> {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr; if (!xr) throw new Error("WebXR is not available in this browser");
    const session = await xr.requestSession("immersive-ar", { requiredFeatures: ["hit-test"], optionalFeatures: ["dom-overlay", "local-floor"], domOverlay: { root: overlay } } as XRSessionInit);
    this.renderer.xr.enabled = true; this.renderer.xr.setReferenceSpaceType("local"); await this.renderer.xr.setSession(session);
    const viewer = await session.requestReferenceSpace("viewer"); this.hitSource = (await session.requestHitTestSource?.({ space: viewer })) ?? null;
    this.xr = session; this.mode = "webxr"; this.placed = false; this.world.visible = false; this.grid.visible = false; this.onHint?.("Move your phone slowly until the ring appears on a surface, then tap to place the hologram.");
    session.addEventListener("select", () => { if (this.reticle.visible) { this.world.position.setFromMatrixPosition(this.reticle.matrix); this.world.position.y += 0.6; this.world.visible = true; this.placed = true; this.onHint?.("Placed. Walk around it — it stays anchored to the real world. Tap to move it."); } });
    session.addEventListener("end", () => { this.xr = null; this.hitSource = null; this.reticle.visible = false; this.renderer.xr.enabled = false; this.world.position.set(0, 0, -3); this.world.visible = true; this.mode = "scene3d"; });
  }
  async endXR() { await this.xr?.end(); }
  get inXR() { return !!this.xr; }

  private resize() {
    const w = this.container.clientWidth || 640, h = this.container.clientHeight || 400; this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    this.camera.fov = Math.min(80, Math.max(45, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(34)) / this.camera.aspect)))); this.camera.updateProjectionMatrix(); this.backdrop?.layout();
  }

  private frame(t: number, xrFrame?: XRFrame) {
    const dt = 0.016;
    if (!this.reduce) this.prism.update(t);
    for (const s of this.shards) {
      s.a += s.speed * dt * (this.reduce ? 0 : 1); s.mesh.position.set(Math.cos(s.a) * s.r, s.y + Math.sin(t * 0.001 + s.a) * 0.08, Math.sin(s.a) * s.r); s.mesh.rotation.y += 0.02;
      if (s.pop > 0) { s.pop += 0.12; s.mesh.scale.setScalar(Math.max(0.001, 1 + Math.sin(s.pop) * 0.9) * (s.pop > 3.1 ? 0 : 1)); if (s.pop > 3.2) { s.pop = 0; s.mesh.scale.setScalar(1); s.a = Math.random() * 6.28; } }
    }
    if (xrFrame && this.hitSource) {
      const refSpace = this.renderer.xr.getReferenceSpace(); const hits = xrFrame.getHitTestResults(this.hitSource);
      if (hits.length && refSpace) { const pose = hits[0].getPose(refSpace); if (pose) { this.reticle.visible = !this.placed || true; this.reticle.matrix.fromArray(pose.transform.matrix); } } else this.reticle.visible = false;
    } else if (!this.xr) {
      if (this.mode === "camera" && this.useOrient && this.orient) {   // 3-DoF orientation: the hologram appears to hold its direction as you turn the device
        const o = this.orient; const eul = new THREE.Euler(THREE.MathUtils.degToRad(o.b), THREE.MathUtils.degToRad(o.a - this.yawOffset), -THREE.MathUtils.degToRad(o.g), "YXZ");
        const q = new THREE.Quaternion().setFromEuler(eul); q.multiply(new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)));
        const ang = (screen.orientation?.angle ?? 0); q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -THREE.MathUtils.degToRad(ang))); this.camera.quaternion.copy(q); this.camera.position.set(0, 0, 0);
      } else { this.offset.lerp(new THREE.Vector2(this.ptr.x * 0.4, this.ptr.y * 0.25), 0.06); this.camera.position.set(this.offset.x, this.offset.y, 0.6); this.camera.lookAt(this.world.position.x, this.world.position.y, this.world.position.z); }
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.setAnimationLoop(null); this.ro.disconnect(); this.container.removeEventListener("pointermove", this.onMove); this.container.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("deviceorientation", this.onOrient); this.backdrop?.dispose(); this.prism.dispose(); void this.xr?.end().catch(() => undefined);
    this.scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose()); });
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
