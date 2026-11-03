"""Descriptive and exploratory inferential statistics computed from REAL participant sessions stored in the database.
Input records are plain dicts (see records.to_record). Nothing here generates or simulates data."""
import csv
import io
import math
from collections import defaultdict
from statistics import mean, median, stdev
from typing import Dict, List, Optional

from scipy import stats

TLX = ["tlx_mental", "tlx_physical", "tlx_temporal", "tlx_performance", "tlx_effort", "tlx_frustration"]
COMPLEXITY = {0: "Low (6 items)", 1: "Medium (18)", 2: "High (36)"}


def _m(v): return round(mean(v), 2) if v else None
def _sd(v): return round(stdev(v), 2) if len(v) > 1 else None
def _ci(v):
    if len(v) < 3:
        return None
    h = stats.t.ppf(0.975, len(v) - 1) * stdev(v) / math.sqrt(len(v))
    return [round(mean(v) - h, 2), round(mean(v) + h, 2)]


def tlx_global(r: dict) -> Optional[float]:
    v = [r.get(k) for k in TLX]
    return None if any(x is None for x in v) else sum(v) / 6.0


def _valid_rts(trials, task, **where) -> List[float]:
    return [t["rt_ms"] for t in trials if t["task"] == task and t["rt_ms"] is not None and t["correct"] and not t["anticipatory"]
            and all(t.get(k) == v for k, v in where.items())]


def _acc(trials, task, **where):
    ts = [t for t in trials if t["task"] == task and all(t.get(k) == v for k, v in where.items())]
    return (sum(bool(t["correct"]) for t in ts) / len(ts)) if ts else None


def dprime(hits: int, n_signal: int, fas: int, n_noise: int) -> Optional[float]:
    if n_signal == 0 or n_noise == 0:
        return None
    hr, far = (hits + 0.5) / (n_signal + 1), (fas + 0.5) / (n_noise + 1)  # log-linear correction avoids infinite z
    return round(float(stats.norm.ppf(hr) - stats.norm.ppf(far)), 3)


def session_metrics(rec: dict) -> Dict:
    tr, c, r = rec["trials"], rec["condition"], rec["ratings"]
    vs = [t for t in tr if t["task"] == "visual_search"]
    vs_rt = _valid_rts(tr, "visual_search")
    out = {
        "session_id": rec["session_id"], "participant": rec["participant"], "created_at": rec["started_at"], "completed": rec["completed"],
        "device": rec["device"], "display_mode": rec["display_mode"], "camera_used": rec["camera_used"], "audio_enabled": rec["audio_enabled"],
        "tasks": rec["tasks_completed"], "complexity": c["complexity"], "movement": c["movement"], "distraction": c["distraction"], "brightness": c.get("brightness", 1.0),
        "vs_n": len(vs), "vs_mean_rt": _m(vs_rt), "vs_median_rt": round(median(vs_rt), 1) if vs_rt else None, "vs_rt_sd": _sd(vs_rt),
        "vs_rt_cv": round(stdev(vs_rt) / mean(vs_rt), 3) if len(vs_rt) > 1 else None, "vs_accuracy": _acc(tr, "visual_search"),
        "vs_timeouts": sum(t["timeout"] for t in vs), "vs_rt_visual": _m(_valid_rts(tr, "visual_search", modality="visual")),
        "vs_rt_audiovisual": _m(_valid_rts(tr, "visual_search", modality="audiovisual")),
        "arith_accuracy": _acc(tr, "arithmetic"), "arith_mean_rt": _m(_valid_rts(tr, "arithmetic")),
        "pattern_accuracy": _acc(tr, "pattern"), "pattern_mean_rt": _m(_valid_rts(tr, "pattern")),
        "tlx_global": round(tlx_global(r), 2) if tlx_global(r) is not None else None,
        "pre_stress": r.get("pre_stress"), "post_stress": r.get("post_stress"), "perceived_difficulty": r.get("perceived_difficulty"),
        "has_reflection": bool((rec.get("reflection") or "").strip()),
    }
    out["stress_delta"] = out["post_stress"] - out["pre_stress"] if out["post_stress"] is not None and out["pre_stress"] is not None else None
    od = [t for t in tr if t["task"] == "auditory_oddball"]
    if od:
        dev = [t for t in od if t["trial_type"] == "deviant"]; std = [t for t in od if t["trial_type"] == "standard"]
        hits = sum(t["response"] == "press" for t in dev); fas = sum(t["response"] == "press" for t in std)
        out.update(od_hit_rate=round(hits / len(dev), 3) if dev else None, od_fa_rate=round(fas / len(std), 3) if std else None,
                   od_dprime=dprime(hits, len(dev), fas, len(std)), od_mean_rt=_m([t["rt_ms"] for t in dev if t["response"] == "press" and t["rt_ms"] is not None]))
    ts = [t for t in tr if t["task"] == "task_switching"]
    if ts:
        rr, rs = _valid_rts(tr, "task_switching", trial_type="repeat"), _valid_rts(tr, "task_switching", trial_type="switch")
        out["ts_switch_cost_rt"] = round(mean(rs) - mean(rr), 1) if rr and rs else None
        ar, as_ = _acc(tr, "task_switching", trial_type="repeat"), _acc(tr, "task_switching", trial_type="switch")
        out["ts_switch_cost_acc"] = round(ar - as_, 3) if ar is not None and as_ is not None else None
        out["ts_accuracy"] = _acc(tr, "task_switching")
    fl = [t for t in tr if t["task"] == "flanker"]
    if fl:
        ci_, cc = _valid_rts(tr, "flanker", trial_type="incongruent"), _valid_rts(tr, "flanker", trial_type="congruent")
        out["fl_congruency_rt"] = round(mean(ci_) - mean(cc), 1) if ci_ and cc else None
        a_i, a_c = _acc(tr, "flanker", trial_type="incongruent"), _acc(tr, "flanker", trial_type="congruent")
        out["fl_congruency_acc"] = round(a_c - a_i, 3) if a_i is not None and a_c is not None else None
        out["fl_accuracy"] = _acc(tr, "flanker")
    return out


