"""Descriptive + exploratory inferential statistics computed from session records (never hard-coded)."""
import math
from collections import defaultdict
from statistics import mean, median, pstdev, stdev
from typing import Dict, List, Optional

from scipy import stats

from .schema import SessionRecord, tlx_global

TLX_KEYS = ["tlx_mental", "tlx_physical", "tlx_temporal", "tlx_performance", "tlx_effort", "tlx_frustration"]
COMPLEXITY_LABEL = {0: "Low (6 items)", 1: "Medium (18)", 2: "High (36)"}


def _m(v):  return round(mean(v), 2) if v else None
def _sd(v): return round(stdev(v), 2) if len(v) > 1 else None
def _ci(v):
    if len(v) < 3: return None
    h = stats.t.ppf(0.975, len(v) - 1) * stdev(v) / math.sqrt(len(v))
    return [round(mean(v) - h, 2), round(mean(v) + h, 2)]


def parse(records: List[dict]) -> List[SessionRecord]:
    return [SessionRecord(**r) for r in records]


def valid_target_rts(rec: SessionRecord, modality: Optional[str] = None) -> List[float]:
    return [t.rt_ms for t in rec.trials if t.kind == "target" and t.rt_ms is not None and t.correct and not t.anticipatory
            and (modality is None or t.modality == modality)]


def session_metrics(rec: SessionRecord) -> Dict:
    tg = [t for t in rec.trials if t.kind == "target"]
    ar = [t for t in rec.trials if t.kind == "arithmetic"]
    rts = valid_target_rts(rec)
    answered = [t for t in tg if not t.timeout]
    c = rec.condition
    r = rec.ratings
    return {
        "session_id": rec.session_id, "participant_id": rec.participant_id, "source": rec.source, "created_at": rec.created_at,
        "device": rec.device, "completed": rec.completed, "complexity": c.complexity, "movement": c.movement,
        "distraction": c.distraction, "audio_enabled": c.audio_enabled,
        "n_target_trials": len(tg), "mean_rt_ms": _m(rts), "median_rt_ms": round(median(rts), 1) if rts else None,
        "rt_sd_ms": _sd(rts), "rt_cv": round(stdev(rts) / mean(rts), 3) if len(rts) > 1 else None,
        "accuracy": round(sum(bool(t.correct) for t in tg) / len(tg), 3) if tg else None,
        "error_rate": round(sum(t.correct is False for t in answered) / len(answered), 3) if answered else None,
        "timeouts": sum(t.timeout for t in tg), "anticipatory": sum(t.anticipatory for t in tg),
        "arithmetic_accuracy": round(sum(bool(t.correct) for t in ar) / len(ar), 3) if ar else None,
        "tlx_global": round(tlx_global(r), 2) if tlx_global(r) is not None else None,
        "pre_stress": r.pre_stress, "post_stress": r.post_stress,
        "stress_delta": (r.post_stress - r.pre_stress) if (r.pre_stress is not None and r.post_stress is not None) else None,
        "has_reflection": bool(rec.reflection and rec.reflection.strip()),
    }


def _group(rows: List[Dict], key) -> Dict:
    g = defaultdict(list)
    for r in rows:
        g[key(r)].append(r)
    return g


def _cond_table(rows: List[Dict], key, labels=None) -> List[Dict]:
    out = []
    for k, rs in sorted(_group(rows, key).items(), key=lambda kv: str(kv[0])):
        rt = [r["mean_rt_ms"] for r in rs if r["mean_rt_ms"] is not None]
        acc = [r["accuracy"] for r in rs if r["accuracy"] is not None]
        tlx = [r["tlx_global"] for r in rs if r["tlx_global"] is not None]
        sd = [r["stress_delta"] for r in rs if r["stress_delta"] is not None]
        out.append({"level": k, "label": (labels or {}).get(k, str(k)), "n_sessions": len(rs),
                    "n_participants": len({r["participant_id"] for r in rs}),
                    "mean_rt_ms": _m(rt), "rt_ci95": _ci(rt), "accuracy": _m(acc), "accuracy_ci95": _ci(acc),
                    "tlx_global": _m(tlx), "tlx_ci95": _ci(tlx), "n_tlx": len(tlx),
                    "stress_delta": _m(sd), "stress_delta_ci95": _ci(sd), "n_stress": len(sd)})
    return out


