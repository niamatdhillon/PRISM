import { describe, expect, it } from "vitest";
import { arithmeticItems, flankerTrials, oddballSequence, patternItems, switchingTrials } from "./generators";

const seeded = (s = 1) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

describe("stimulus generators", () => {
  it("flanker: 50% incongruent, centre arrow matches the declared direction, flankers oppose it on incongruent trials", () => {
    const t = flankerTrials(32, seeded(3));
    expect(t.filter((x) => x.trial_type === "incongruent")).toHaveLength(16);
    for (const x of t) { expect(x.stimulus[2]).toBe(x.center === "left" ? "←" : "→"); expect(x.stimulus[0] === x.stimulus[2]).toBe(x.trial_type === "congruent"); }
  });
  it("task switching: first trial flagged, ~50% switches, correct answer follows the rule", () => {
    const t = switchingTrials(32, seeded(5));
    expect(t[0].trial_type).toBe("first"); const sw = t.filter((x) => x.trial_type === "switch").length; expect(sw).toBeGreaterThan(12); expect(sw).toBeLessThan(20);
    for (const x of t) expect(x.correct).toBe(x.rule === "colour" ? x.colour : x.shape);
  });
  it("pattern items have a unique correct option among four", () => {
    for (const p of patternItems(30, seeded(9))) { expect(p.options).toHaveLength(4); expect(new Set(p.options).size).toBe(4); expect(p.options).toContain(p.answer); }
  });
  it("progression/alternation/cycle answers follow their rule", () => {
    const [a, b, c] = patternItems(3, seeded(2)); expect(a.answer - a.seq[3]).toBe(a.seq[1] - a.seq[0]); expect(b.answer).toBe(b.seq[1]); expect(c.answer).toBe(c.seq[2]);
  });
  it("arithmetic: truth flag matches the displayed equation", () => {
    for (const it of arithmeticItems(40, seeded(4))) { const m = it.q.match(/(\d+) \+ (\d+) = (\d+)/)!; expect(Number(m[1]) + Number(m[2]) === Number(m[3])).toBe(it.truth); }
  });
  it("oddball: 25% deviants and none back-to-back", () => {
    const s = oddballSequence(40, 0.25, seeded(8)); expect(s.filter((x) => x === "deviant")).toHaveLength(10);
    for (let i = 1; i < s.length; i++) expect(s[i] === "deviant" && s[i - 1] === "deviant").toBe(false);
  });
});
