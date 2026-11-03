// Dependency-free SVG charts. Every chart has a text alternative (aria-label) and an optional data table fallback.
import type { Any } from "../types";

const COL = ["#22e5ff", "#9b6bff", "#4be3a5", "#ffc857", "#ff7bd5", "#6a8bff"];
export interface BarDatum { label: string; value: number | null; ci?: [number, number] | null; n?: number }

export function BarChart({ data, unit = "", title, max, color = COL[0] }: { data: BarDatum[]; unit?: string; title: string; max?: number; color?: string }) {
  const W = 520, H = 230, L = 46, B = 38, T = 14, R = 10;
  const vals = data.flatMap((d) => [d.value ?? 0, d.ci ? d.ci[1] : 0]);
  const top = max ?? Math.max(1, ...vals) * 1.1;
  const bw = (W - L - R) / Math.max(1, data.length);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ` + data.map((d) => `${d.label} ${d.value ?? "no data"}${unit}`).join("; ")} width="100%">
      {[0, .25, .5, .75, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(top * f)} y2={y(top * f)} stroke="rgba(150,180,255,.12)" /><text x={L - 6} y={y(top * f) + 4} textAnchor="end">{Math.round(top * f)}</text></g>)}
      {data.map((d, i) => {
        const x = L + i * bw + bw * 0.2, w = bw * 0.6;
        return (
          <g key={d.label}>
            {d.value !== null && <rect x={x} y={y(d.value)} width={w} height={H - B - y(d.value)} rx={4} fill={color} opacity={0.85} />}
            {d.ci && <g stroke="#fff" strokeWidth={1.5}><line x1={x + w / 2} x2={x + w / 2} y1={y(d.ci[0])} y2={y(d.ci[1])} /><line x1={x + w / 2 - 5} x2={x + w / 2 + 5} y1={y(d.ci[1])} y2={y(d.ci[1])} /><line x1={x + w / 2 - 5} x2={x + w / 2 + 5} y1={y(d.ci[0])} y2={y(d.ci[0])} /></g>}
            <text x={x + w / 2} y={H - B + 15} textAnchor="middle">{d.label}</text>
            <text x={x + w / 2} y={H - B + 28} textAnchor="middle">{d.n !== undefined ? `n=${d.n}` : ""}</text>
            {d.value !== null && <text x={x + w / 2} y={y(d.value) - 6} textAnchor="middle" style={{ fill: "#fff" }}>{+d.value.toFixed(d.value < 10 ? 2 : 0)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function Histogram({ bins, title }: { bins: { x0: number; x1: number; n: number }[]; title: string }) {
  const W = 520, H = 200, L = 40, B = 28, T = 10, R = 8;
  const mx = Math.max(1, ...bins.map((b) => b.n));
  const bw = (W - L - R) / Math.max(1, bins.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${bins.reduce((a, b) => a + b.n, 0)} trials, range ${bins[0]?.x0}–${bins[bins.length - 1]?.x1} ms`} width="100%">
      {bins.map((b, i) => <rect key={i} x={L + i * bw + 1} width={bw - 2} y={T + (H - T - B) * (1 - b.n / mx)} height={(H - T - B) * (b.n / mx)} fill={COL[1]} opacity={0.85} />)}
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="rgba(150,180,255,.3)" />
      {[0, Math.floor(bins.length / 2), bins.length - 1].map((i) => bins[i] && <text key={i} x={L + i * bw + bw / 2} y={H - 10} textAnchor="middle">{bins[i].x0}ms</text>)}
      <text x={L - 6} y={T + 10} textAnchor="end">{mx}</text><text x={L - 6} y={H - B} textAnchor="end">0</text>
    </svg>
  );
}

