import { useEffect, useState } from "react";
import { api, download } from "../api";
import { BarChart, HBars, Histogram, Lines } from "../components/Charts";
import { ChartCard, Empty, ErrorBox, Note, Spinner, fmt } from "../components/ui";
import type { Any } from "../types";

const bars = (rows: Any[], key: string, ci: string, nk: string): Any[] => rows.map((r) => ({ label: r.label.split(" ")[0], value: r[key], ci: r[ci], n: r[nk] }));
const testLine = (t: Any) => (t.status !== "ok" ? `${t.test ?? ""} n=${t.n}: ${t.note}` : t.rho !== undefined ? `Spearman ρ=${t.rho}, n=${t.n}, p=${t.p}` : `${t.test}: n=${t.n}, median ${t.median}, p=${t.p ?? "n/a"}`);

export default function Dashboard() {
  const [ov, setOv] = useState<Any>(null); const [a, setA] = useState<Any>(null); const [err, setErr] = useState<unknown>(null);
  useEffect(() => { Promise.all([api.admin.overview(), api.admin.analytics()]).then(([o, x]) => { setOv(o); setA(x); }).catch(setErr); }, []);
  const exp = async (kind: "sessions" | "trials", f: "csv" | "json") => download(`prism-${kind}.${f}`, await api.admin.export(kind, f), f === "csv" ? "text/csv" : "application/json");
  if (err) return <ErrorBox error={err} />;
  if (!a || !ov) return <Spinner />;
  const n = a.n_completed;
  return (
    <>
      <Note kind="info"><strong>All figures come exclusively from consented PRISM participant sessions in the database.</strong> There is no demonstration or simulated data in this application. Public datasets are analysed separately (Datasets / Prediction); literature is used only for RAG.</Note>
      {!ov.collection_open && <Note kind="bad"><strong>Data collection is closed</strong> (no ethics approval recorded). Record it under Study &amp; Ollama before participants can enrol.</Note>}
      <div className="grid g4">
        {[["participants", ov.participants], ["completed sessions", ov.completed_sessions], ["trials recorded", ov.trials], ["reflections", ov.reflections]].map(([l, v]) => <div className="panel" key={l as string}><div className="stat">{v as number}</div><div className="stat-l">{l}</div></div>)}</div>
      <div className="row mt"><button className="btn sm" disabled={!n} onClick={() => exp("sessions", "csv")}>Export sessions CSV</button><button className="btn sm ghost" disabled={!n} onClick={() => exp("trials", "csv")}>Export trials CSV</button><button className="btn sm ghost" disabled={!n} onClick={() => exp("sessions", "json")}>Export JSON</button></div>
      {n === 0 ? <Empty>No completed participant sessions yet, so there is nothing to analyse. Charts appear only when real data exists.</Empty> : (
        <>
          <h3 className="mt2">Descriptive statistics</h3>
          <div className="grid g2">
            <ChartCard title="Visual-search RT by complexity" source="prism" n={a.by_complexity.reduce((s: number, r: Any) => s + r.n_rt, 0)} limits="mean of session means; whiskers 95% CI (n ≥ 3)"><BarChart title="RT by complexity" unit=" ms" data={bars(a.by_complexity, "vs_mean_rt", "rt_ci95", "n_rt")} /></ChartCard>
            <ChartCard title="Visual-search accuracy by complexity" source="prism" n={n} limits="timeouts count as errors"><BarChart title="Accuracy" max={1} data={bars(a.by_complexity, "accuracy", "accuracy_ci95", "n_sessions")} /></ChartCard>
            <ChartCard title="Raw NASA-TLX by complexity" source="prism" n={a.by_complexity.reduce((s: number, r: Any) => s + r.n_tlx, 0)} limits="sessions with all six items"><BarChart title="TLX" max={100} color="#9b6bff" data={bars(a.by_complexity, "tlx", "tlx_ci95", "n_tlx")} /></ChartCard>
            <ChartCard title="Stress change (post − pre) by condition" source="prism" n={a.by_distraction.reduce((s: number, r: Any) => s + r.n_stress, 0)} limits="self-report; first two bars distraction, last two movement"><BarChart title="Stress delta" color="#ffc857" data={[...a.by_distraction, ...a.by_movement].map((r: Any) => ({ label: r.label.replace("No distraction", "No distr.").replace("Distraction", "Distract."), value: r.stress_delta, ci: r.stress_delta_ci95, n: r.n_stress }))} /></ChartCard>
            <ChartCard title="Trial RT distribution (visual search)" source="prism" n={a.rt_histogram.n_trials} unit="trials" limits="correct, non-anticipatory trials; all devices pooled"><Histogram bins={a.rt_histogram.bins} title="RT histogram" /></ChartCard>
            <ChartCard title="NASA-TLX subscale means" source="prism" n={Object.values(a.tlx_subscales).filter((v) => v !== null).length ? n : 0}><HBars title="TLX subscales" data={Object.entries(a.tlx_subscales).filter(([, v]) => v !== null).map(([k, v]) => ({ label: k.replace("tlx_", ""), value: v as number }))} /></ChartCard>
          </div>
          <h3 className="mt2">Other tasks (descriptive)</h3>
          <div className="scroll-x panel"><table><thead><tr><th>Task</th><th className="num">Sessions</th><th>Summary</th></tr></thead><tbody>
            <tr><td>Auditory oddball</td><td className="num">{a.task_summaries.auditory_oddball.n}</td><td>mean d′ {fmt(a.task_summaries.auditory_oddball.mean_dprime, 2)}, hit rate {fmt(a.task_summaries.auditory_oddball.mean_hit_rate, 2)}, false-alarm rate {fmt(a.task_summaries.auditory_oddball.mean_fa_rate, 2)}</td></tr>
            <tr><td>Task switching</td><td className="num">{a.task_summaries.task_switching.n}</td><td>mean switch cost {fmt(a.task_summaries.task_switching.mean_switch_cost_rt, 0)} ms</td></tr>
            <tr><td>Flanker</td><td className="num">{a.task_summaries.flanker.n}</td><td>mean congruency effect {fmt(a.task_summaries.flanker.mean_congruency_rt, 0)} ms</td></tr>
            <tr><td>Pattern recognition</td><td className="num">{a.task_summaries.pattern.n}</td><td>mean accuracy {fmt(a.task_summaries.pattern.mean_accuracy, 2)}</td></tr></tbody></table></div>
          <h3 className="mt2">Condition comparisons (descriptive)</h3>
          <div className="scroll-x panel"><table><thead><tr><th>Level</th><th className="num">Sessions</th><th className="num">Participants</th><th className="num">RT ms</th><th className="num">Acc.</th><th className="num">TLX</th><th className="num">Δ stress</th></tr></thead>
            <tbody>{[...a.by_complexity, ...a.by_movement, ...a.by_distraction, ...a.by_display_mode, ...a.by_device].map((r: Any, i: number) => <tr key={i}><td>{r.label}</td><td className="num">{r.n_sessions}</td><td className="num">{r.n_participants}</td><td className="num">{fmt(r.vs_mean_rt, 0)}</td><td className="num">{fmt(r.accuracy, 2)}</td><td className="num">{fmt(r.tlx)} <small>(n={r.n_tlx})</small></td><td className="num">{fmt(r.stress_delta)} <small>(n={r.n_stress})</small></td></tr>)}</tbody></table></div>
          <h3 className="mt2">Inferential statistics (exploratory)</h3>
          <div className="panel"><ul className="clean small">{Object.entries(a.tests).map(([k, t]) => <li key={k}><strong>{k.replace(/_/g, " ")}:</strong> {testLine(t as Any)}</li>)}</ul><small>{a.tests_note}</small></div>
          <h3 className="mt2">Participant-level trends (exploratory)</h3>
          {a.longitudinal.length === 0 ? <Empty>Needs participants with ≥ 3 completed sessions.</Empty> : <ChartCard title="Mean visual-search RT per session, by participant" source="prism" n={a.longitudinal.length} unit="participants" limits="conditions varied between sessions; descriptive only"><Lines title="Within-person RT" unit="ms" series={a.longitudinal.slice(0, 8).map((l: Any) => ({ id: l.participant, values: l.series }))} /></ChartCard>}
          <h3 className="mt2">Data quality</h3>
          <div className="panel"><ul className="clean small"><li>Incomplete sessions: {a.missing.incomplete}</li><li>Completed sessions missing TLX: {a.missing.missing_tlx}</li><li>Missing pre/post stress pair: {a.missing.missing_stress_pair}</li><li>No reflection: {a.missing.no_reflection}</li></ul></div>
        </>)}
    </>
  );
}
