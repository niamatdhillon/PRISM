import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { Trial, TaskId } from "../types";

export interface Choice { value: string; label: string; key?: string }
export interface TrialSpec { trial_type: string | null; stimulus: string; cue?: ReactNode; render: ReactNode; choices: Choice[]; correct: string; set_size?: number | null }
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const paint = () => new Promise<number>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now()))));  // timestamp after the stimulus has been painted

/** Generic speeded-choice runner. Practice trials give feedback and are not recorded; recorded trials return Trial rows. */
export function ChoiceTask({ task, practice, trials, timeoutMs = 3000, cueMs = 0, startIdx = 0, onFinish }: {
  task: TaskId; practice: TrialSpec[]; trials: TrialSpec[]; timeoutMs?: number; cueMs?: number; startIdx?: number; onFinish: (t: Trial[]) => void;
}) {
  const [stage, setStage] = useState<"fixation" | "cue" | "stim" | "feedback" | "idle">("idle");
  const [spec, setSpec] = useState<TrialSpec | null>(null);
  const [feedback, setFeedback] = useState(""); const [phase, setPhase] = useState<"practice" | "recorded">("practice"); const [n, setN] = useState(0);
  const resp = useRef<((v: string, ts: number) => void) | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; resp.current = null; }; }, []);

  const press = useCallback((v: string, ts: number) => resp.current?.(v, ts), []);
  const current = useRef<TrialSpec | null>(null); current.current = spec;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { const c = current.current?.choices.find((x) => x.key && x.key.toLowerCase() === e.key.toLowerCase()); if (c) { e.preventDefault(); press(c.value, e.timeStamp); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [press]);

  useEffect(() => {
    (async () => {
      const out: Trial[] = []; let idx = startIdx;
      for (const ph of ["practice", "recorded"] as const) {
        const list = ph === "practice" ? practice : trials; setPhase(ph);
        for (let i = 0; i < list.length; i++) {
          const s = list[i]; setN(i + 1); setSpec(s); setFeedback(""); setStage("fixation"); await sleep(500 + Math.random() * 400); if (!alive.current) return;
          if (s.cue) { setStage("cue"); await sleep(cueMs); if (!alive.current) return; }
          const first = paint(); setStage("stim"); const onset = await first;
          const got = await new Promise<{ v: string | null; ts: number }>((res) => {
            const t = setTimeout(() => { resp.current = null; res({ v: null, ts: performance.now() }); }, timeoutMs);
            resp.current = (v, ts) => { clearTimeout(t); resp.current = null; res({ v, ts }); };
          });
          if (!alive.current) return;
          const rt = got.v === null ? null : Math.max(0, Math.round((got.ts - onset) * 10) / 10), correct = got.v === null ? null : got.v === s.correct;
          setStage("feedback"); setFeedback(got.v === null ? "Too slow ⏱" : correct ? "Correct ✓" : "Incorrect ✗");
          if (ph === "recorded") out.push({ idx: idx++, task, block: 0, modality: "visual", trial_type: s.trial_type, set_size: s.set_size ?? null, stimulus: s.stimulus, response: got.v, correct, rt_ms: rt,
            onset_epoch_ms: Math.round((performance.timeOrigin + onset) * 10) / 10, timeout: got.v === null, anticipatory: rt !== null && rt < 150 });
          await sleep(ph === "practice" ? 700 : 300);
        }
      }
      if (alive.current) onFinish(out);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="panel" aria-live="polite">
      <div className="row spread mono small"><span>{phase === "practice" ? "PRACTICE · not recorded" : "RECORDED"}</span><span>{n}/{phase === "practice" ? practice.length : trials.length}</span></div>
      <div className="taskstage">
        {stage === "fixation" && <div className="fix" aria-label="fixation cross">+</div>}
        {stage === "cue" && spec?.cue}
        {stage === "stim" && <>{spec?.cue && <div className="cue-small">{spec.cue}</div>}{spec?.render}</>}
        {stage === "feedback" && <div className="mono" style={{ color: "var(--cyan)", fontSize: "1.2rem" }}>{feedback}</div>}
      </div>
      <div className="answers" style={{ gridTemplateColumns: `repeat(${Math.min(4, spec?.choices.length ?? 2)}, 1fr)` }}>
        {spec?.choices.map((c) => <button key={c.value} className="btn" disabled={stage !== "stim"} onClick={(e) => press(c.value, e.nativeEvent.timeStamp)}>{c.label}{c.key ? <small> ({c.key.toUpperCase()})</small> : null}</button>)}
      </div>
    </div>
  );
}