export function Lines({ series, title, unit }: { series: { id: string; values: number[] }[]; title: string; unit: string }) {
  const W = 520, H = 220, L = 46, B = 28, T = 10, R = 10;
  const all = series.flatMap((s) => s.values);
  if (!all.length) return null;
  const lo = Math.min(...all) * 0.95, hi = Math.max(...all) * 1.05;
  const nmax = Math.max(...series.map((s) => s.values.length));
  const x = (i: number) => L + (i / Math.max(1, nmax - 1)) * (W - L - R);
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${series.length} participants, ${nmax} sessions max`} width="100%">
      {[0, .5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(lo + (hi - lo) * f)} y2={y(lo + (hi - lo) * f)} stroke="rgba(150,180,255,.12)" /><text x={L - 6} y={y(lo + (hi - lo) * f) + 4} textAnchor="end">{Math.round(lo + (hi - lo) * f)}</text></g>)}
      {series.map((s, k) => <polyline key={s.id} fill="none" stroke={COL[k % COL.length]} strokeWidth={1.6} opacity={0.8} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />)}
      <text x={W / 2} y={H - 6} textAnchor="middle">session # (chronological) · {unit}</text>
    </svg>
  );
}

export function ConfusionMatrix({ m, names = ["Negative", "Positive"] }: { m: number[][]; names?: string[] }) {
  const mx = Math.max(1, ...m.flat());
  const cell = (r: number, c: number) => {
    const v = m[r][c], right = r === c;
    return <g key={`${r}${c}`} transform={`translate(${110 + c * 120},${40 + r * 80})`}>
      <rect width={112} height={72} rx={8} fill={right ? "rgba(34,229,255," : "rgba(255,107,139,"} fillOpacity={0} style={{ fill: right ? `rgba(34,229,255,${0.1 + 0.6 * v / mx})` : `rgba(255,107,139,${0.08 + 0.5 * v / mx})` }} stroke="rgba(150,180,255,.25)" />
      <text x={56} y={38} textAnchor="middle" style={{ fill: "#fff", fontSize: 22 }}>{v}</text>
      <text x={56} y={58} textAnchor="middle">{right ? "correct" : r === 0 ? "false alarm" : "miss"}</text>
    </g>;
  };
  return (
    <svg viewBox="0 0 360 210" role="img" width="100%" style={{ maxWidth: 420 }}
      aria-label={`Confusion matrix: actual ${names[0]} predicted ${names[0]} ${m[0][0]}, actual ${names[0]} predicted ${names[1]} ${m[0][1]}, actual ${names[1]} predicted ${names[0]} ${m[1][0]}, actual ${names[1]} predicted ${names[1]} ${m[1][1]}`}>
      <text x={166} y={22} textAnchor="middle">PREDICTED</text>
      {names.map((n, i) => <text key={n} x={166 + (i - 0.5) * 120} y={36} textAnchor="middle">{n}</text>)}
      {names.map((n, i) => <text key={n + "r"} x={104} y={80 + i * 80} textAnchor="end">{n}</text>)}
      <text x={10} y={110} transform="rotate(-90 10 110)" textAnchor="middle">ACTUAL</text>
      {[0, 1].flatMap((r) => [0, 1].map((c) => cell(r, c)))}
    </svg>
  );
}

export function HBars({ data, title }: { data: { label: string; value: number }[]; title: string }) {
  const mx = Math.max(0.0001, ...data.map((d) => Math.abs(d.value)));
  return (
    <div role="img" aria-label={title + ": " + data.map((d) => `${d.label} ${d.value}`).join(", ")}>
      {data.map((d) => (
        <div key={d.label} style={{ display: "grid", gridTemplateColumns: "130px 1fr 56px", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</span>
          <div className="bar"><i style={{ width: `${(Math.abs(d.value) / mx) * 100}%`, background: d.value < 0 ? "linear-gradient(90deg,#ff7bd5,#9b6bff)" : undefined }} /></div>
          <span className="mono" style={{ textAlign: "right" }}>{d.value > 0 ? "+" : ""}{d.value}</span>
        </div>
      ))}
    </div>
  );
}
export type { Any };