def _cond(rows, key, labels=None):
    g = defaultdict(list)
    for r in rows:
        g[key(r)].append(r)
    out = []
    for k, rs in sorted(g.items(), key=lambda kv: str(kv[0])):
        rt = [r["vs_mean_rt"] for r in rs if r["vs_mean_rt"] is not None]
        acc = [r["vs_accuracy"] for r in rs if r["vs_accuracy"] is not None]
        tlx = [r["tlx_global"] for r in rs if r["tlx_global"] is not None]
        sd = [r["stress_delta"] for r in rs if r["stress_delta"] is not None]
        out.append({"label": (labels or {}).get(k, str(k)), "n_sessions": len(rs), "n_participants": len({r["participant"] for r in rs}),
                    "vs_mean_rt": _m(rt), "rt_ci95": _ci(rt), "n_rt": len(rt), "accuracy": _m(acc), "accuracy_ci95": _ci(acc),
                    "tlx": _m(tlx), "tlx_ci95": _ci(tlx), "n_tlx": len(tlx), "stress_delta": _m(sd), "stress_delta_ci95": _ci(sd), "n_stress": len(sd)})
    return out


def _spearman(x, y):
    pairs = [(a, b) for a, b in zip(x, y) if a is not None and b is not None]
    if len(pairs) < 8 or len({a for a, _ in pairs}) < 2 or len({b for _, b in pairs}) < 2:
        return {"n": len(pairs), "status": "insufficient_data", "note": "needs >= 8 pairs with variation"}
    rho, p = stats.spearmanr([a for a, _ in pairs], [b for _, b in pairs])
    return {"n": len(pairs), "status": "ok", "rho": round(float(rho), 3), "p": float(f"{p:.3g}")}


def _wilcoxon(a, b=None, label=""):
    if b is None:
        d = [x for x in a if x is not None]
    else:
        d = [y - x for x, y in zip(a, b) if x is not None and y is not None]
    if len(d) < 6:
        return {"test": label, "n": len(d), "status": "insufficient_data", "note": "needs >= 6 observations"}
    if all(v == 0 for v in d):
        return {"test": label, "n": len(d), "status": "ok", "median": 0, "note": "all differences zero"}
    w = stats.wilcoxon(d)
    return {"test": label, "n": len(d), "status": "ok", "median": round(median(d), 3), "mean": round(mean(d), 3), "p": float(f"{w.pvalue:.3g}")}


