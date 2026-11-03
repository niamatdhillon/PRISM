"""Behavioural workload model trained ONLY on real PRISM participant sessions. There is no synthetic fallback: below the data thresholds
the pipeline returns an explicit INSUFFICIENT DATA state and reports no performance numbers."""
import hashlib
import json
from typing import Dict, List

import numpy as np

from . import analytics
from .ml_common import evaluate_nested

TLX_THRESHOLD = 50.0
MIN = {"sessions": 60, "participants": 20, "minority": 15}
FEATURES = ["vs_mean_rt", "vs_rt_sd", "vs_accuracy", "vs_timeouts", "inverse_efficiency", "arith_accuracy", "arith_mean_rt", "pattern_accuracy",
            "od_dprime", "ts_switch_cost_rt", "fl_congruency_rt", "device_phone", "device_tablet"]
EXCLUDED = ["tlx_* items and tlx_global (define the label)", "post_stress, perceived_difficulty (co-reported after the task with the label)", "condition variables are excluded in the primary model; see README"]


def build(records: List[dict]):
    rows = [analytics.session_metrics(r) for r in records if r["completed"]]
    rows = [r for r in rows if r["tlx_global"] is not None]
    X = []
    for r in rows:
        ie = (r["vs_mean_rt"] / r["vs_accuracy"]) if r["vs_mean_rt"] and r["vs_accuracy"] else None  # inverse efficiency score (Townsend & Ashby)
        X.append([r["vs_mean_rt"], r["vs_rt_sd"], r["vs_accuracy"], r["vs_timeouts"], ie, r["arith_accuracy"], r["arith_mean_rt"], r["pattern_accuracy"],
                  r.get("od_dprime"), r.get("ts_switch_cost_rt"), r.get("fl_congruency_rt"), float(r["device"] == "phone"), float(r["device"] == "tablet")])
    A = np.array([[np.nan if v is None else float(v) for v in row] for row in X], dtype=float).reshape(len(rows), len(FEATURES))
    y = np.array([int(r["tlx_global"] >= TLX_THRESHOLD) for r in rows])
    g = np.array([r["participant"] for r in rows])
    return A, y, g, rows


def evaluate(records: List[dict]) -> Dict:
    A, y, g, rows = build(records)
    n, ng = len(y), len(set(g))
    counts = {"low": int((y == 0).sum()), "high": int((y == 1).sum())}
    fp = hashlib.sha256(json.dumps(sorted(r["session_id"] for r in rows) + [TLX_THRESHOLD]).encode()).hexdigest()
    base = {"kind": "behavioural", "data_source": "PRISM participant observations (real, consented)", "target": f"high perceived workload: raw NASA-TLX >= {TLX_THRESHOLD:.0f}",
            "n_sessions": n, "n_participants": ng, "class_counts": counts, "features": FEATURES, "excluded": EXCLUDED, "data_fingerprint": fp, "thresholds": MIN}
    if n < MIN["sessions"] or ng < MIN["participants"] or (min(counts.values()) < MIN["minority"]):
        return {**base, "status": "insufficient_data", "label": "UNEVALUATED - INSUFFICIENT REAL DATA",
                "message": f"Needs >= {MIN['sessions']} completed sessions with TLX from >= {MIN['participants']} participants, with >= {MIN['minority']} in each class. "
                           f"Currently {n} sessions / {ng} participants / classes {counts}. No metric is reported because none can be validly estimated."}
    res = evaluate_nested(A, y, g, FEATURES)
    if res["status"] != "ok":
        return {**base, **res, "label": "UNEVALUATED"}
    return {**base, **res, "label": "TRAINED on real PRISM observations (exploratory, small sample)",
            "limitations": ["Self-selected participants, uncontrolled devices and environments.", "The label is a self-report threshold, not an objective measurement.",
                            "Repeated sessions per participant are kept together in splits (no participant leakage).", "No claim about stress, health or cognitive status."]}