def _spearman(x, y):
    pairs = [(a, b) for a, b in zip(x, y) if a is not None and b is not None]
    if len(pairs) < 8 or len({a for a, _ in pairs}) < 2:
        return {"n": len(pairs), "note": "fewer than 8 usable pairs or no variation: not computed"}
    rho, p = stats.spearmanr([a for a, _ in pairs], [b for _, b in pairs])
    return {"n": len(pairs), "rho": round(float(rho), 3), "p": float(f"{p:.3g}")}


def _paired(a, b, label):
    pairs = [(x, y) for x, y in zip(a, b) if x is not None and y is not None]
    if len(pairs) < 6:
        return {"test": label, "n": len(pairs), "note": "fewer than 6 pairs: not computed"}
    d = [y - x for x, y in pairs]
    if all(v == 0 for v in d):
        return {"test": label, "n": len(pairs), "median_diff": 0, "note": "no differences"}
    w = stats.wilcoxon([x for x, _ in pairs], [y for _, y in pairs])
    return {"test": label, "n": len(pairs), "median_diff": round(median(d), 2), "mean_diff": round(mean(d), 2), "p": float(f"{w.pvalue:.3g}")}


def analyse_source(recs: List[SessionRecord]) -> Dict:
    rows = [session_metrics(r) for r in recs]
    done = [r for r in rows if r["completed"]]
    by_id = {r.session_id: r for r in recs}
    all_rts = [rt for r in recs if r.completed for rt in valid_target_rts(r)]
    hist = []
    if all_rts:
        lo, hi, nb = 150, 1500, 27
        w = (hi - lo) / nb
        counts = [0] * nb
        for v in all_rts:
            counts[min(nb - 1, max(0, int((v - lo) / w)))] += 1
        hist = [{"x0": round(lo + i * w), "x1": round(lo + (i + 1) * w), "n": c} for i, c in enumerate(counts)]
    # M3 multisensory: within-session visual vs audiovisual block RT
    vis, av = [], []
    for r in recs:
        if r.completed and r.condition.audio_enabled:
            a, b = valid_target_rts(r, "visual"), valid_target_rts(r, "audiovisual")
            if a and b:
                vis.append(mean(a)); av.append(mean(b))
    # M4 within-person: participants with >=3 completed sessions
    byp = _group(done, lambda r: r["participant_id"])
    longitudinal = []
    for pid, rs in byp.items():
        rs = sorted(rs, key=lambda r: r["created_at"])
        rts = [r["mean_rt_ms"] for r in rs if r["mean_rt_ms"] is not None]
        if len(rs) >= 3 and len(rts) >= 3:
            slope = float(stats.linregress(range(len(rts)), rts).slope)
            longitudinal.append({"participant_id": pid, "n_sessions": len(rs), "mean_rt_series": rts,
                                 "within_person_sd_ms": round(pstdev(rts), 1), "slope_ms_per_session": round(slope, 1),
                                 "mean_session_rt_cv": _m([r["rt_cv"] for r in rs if r["rt_cv"] is not None])})
    missing = {"sessions": len(rows), "incomplete": len(rows) - len(done),
               "missing_tlx": sum(r["tlx_global"] is None for r in done), "missing_stress_pair": sum(r["stress_delta"] is None for r in done),
               "no_reflection": sum(not r["has_reflection"] for r in done)}
    tlx_sub = {k: _m([getattr(by_id[r["session_id"]].ratings, k) for r in done if getattr(by_id[r["session_id"]].ratings, k) is not None]) for k in TLX_KEYS}
    return {
        "n_sessions": len(rows), "n_completed": len(done), "n_participants": len({r["participant_id"] for r in rows}),
        "sessions": rows, "missing": missing, "rt_histogram": hist, "tlx_subscales": tlx_sub,
        "by_complexity": _cond_table(done, lambda r: r["complexity"], COMPLEXITY_LABEL),
        "by_movement": _cond_table(done, lambda r: "Moving" if r["movement"] else "Static"),
        "by_distraction": _cond_table(done, lambda r: "Distraction on" if r["distraction"] else "No distraction"),
        "by_device": _cond_table(done, lambda r: r["device"]),
        "stress_pre_post": {"pre_mean": _m([r["pre_stress"] for r in done if r["pre_stress"] is not None]),
                            "post_mean": _m([r["post_stress"] for r in done if r["post_stress"] is not None])},
        "multisensory": {"n_sessions_with_both_blocks": len(vis), "visual_mean_rt": _m(vis), "audiovisual_mean_rt": _m(av),
                         "paired_test": _paired(vis, av, "Wilcoxon signed-rank, session-level mean RT: visual vs audiovisual")},
        "tests": {
            "complexity_vs_tlx": _spearman([r["complexity"] for r in done], [r["tlx_global"] for r in done]),
            "complexity_vs_rt": _spearman([r["complexity"] for r in done], [r["mean_rt_ms"] for r in done]),
            "complexity_vs_stress_delta": _spearman([r["complexity"] for r in done], [r["stress_delta"] for r in done]),
            "stress_pre_post": _paired([r["pre_stress"] for r in done], [r["post_stress"] for r in done], "Wilcoxon signed-rank: pre vs post stress"),
            "caveat": "Exploratory, uncorrected for multiple comparisons; sessions from the same participant are not independent. Association, not causation.",
        },
        "longitudinal": sorted(longitudinal, key=lambda x: x["participant_id"])[:40],
    }