def analyse(records: List[dict]) -> Dict:
    rows = [session_metrics(r) for r in records]
    done = [r for r in rows if r["completed"]]
    by_id = {r["session_id"]: r for r in records}
    rts = [t["rt_ms"] for r in records if r["completed"] for t in r["trials"] if t["task"] == "visual_search" and t["rt_ms"] is not None and t["correct"] and not t["anticipatory"]]
    hist = []
    if rts:
        lo, hi, nb = 100, 1500, 28
        w = (hi - lo) / nb; counts = [0] * nb
        for v in rts:
            counts[min(nb - 1, max(0, int((v - lo) / w)))] += 1
        hist = [{"x0": round(lo + i * w), "x1": round(lo + (i + 1) * w), "n": c} for i, c in enumerate(counts)]
    bypid = defaultdict(list)
    for r in done:
        bypid[r["participant"]].append(r)
    long = []
    for pid, rs in bypid.items():
        rs = sorted(rs, key=lambda r: r["created_at"]); series = [r["vs_mean_rt"] for r in rs if r["vs_mean_rt"] is not None]
        if len(series) >= 3:
            long.append({"participant": pid, "n_sessions": len(series), "series": series, "sd_ms": round(stdev(series), 1),
                         "slope_ms_per_session": round(float(stats.linregress(range(len(series)), series).slope), 1)})
    tlx_sub = {k: _m([by_id[r["session_id"]]["ratings"][k] for r in done if by_id[r["session_id"]]["ratings"].get(k) is not None]) for k in TLX}
    tests = {
        "complexity_vs_tlx": _spearman([r["complexity"] for r in done], [r["tlx_global"] for r in done]),
        "complexity_vs_rt": _spearman([r["complexity"] for r in done], [r["vs_mean_rt"] for r in done]),
        "complexity_vs_difficulty": _spearman([r["complexity"] for r in done], [r["perceived_difficulty"] for r in done]),
        "stress_pre_post": _wilcoxon([r["pre_stress"] for r in done], [r["post_stress"] for r in done], "Wilcoxon: post - pre stress"),
        "audiovisual_vs_visual": _wilcoxon([r["vs_rt_visual"] for r in done], [r["vs_rt_audiovisual"] for r in done], "Wilcoxon: audiovisual - visual block RT (ms)"),
        "switch_cost": _wilcoxon([r.get("ts_switch_cost_rt") for r in done], None, "Wilcoxon vs 0: task-switch cost RT (ms)"),
        "flanker_congruency": _wilcoxon([r.get("fl_congruency_rt") for r in done], None, "Wilcoxon vs 0: flanker congruency effect RT (ms)"),
    }
    return {
        "source": "participant observations collected through PRISM",
        "n_sessions": len(rows), "n_completed": len(done), "n_participants": len({r["participant"] for r in rows}),
        "sessions": rows, "rt_histogram": {"n_trials": len(rts), "bins": hist}, "tlx_subscales": tlx_sub,
        "by_complexity": _cond(done, lambda r: r["complexity"], COMPLEXITY), "by_movement": _cond(done, lambda r: "Moving" if r["movement"] else "Static"),
        "by_distraction": _cond(done, lambda r: "Distraction" if r["distraction"] else "No distraction"),
        "by_display_mode": _cond(done, lambda r: r["display_mode"]), "by_device": _cond(done, lambda r: r["device"]),
        "task_summaries": {
            "auditory_oddball": {"n": len([r for r in done if r.get("od_dprime") is not None]), "mean_dprime": _m([r["od_dprime"] for r in done if r.get("od_dprime") is not None]),
                                 "mean_hit_rate": _m([r["od_hit_rate"] for r in done if r.get("od_hit_rate") is not None]), "mean_fa_rate": _m([r["od_fa_rate"] for r in done if r.get("od_fa_rate") is not None])},
            "task_switching": {"n": len([r for r in done if r.get("ts_switch_cost_rt") is not None]), "mean_switch_cost_rt": _m([r["ts_switch_cost_rt"] for r in done if r.get("ts_switch_cost_rt") is not None])},
            "flanker": {"n": len([r for r in done if r.get("fl_congruency_rt") is not None]), "mean_congruency_rt": _m([r["fl_congruency_rt"] for r in done if r.get("fl_congruency_rt") is not None])},
            "pattern": {"n": len([r for r in done if r["pattern_accuracy"] is not None]), "mean_accuracy": _m([r["pattern_accuracy"] for r in done if r["pattern_accuracy"] is not None])},
        },
        "tests": tests,
        "tests_note": "Exploratory, uncorrected for multiple comparisons; sessions from one participant are not independent. Association, not causation.",
        "longitudinal": sorted(long, key=lambda x: x["participant"])[:40],
        "missing": {"incomplete": len(rows) - len(done), "missing_tlx": sum(r["tlx_global"] is None for r in done), "missing_stress_pair": sum(r["stress_delta"] is None for r in done),
                    "no_reflection": sum(not r["has_reflection"] for r in done)},
    }


def to_csv(records: List[dict], kind: str) -> str:
    buf = io.StringIO(); w = csv.writer(buf)
    if kind == "trials":
        cols = ["session_id", "participant", "device", "display_mode", "complexity", "movement", "distraction", "brightness", "idx", "task", "block", "modality",
                "trial_type", "set_size", "stimulus", "response", "correct", "rt_ms", "onset_epoch_ms", "timeout", "anticipatory"]
        w.writerow(cols)
        for r in records:
            c = r["condition"]
            for t in r["trials"]:
                w.writerow([r["session_id"], r["participant"], r["device"], r["display_mode"], c["complexity"], int(c["movement"]), int(c["distraction"]), c.get("brightness", 1.0),
                            t["idx"], t["task"], t["block"], t["modality"], t["trial_type"], t["set_size"], t["stimulus"], t["response"], t["correct"], t["rt_ms"], t["onset_epoch_ms"], int(t["timeout"]), int(t["anticipatory"])])
    else:
        rows = [session_metrics(r) for r in records]
        if rows:
            cols = [k for k in rows[0].keys() if k != "tasks"] + ["tasks"]
            extra = ["protocol_version", "completed_at", "reflection"] + TLX
            w.writerow(cols + extra)
            by = {r["session_id"]: r for r in records}
            for row in rows:
                r = by[row["session_id"]]
                w.writerow([row[c] if c != "tasks" else "|".join(row["tasks"]) for c in cols] + [r["protocol_version"], r["completed_at"], (r.get("reflection") or "").replace("\n", " ")] + [r["ratings"].get(k) for k in TLX])
        else:
            w.writerow(["session_id"])
    return buf.getvalue()
