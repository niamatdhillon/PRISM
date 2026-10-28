import { useEffect, useRef } from "react";

/** Lightweight canvas: drifting spectral wave lines + sparse particles. Static single frame under prefers-reduced-motion. */
export function SpectralField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, ctx = c.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, t = 0, w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const parts = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 1.6 + 0.3, v: Math.random() * 0.00006 + 0.00001 }));
    const resize = () => { w = c.clientWidth; h = c.clientHeight; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const cols = ["rgba(34,229,255,.22)", "rgba(106,139,255,.22)", "rgba(155,107,255,.2)", "rgba(255,123,213,.14)"];
      cols.forEach((col, k) => {
        ctx.beginPath(); ctx.strokeStyle = col; ctx.lineWidth = 1.2;
        for (let x = 0; x <= w; x += 10) {
          const y = h * (0.62 + k * 0.045) + Math.sin(x * 0.006 + t * 0.0006 + k) * 34 + Math.sin(x * 0.015 - t * 0.0004) * 12;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      parts.forEach((p) => { p.y -= p.v * 16; if (p.y < 0) p.y = 1; ctx.fillStyle = "rgba(200,220,255,.55)"; ctx.fillRect(p.x * w, p.y * h, p.s, p.s); });
    };
    const loop = (ts: number) => { t = ts; draw(); raf = requestAnimationFrame(loop); };
    resize(); window.addEventListener("resize", resize);
    if (reduce) draw(); else raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="fx" aria-hidden />;
}

/** Abstract prism: glass triangle splitting a white beam into spectral rays (pure SVG). */
export function PrismArt() {
  return (
    <svg className="hero-art" viewBox="0 0 800 560" aria-hidden>
      <defs>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#dfe9ff" stopOpacity=".9" /><stop offset=".35" stopColor="#4a7dff" stopOpacity=".55" /><stop offset=".7" stopColor="#1a2a7a" stopOpacity=".6" /><stop offset="1" stopColor="#9b6bff" stopOpacity=".7" /></linearGradient>
        <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#22e5ff" /></linearGradient>
        <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" stopOpacity=".95" /></linearGradient>
        {["#ff4d6d", "#ffb347", "#ffe66d", "#4be3a5", "#22e5ff", "#4a7dff", "#9b6bff"].map((c, i) => (
          <linearGradient key={i} id={`r${i}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={c} stopOpacity=".9" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient>
        ))}
        <filter id="glow"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      <g className="spin-slow">
        <polygon points="40,330 400,326 400,334" fill="url(#beam)" filter="url(#glow)" opacity=".8" />
        <polygon points="40,328 400,325 400,336" fill="url(#beam)" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const y2 = 190 + i * 48;
          return <polygon key={i} points={`470,${316 + i * 4} 800,${y2 - 9} 800,${y2 + 9} 470,${322 + i * 4}`} fill={`url(#r${i})`} style={{ mixBlendMode: "screen" }} />;
        })}
        <polygon points="400,120 560,420 240,420" fill="url(#glass)" stroke="url(#edge)" strokeWidth="2.5" />
        <polygon points="400,120 560,420 400,380" fill="rgba(255,255,255,.12)" />
        <polygon points="400,120 400,380 240,420" fill="rgba(34,229,255,.1)" />
        <polyline points="400,120 400,380 560,420" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1" />
        <circle cx="400" cy="120" r="6" fill="#fff" filter="url(#glow)" />
      </g>
    </svg>
  );
}
