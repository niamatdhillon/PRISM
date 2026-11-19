import { useEffect, useRef, useState } from "react";
import { PrismArt } from "./HeroArt";

/** Interactive 3D prism for the landing hero (lazy-loaded three.js). Falls back to the static SVG art without WebGL; static frame under reduced motion. */
export default function PrismHero3D() {
  const host = useRef<HTMLDivElement>(null); const [ready, setReady] = useState(false);
  useEffect(() => {
    let dispose: (() => void) | null = null; let dead = false;
    const ok = (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } })();
    if (!ok || !host.current) return;
    void Promise.all([import("three"), import("../spatial/prismObject")]).then(([THREE, { buildPrism }]) => {
      if (dead || !host.current) return; const el = host.current; const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.domElement.style.cssText = "width:100%;height:100%;display:block"; el.appendChild(renderer.domElement);
      const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 30); camera.position.set(0, 0, 5.2);
      const prism = buildPrism(1.25); scene.add(prism.group); prism.group.rotation.set(0.15, -0.35, 0);
      const pt = { x: 0, y: 0 }; const mv = (e: PointerEvent) => { pt.x = (e.clientX / window.innerWidth - 0.5) * 2; pt.y = (e.clientY / window.innerHeight - 0.5) * 2; }; window.addEventListener("pointermove", mv);
      const resize = () => { const w = el.clientWidth || 600, h = el.clientHeight || 500; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }; const ro = new ResizeObserver(resize); ro.observe(el); resize();
      let raf = 0; const draw = (t: number) => { prism.update(reduce ? 0 : t); prism.group.rotation.x = 0.15 + pt.y * 0.12; prism.group.rotation.y = -0.35 + pt.x * 0.3 + (reduce ? 0 : Math.sin(t * 0.0003) * 0.1); renderer.render(scene, camera); if (!reduce) raf = requestAnimationFrame(draw); };
      raf = requestAnimationFrame(draw); setReady(true);
      dispose = () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("pointermove", mv); prism.dispose(); renderer.dispose(); renderer.domElement.remove(); };
    }).catch(() => undefined);
    return () => { dead = true; dispose?.(); };
  }, []);
  return <>{!ready && <PrismArt />}<div ref={host} className="hero3d" aria-hidden /></>;
}
