// Pseudo-3D "spatial" search field rendered on a 2D canvas (depth-scaled, parallax drift, perspective floor grid).
// Task: find the CYAN DIAMOND among cyan circles and violet diamonds (conjunction search) and report its side.
export interface FieldConfig { complexity: 0 | 1 | 2; movement: boolean; distraction: boolean; }
export const SET_SIZES = [6, 18, 36] as const;
interface Item { x: number; y: number; z: number; vx: number; vy: number; shape: "circle" | "diamond"; col: string; ph: number; }

export class FieldEngine {
  private items: Item[] = []; private cfg: FieldConfig; private raf = 0; private canvas: HTMLCanvasElement; private ctx: CanvasRenderingContext2D;
  private target: (Item & { side: "left" | "right" }) | null = null; private onset: ((t: number) => void) | null = null;
  private fixation = false; private last = 0; private reduce: boolean; private w = 0; private h = 0;

  constructor(canvas: HTMLCanvasElement, cfg: FieldConfig) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d")!; this.cfg = cfg;
    this.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.populate(); this.resize();
    const loop = (t: number) => { this.frame(t); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
    window.addEventListener("resize", this.resize);
  }
  destroy() { cancelAnimationFrame(this.raf); window.removeEventListener("resize", this.resize); }
  resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.canvas.clientWidth; this.h = this.canvas.clientHeight;
    this.canvas.width = this.w * dpr; this.canvas.height = this.h * dpr; this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  setConfig(cfg: FieldConfig) { const re = cfg.complexity !== this.cfg.complexity; this.cfg = cfg; if (re) this.populate(); }
  setFixation(on: boolean) { this.fixation = on; }
  private populate() {
    const n = SET_SIZES[this.cfg.complexity];
    this.items = Array.from({ length: n }, (_, i) => {
      const diamond = i % 2 === 0;
      return { x: Math.random() * 1.9 - 0.95, y: Math.random() * 1.3 - 0.65, z: Math.random(), vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.08,
        shape: diamond ? "diamond" : "circle", col: diamond ? "#9b6bff" : "#22b8e0", ph: Math.random() * 6 } as Item;
    });
  }
  showTarget(side: "left" | "right", cb: (t: number) => void) {
    const x = (side === "left" ? -1 : 1) * (0.2 + Math.random() * 0.65);
    this.target = { x, y: Math.random() * 1.1 - 0.55, z: 0.35, vx: (Math.random() - 0.5) * 0.06, vy: (Math.random() - 0.5) * 0.05, shape: "diamond", col: "#22e5ff", ph: 0, side };
    this.onset = cb;
  }
  clearTarget() { this.target = null; this.onset = null; }

  private proj(it: { x: number; y: number; z: number }) {
    const s = 0.55 + 0.7 * (1 - it.z);
    return { px: this.w / 2 + it.x * this.w * 0.46 * (0.8 + 0.2 * s), py: this.h * 0.5 + it.y * this.h * 0.5 * (0.8 + 0.2 * s), r: Math.min(this.w, this.h) * 0.045 * s };
  }
  private shape(it: Item, strong = false) {
    const { px, py, r } = this.proj(it), c = this.ctx;
    c.fillStyle = it.col; c.strokeStyle = strong ? "#fff" : "rgba(255,255,255,.35)"; c.lineWidth = strong ? 2.5 : 1; c.globalAlpha = strong ? 1 : 0.55 + 0.4 * (1 - it.z);
    c.beginPath();
    if (it.shape === "circle") c.arc(px, py, r, 0, 6.283); else { c.moveTo(px, py - r * 1.25); c.lineTo(px + r, py); c.lineTo(px, py + r * 1.25); c.lineTo(px - r, py); c.closePath(); }
    c.fill(); c.stroke(); c.globalAlpha = 1;
  }
  private frame(t: number) {
    const c = this.ctx, w = this.w, h = this.h, dt = Math.min(0.05, (t - this.last) / 1000 || 0); this.last = t;
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#04061a"); g.addColorStop(0.55, "#0a1440"); g.addColorStop(1, "#02030a");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // perspective floor grid
    c.strokeStyle = "rgba(80,130,255,.22)"; c.lineWidth = 1;
    const hz = h * 0.62;
    for (let i = -8; i <= 8; i++) { c.beginPath(); c.moveTo(w / 2 + i * 12, hz); c.lineTo(w / 2 + i * w * 0.14, h); c.stroke(); }
    for (let k = 1; k <= 7; k++) { const y = hz + (h - hz) * Math.pow(k / 7, 2); c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    const move = this.cfg.movement;
    for (const it of this.items) {
      if (move) {
        it.x += it.vx * dt; it.y += it.vy * dt; it.ph += dt;
        it.z = Math.min(1, Math.max(0, it.z + Math.sin(it.ph) * 0.05 * dt));
        if (it.x > 0.97) it.x = -0.95; if (it.x < -0.97) it.x = 0.95; if (it.y > 0.7) it.y = -0.65; if (it.y < -0.7) it.y = 0.65;
      }
      this.shape(it);
    }
    if (this.target) {
      const tg = this.target;
      if (move) { tg.x += tg.vx * dt; tg.y += tg.vy * dt; tg.x = tg.side === "left" ? Math.min(-0.15, Math.max(-0.9, tg.x)) : Math.max(0.15, Math.min(0.9, tg.x)); tg.y = Math.max(-0.6, Math.min(0.6, tg.y)); }
      this.shape(tg, true);
    }
    if (this.fixation) { c.strokeStyle = "#fff"; c.lineWidth = 2; c.beginPath(); c.moveTo(w / 2 - 12, h / 2); c.lineTo(w / 2 + 12, h / 2); c.moveTo(w / 2, h / 2 - 12); c.lineTo(w / 2, h / 2 + 12); c.stroke(); }
    if (this.cfg.distraction) { // slow (2 Hz), low-contrast irrelevant flicker + peripheral decoy flashes
      const on = Math.floor(t / 250) % 2 === 0;
      c.fillStyle = on ? "rgba(255,120,220,.10)" : "rgba(0,0,0,0)"; c.fillRect(0, 0, w, h);
      if (on) { c.fillStyle = "rgba(255,200,87,.35)"; c.fillRect(((Math.floor(t / 500) * 137) % 100) / 100 * (w - 30), 8, 22, 22); }
    }
    if (this.target && this.onset) { const cb = this.onset; this.onset = null; cb(performance.now()); }
  }
}

export class Tone {
  private ctx: AudioContext | null = null; private gain: GainNode | null = null; volume = 0.3;
  ensure() {
    if (!this.ctx) { const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; if (!AC) return false; this.ctx = new AC(); this.gain = this.ctx.createGain(); this.gain.connect(this.ctx.destination); }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return true;
  }
  beep() {
    if (!this.ensure() || !this.ctx || !this.gain) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime;
    o.frequency.value = 880; g.gain.setValueAtTime(this.volume, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + 0.1);
  }
}
