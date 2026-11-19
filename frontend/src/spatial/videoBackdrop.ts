// Renders a live <video> (camera) INSIDE the WebGL scene as a VideoTexture on a camera-locked plane, with a holographic tint, scan-lines and
// a vignette. The 3D objects share the same scene/depth buffer as the camera image, so overlays are composited by the renderer, not by CSS.
import * as THREE from "three";

export class VideoBackdrop {
  readonly group = new THREE.Group();
  private tex: THREE.VideoTexture; private plane: THREE.Mesh; private scan: THREE.Mesh; private vignette: THREE.Mesh; private mirror = false; private video: HTMLVideoElement;
  private camera: THREE.PerspectiveCamera; private dist = 30;

  constructor(video: HTMLVideoElement, camera: THREE.PerspectiveCamera, mirror: boolean) {
    this.video = video; this.camera = camera; this.mirror = mirror;
    this.tex = new THREE.VideoTexture(video); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.tex, color: 0xcfe0ff, depthWrite: false, depthTest: false }));
    this.plane.renderOrder = -10;
    // scan-lines (procedural canvas texture): subtle, static, cheap
    const c = document.createElement("canvas"); c.width = 4; c.height = 4; const g = c.getContext("2d");
    if (g) { g.fillStyle = "rgba(0,0,0,0)"; g.fillRect(0, 0, 4, 4); g.fillStyle = "rgba(20,60,160,0.16)"; g.fillRect(0, 0, 4, 1); }
    const st = new THREE.CanvasTexture(c); st.wrapS = st.wrapT = THREE.RepeatWrapping; st.repeat.set(1, 140); st.magFilter = THREE.NearestFilter;
    this.scan = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, depthTest: false })); this.scan.renderOrder = -9;
    const vc = document.createElement("canvas"); vc.width = vc.height = 128; const vg = vc.getContext("2d");
    if (vg) { const r = vg.createRadialGradient(64, 64, 30, 64, 64, 92); r.addColorStop(0, "rgba(2,6,20,0)"); r.addColorStop(1, "rgba(2,6,20,0.72)"); vg.fillStyle = r; vg.fillRect(0, 0, 128, 128); }
    this.vignette = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(vc), transparent: true, depthWrite: false, depthTest: false })); this.vignette.renderOrder = -8;
    for (const m of [this.plane, this.scan, this.vignette]) { m.position.z = -this.dist; this.group.add(m); }
    camera.add(this.group); this.layout();
  }

  /** Cover-fit the video to the view frustum at the backdrop distance. Call on resize / when video metadata is ready. */
  layout() {
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.dist, w = h * this.camera.aspect;
    const va = this.video.videoWidth && this.video.videoHeight ? this.video.videoWidth / this.video.videoHeight : 16 / 9;
    let pw = w, ph = w / va; if (ph < h) { ph = h; pw = h * va; }
    this.plane.scale.set(pw * (this.mirror ? -1 : 1), ph, 1); this.scan.scale.set(w, h, 1); this.vignette.scale.set(w, h, 1);
  }
  setMirror(m: boolean) { this.mirror = m; this.layout(); }
  get ready() { return this.video.readyState >= 2 && this.video.videoWidth > 0; }
  dispose() { this.camera.remove(this.group); this.tex.dispose(); for (const m of [this.plane, this.scan, this.vignette]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } }
}
