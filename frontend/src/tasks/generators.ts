// Pure stimulus generators (randomised STIMULI for the tasks; they never produce participant data). Unit-tested in generators.test.ts.
export type Rng = () => number;
export const shuffle = <T,>(a: T[], rng: Rng = Math.random): T[] => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

export interface FlankerSpec { trial_type: "congruent" | "incongruent"; center: "left" | "right"; stimulus: string }
export function flankerTrials(n: number, rng: Rng = Math.random): FlankerSpec[] {
  const types = shuffle(Array.from({ length: n }, (_, i) => (i % 2 === 0 ? "congruent" : "incongruent") as FlankerSpec["trial_type"]), rng);
  return types.map((t, i) => {
    const center: "left" | "right" = i % 4 < 2 ? "left" : "right";
    const c = center === "left" ? "←" : "→", f = t === "congruent" ? c : center === "left" ? "→" : "←";
    return { trial_type: t, center, stimulus: f + f + c + f + f };
  });
}

export interface SwitchSpec { trial_type: "first" | "repeat" | "switch"; rule: "colour" | "shape"; colour: "cyan" | "violet"; shape: "circle" | "diamond"; correct: string; stimulus: string }
export function switchingTrials(n: number, rng: Rng = Math.random): SwitchSpec[] {
  const out: SwitchSpec[] = []; let prev: "colour" | "shape" | null = null;
  for (let i = 0; i < n; i++) {
    const rule: "colour" | "shape" = prev === null ? (rng() < 0.5 ? "colour" : "shape") : i % 2 === 1 ? (prev === "colour" ? "shape" : "colour") : prev; // alternate-runs: switch on odd positions, repeat on even => ~50% switches
    const colour = rng() < 0.5 ? "cyan" : "violet", shape = rng() < 0.5 ? "circle" : "diamond";
    out.push({ trial_type: prev === null ? "first" : rule === prev ? "repeat" : "switch", rule, colour, shape, correct: rule === "colour" ? colour : shape, stimulus: `${rule}:${colour}-${shape}` });
    prev = rule;
  }
  return out;
}

export interface PatternSpec { trial_type: "progression" | "alternation" | "cycle"; seq: number[]; answer: number; options: number[]; stimulus: string }
export function patternItems(n: number, rng: Rng = Math.random): PatternSpec[] {
  const kinds: PatternSpec["trial_type"][] = ["progression", "alternation", "cycle"];
  return Array.from({ length: n }, (_, i) => {
    const kind = kinds[i % 3]; let seq: number[]; let answer: number;
    if (kind === "progression") { const a = 2 + Math.floor(rng() * 9), d = 2 + Math.floor(rng() * 6); seq = [a, a + d, a + 2 * d, a + 3 * d]; answer = a + 4 * d; }
    else if (kind === "alternation") { const a = 1 + Math.floor(rng() * 9), b = a + 2 + Math.floor(rng() * 7); seq = [a, b, a, b, a]; answer = b; }
    else { const a = 1 + Math.floor(rng() * 9), b = a + 1 + Math.floor(rng() * 5), c = b + 1 + Math.floor(rng() * 5); seq = [a, b, c, a, b]; answer = c; }
    const opts = new Set<number>([answer]);
    while (opts.size < 4) { const d = Math.floor(rng() * 7) - 3; if (d !== 0 && answer + d > 0) opts.add(answer + d); }
    return { trial_type: kind, seq, answer, options: shuffle([...opts], rng), stimulus: `${kind}:${seq.join(",")}` };
  });
}

export interface ArithSpec { q: string; truth: boolean }
export function arithmeticItems(n: number, rng: Rng = Math.random): ArithSpec[] {
  return Array.from({ length: n }, () => {
    const a = 12 + Math.floor(rng() * 28), b = 6 + Math.floor(rng() * 18), truth = rng() < 0.5;
    const shown = truth ? a + b : a + b + (rng() < 0.5 ? -1 : 1) * (1 + Math.floor(rng() * 3));
    return { q: `${a} + ${b} = ${shown}`, truth };
  });
}

export function oddballSequence(n: number, pDeviant = 0.25, rng: Rng = Math.random): ("standard" | "deviant")[] {
  const k = Math.round(n * pDeviant);
  // choose k non-adjacent positions: pick k of (n-k+1) slots, then shift slot i by i
  const slots = shuffle(Array.from({ length: n - k + 1 }, (_, i) => i), rng).slice(0, k).sort((a, b) => a - b).map((x, i) => x + i);
  const seq: ("standard" | "deviant")[] = Array(n).fill("standard"); slots.forEach((i) => { seq[i] = "deviant"; });
  return seq;
}
