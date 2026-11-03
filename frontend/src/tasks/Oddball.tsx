import { useEffect, useRef, useState } from "react";
import { Tone } from "../components/fieldEngine";
import type { Trial } from "../types";
import { oddballSequence } from "./generators";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const STD = 440, DEV = 660;

/** Auditory oddball: respond to the rare higher tone. A press within 1 s after a tone onset is attributed to that tone. */
export function Oddball({ tone, startIdx = 0, onFinish }: { tone: Tone; startIdx?: number; onFinish: (t: Trial[]) => void }) {
  const [phase, setPhase] = useState<"practice" | "recorded">("practice"); const [n, setN] = useState(0); const [total, setTotal] = useState(4); const [flash, setFlash] = useState("");
  const pressRef = useRef<((ts: number) => void) | null>(null); const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.code === "Space") { e.preventDefault(); pressRef.current?.(e.timeStamp); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => {
    (async () => {
      const out: Trial[] = []; let idx = startIdx;
      for (const ph of ["practice", "recorded"] as const) {
        const seq = ph === "practice" ? ["standard", "deviant", "standard", "deviant"] as const : oddballSequence(40); setPhase(ph); setTotal(seq.length);
        for (let i = 0; i < seq.length; i++) {
          setN(i + 1); await sleep(800 + Math.random() * 600); if (!alive.current) return;
          const kind = seq[i]; const onset = performance.now(); tone.beep(kind === "deviant" ? DEV : STD, 0.1);
          const pressed = await new Promise<number | null>((res) => { const t = setTimeout(() => { pressRef.current = null; res(null); }, 1000); pressRef.current = (ts) => { clearTimeout(t); pressRef.current = null; res(ts); }; });
          if (!alive.current) return;
          const hit = pressed !== null, rt = hit ? Math.round((pressed as number - onset) * 10) / 10 : null, correct = (kind === "deviant") === hit;
          setFlash(ph === "practice" ? (correct ? "Correct ✓" : kind === "deviant" ? "Missed the higher tone" : "That was the standard tone") : "");
          if (ph === "recorded") out.push({ idx: idx++, task: "auditory_oddball", block: 0, modality: "auditory", trial_type: kind, set_size: null, stimulus: kind, response: hit ? "press" : null, correct, rt_ms: rt,
            onset_epoch_ms: Math.round((performance.timeOrigin + onset) * 10) / 10, timeout: false, anticipatory: rt !== null && rt < 100 });
          if (ph === "practice") await sleep(500);
        }
      }
      if (alive.current) onFinish(out);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="panel" aria-live="polite">
      <div className="row spread mono small"><span>{phase === "practice" ? "PRACTICE · not recorded" : "RECORDED"}</span><span>{n}/{total}</span></div>
      <div className="taskstage"><div className="mono" style={{ fontSize: "1.1rem", color: "var(--cyan)" }}>🔊 Listen… press only for the HIGHER tone</div><div className="mono small">{flash}</div></div>
      <div className="answers" style={{ gridTemplateColumns: "1fr" }}><button className="btn" onClick={(e) => pressRef.current?.(e.nativeEvent.timeStamp)}>Higher tone! <small>(SPACE)</small></button></div>
    </div>
  );
}