def analyse(records: List[dict]) -> Dict:
    recs = parse(records)
    out = {}
    for src in ("participant", "synthetic"):
        out[src] = analyse_source([r for r in recs if r.source == src])
    out["public"] = {"n_sessions": 0, "note": "No public behavioural dataset is bundled with PRISM. The only public material is the literature corpus used for RAG."}
    return out


def to_csv(records: List[dict], kind: str) -> str:
    import csv, io
    recs = parse(records)
    buf = io.StringIO()
    if kind == "trials":
        cols = ["session_id", "participant_id", "source", "device", "complexity", "movement", "distraction", "idx", "block", "kind",
                "modality", "set_size", "target_side", "response", "correct", "rt_ms", "timeout", "anticipatory"]
        w = csv.writer(buf); w.writerow(cols)
        for r in recs:
            for t in r.trials:
                w.writerow([r.session_id, r.participant_id, r.source, r.device, r.condition.complexity, int(r.condition.movement), int(r.condition.distraction),
                            t.idx, t.block, t.kind, t.modality, t.set_size, t.target_side, t.response, t.correct, t.rt_ms, int(t.timeout), int(t.anticipatory)])
    else:
        rows = [session_metrics(r) for r in recs]
        extra = {r.session_id: r for r in recs}
        cols = list(rows[0].keys()) + TLX_KEYS + ["consent", "consent_version", "completed_at", "block_modalities", "reflection"] if rows else ["session_id"]
        w = csv.writer(buf); w.writerow(cols)
        for row in rows:
            r = extra[row["session_id"]]
            w.writerow([row[c] for c in list(row.keys())] + [getattr(r.ratings, k) for k in TLX_KEYS] +
                       [int(r.consent), r.consent_version, r.completed_at, "|".join(r.condition.block_modalities), (r.reflection or "").replace("\n", " ")])
    return buf.getvalue()
