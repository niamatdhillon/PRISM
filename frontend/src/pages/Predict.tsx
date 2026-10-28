import { useEffect, useState } from "react";
import { api } from "../api";
import { store } from "../store";
import { useStatus } from "../App";
import { ConfusionMatrix, HBars } from "../components/Charts";
import { ErrorBox, Note, Spinner, Tabs } from "../components/ui";
import type { Any } from "../types";

const MODELS: Record<string, string> = { baseline_majority: "Majority-class baseline", logistic_regression: "Logistic regression (transparent)", random_forest: "Random forest" };

export default function Predict() {
  const { status } = useStatus();
  const [source, setSource] = useState<"synthetic" | "participant">("synthetic");
  const [fs, setFs] = useState("behaviour_only");
  const [res, setRes] = useState<Any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [f, setF] = useState({ mean_rt_ms: 450, rt_sd_ms: 120, accuracy: 0.9, error_rate: 0.08, timeouts: 0, arithmetic_accuracy: 0.85, device_phone: 0, device_tablet: 0 });
  const [pred, setPred] = useState<Any>(null);

  const run = async () => {
    setLoading(true); setErr(null);
    try { const recs = source === "participant" ? await store.list(status) : []; setRes(await api.mlEvaluate(source, recs)); } catch (e) { setErr(e); } finally { setLoading(false); }
  };
  useEffect(() => { if (status) void run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, source]);
  const predict = async () => { try { setPred(await api.mlPredict(f)); } catch (e) { setErr(e); } };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) });
  const cur = res?.status === "ok" ? res.feature_sets[fs] : null;

  return (
    <div className="wrap" style={{ paddingTop: 36 }}>
      <span className="kicker">Predictive analytics</span>
      <h2>Can behaviour predict perceived workload?</h2>
      <div className="panel">
        <h3>Prediction target</h3>
        <p>Binary classification of a <strong>session</strong>: <em>high</em> vs <em>low</em> perceived workload, where high means raw NASA-TLX ≥ 50. The 50-point cut-off is an arbitrary, documented convention, not a clinical threshold. Inputs are behavioural features (RT mean/SD, accuracy, error rate, timeouts, arithmetic accuracy, device); a second feature set adds the design conditions. TLX items and post-task stress are excluded because they define or co-occur with the label (leakage).</p>
        <p className="small">Evaluation: hold-out test set split <strong>by participant</strong> (no participant in both train and test), plus grouped 5-fold CV on the training part. A majority-class baseline is always shown.</p>
      </div>
      <div className="row mt"><Tabs value={source} onChange={(s) => setSource(s as typeof source)} tabs={[{ id: "synthetic", label: "Synthetic demo data" }, { id: "participant", label: "Participant data" }]} /></div>
      <ErrorBox error={err} />
      {loading && <Spinner label="Training and evaluating models…" />}

      {res && res.status === "insufficient_data" && (
        <Note kind="bad"><span className="badge b-bad">UNEVALUATED — insufficient data</span><p style={{ marginTop: 8 }}>{res.message}</p><p className="small">{res.provenance}</p></Note>
      )}

      {res && res.status === "ok" && (
        <>
          <div className={"note " + (source === "synthetic" ? "" : "info")}><span className={"badge " + (source === "synthetic" ? "b-synth" : "b-real")}>{res.label}</span><p style={{ marginTop: 8 }}>{res.provenance}</p>
            <p className="small mono">{res.n_sessions} sessions · {res.n_participants} participants · classes {JSON.stringify(res.class_counts)} · train {res.split.n_train_sessions} sessions/{res.split.n_train_participants} participants · test {res.split.n_test_sessions}/{res.split.n_test_participants} (test classes {JSON.stringify(res.split.test_class_counts)}) · seed {res.split.seed}</p></div>
          <Tabs value={fs} onChange={setFs} tabs={[{ id: "behaviour_only", label: "Behaviour-only features" }, { id: "behaviour_plus_condition", label: "Behaviour + design condition" }]} />
          <div className="panel scroll-x">
            <h3>Held-out test metrics</h3>
            <table><thead><tr><th>Model</th><th className="num">Accuracy</th><th className="num">Precision</th><th className="num">Recall</th><th className="num">F1</th><th className="num">ROC-AUC</th><th className="num">Bal. acc.</th><th className="num">CV F1 (train)</th></tr></thead>
              <tbody>{Object.entries(cur.models).map(([k, m]: [string, Any]) => <tr key={k}><td>{MODELS[k]}</td><td className="num">{m.accuracy}</td><td className="num">{m.precision}</td><td className="num">{m.recall}</td><td className="num">{m.f1}</td><td className="num">{m.roc_auc ?? "—"}</td><td className="num">{m.balanced_accuracy}</td><td className="num">{m.cv_f1_train_mean ?? "—"} ± {m.cv_f1_train_sd ?? "—"}</td></tr>)}</tbody></table>
            <small>Positive class = high workload. Precision: of sessions predicted high, the share truly high. Recall: of truly high sessions, the share found. F1: their harmonic mean. ROC-AUC: probability a random high session is scored above a random low one (0.5 = chance). The baseline always predicts the majority class, so its F1 is 0 — a model must beat that to mean anything.</small>
          </div>
          <div className="grid g2 mt">
            <div className="panel"><h3>Confusion matrix — logistic regression</h3><ConfusionMatrix m={cur.models.logistic_regression.confusion_matrix} /><small>Rows: actual; columns: predicted; test set only.</small></div>
            <div className="panel"><h3>Confusion matrix — random forest</h3><ConfusionMatrix m={cur.models.random_forest.confusion_matrix} /></div>
            <div className="panel"><h3>Logistic coefficients (standardised)</h3><HBars title="Logistic coefficients" data={cur.logistic_coefficients_standardised.map((c: Any) => ({ label: c.feature, value: c.coef }))} /><small>Sign = direction of association with “high workload”, holding the other features fixed. Not causal.</small></div>
            <div className="panel"><h3>Random-forest permutation importance (test)</h3><HBars title="Permutation importance" data={cur.rf_permutation_importance_test.map((c: Any) => ({ label: c.feature, value: c.mean }))} /><small>Drop in balanced accuracy when a feature is shuffled on the held-out set.</small></div>
          </div>
          <section className="block"><h3>Limitations</h3><ul className="clean">{res.limitations.map((l: string) => <li key={l}>{l}</li>)}{source === "synthetic" && <li>Because the data are simulated from simple formulas, reasonable-looking metrics here only confirm the pipeline works. They must not be quoted as evidence that behaviour predicts workload in people.</li>}</ul></section>
        </>
      )}

      <section className="block">
        <h3>Illustrative single-session prediction</h3>
        <Note>This uses a logistic model trained on the <strong>synthetic</strong> demo set. It illustrates how a trained model turns features into a probability — it is <strong>not</strong> a measurement of anyone’s workload.</Note>
        <div className="grid g4">
          {([["mean_rt_ms", "Mean RT (ms)", 200, 1200, 10], ["rt_sd_ms", "RT SD (ms)", 20, 500, 10], ["accuracy", "Accuracy", 0.3, 1, 0.01], ["error_rate", "Error rate", 0, 0.7, 0.01], ["timeouts", "Timeouts", 0, 24, 1], ["arithmetic_accuracy", "Arithmetic acc.", 0, 1, 0.05]] as const).map(([k, l, lo, hi, st]) => (
            <div key={k}><label htmlFor={k}>{l}: <span className="mono">{f[k]}</span></label><input id={k} type="range" min={lo} max={hi} step={st} value={f[k]} onChange={set(k)} /></div>
          ))}
          <div><label htmlFor="dp">Device is a phone</label><input id="dp" type="checkbox" checked={!!f.device_phone} onChange={(e) => setF({ ...f, device_phone: e.target.checked ? 1 : 0 })} style={{ width: 22, height: 22 }} /></div>
        </div>
        <div className="row mt"><button className="btn" onClick={predict}>Compute illustrative prediction</button>
          {pred && <span><span className="stat" style={{ fontSize: "2.4rem" }}>{Math.round(pred.probability_high_workload * 100)}%</span> <span className="small">modelled probability of “high workload”</span></span>}</div>
        {pred && <p className="small mt"><span className="badge b-synth">illustrative</span> {pred.label}</p>}
      </section>
    </div>
  );
}
