"""Synthetic DEMONSTRATION data generator. Every record is tagged source="synthetic".

Generative assumptions (deliberately simple and fully documented -- these are NOT empirical findings):
  trial RT (ms)  = lognormal around  330 + 85*complexity + 45*movement + 55*distraction - 35*[audiovisual] + participant offset (sd 45)
  P(error)       = logistic(-3.1 + 0.55*complexity + 0.35*movement + 0.45*distraction + 0.4*participant_noise)
  raw TLX        = 28 + 11*complexity + 6*movement + 9*distraction + 0.06*(participant mean RT - 450) + participant offset (sd 8) + noise (sd 7)
  stress delta   = 2 + 5*complexity + 3*distraction + noise (sd 8)
Any model trained on this data can only recover these assumptions; it says nothing about humans.
"""
import math
import random
from datetime import datetime, timedelta, timezone
from typing import List

from .schema import SessionRecord

N_TRIALS_PER_BLOCK = 12


def _clip(x, lo, hi):
    return max(lo, min(hi, x))


def generate(n_participants: int = 60, sessions_per_participant: int = 3, seed: int = 7) -> List[dict]:
    rng = random.Random(seed)
    base_time = datetime(2026, 1, 5, 9, 0, tzinfo=timezone.utc)
    out: List[dict] = []
    for p in range(n_participants):
        pid = f"SYN-{p + 1:03d}"
        rt_off, tlx_off, err_off = rng.gauss(0, 45), rng.gauss(0, 8), rng.gauss(0, 1)
        device = rng.choices(["desktop", "phone", "tablet"], [0.55, 0.35, 0.10])[0]
        for s in range(sessions_per_participant):
            cx, mv, ds, au = rng.choice([0, 1, 2]), rng.random() < 0.5, rng.random() < 0.4, rng.random() < 0.6
            mods = rng.sample(["visual", "audiovisual"], 2) if au else ["visual", "visual"]
            practice = -12 * s  # mild practice effect across repeated sessions
            trials = []
            idx = 0
            for b, mod in enumerate(mods):
                for _ in range(N_TRIALS_PER_BLOCK):
                    mu = 330 + 85 * cx + 45 * mv + 55 * ds - (35 if mod == "audiovisual" else 0) + rt_off + practice + (18 if device == "phone" else 0)
                    rt = math.exp(rng.gauss(math.log(max(mu, 150)), 0.22))
                    p_err = 1 / (1 + math.exp(-(-3.1 + 0.55 * cx + 0.35 * mv + 0.45 * ds + 0.4 * err_off)))
                    timeout = rt > 2500
                    side = rng.choice(["left", "right"])
                    correct = (rng.random() > p_err) and not timeout
                    resp = None if timeout else (side if correct else ("left" if side == "right" else "right"))
                    trials.append({"idx": idx, "block": b, "kind": "target", "modality": mod, "set_size": [6, 18, 36][cx],
                                   "target_side": side, "response": resp, "correct": None if timeout else correct,
                                   "rt_ms": None if timeout else round(rt, 1), "timeout": timeout, "anticipatory": False})
                    idx += 1
            for _ in range(6):
                ok = rng.random() > (0.08 + 0.04 * cx)
                trials.append({"idx": idx, "block": 2, "kind": "arithmetic", "modality": "none", "set_size": 0, "target_side": None,
                               "response": "true" if ok else "false", "correct": ok,
                               "rt_ms": round(math.exp(rng.gauss(math.log(2200 + 300 * cx), 0.3)), 1), "timeout": False, "anticipatory": False})
                idx += 1
            tgt = [t["rt_ms"] for t in trials if t["kind"] == "target" and t["rt_ms"]]
            mean_rt = sum(tgt) / len(tgt) if tgt else 450
            tlx = _clip(28 + 11 * cx + 6 * mv + 9 * ds + 0.06 * (mean_rt - 450) + tlx_off + rng.gauss(0, 7), 2, 98)
            sub = lambda w, sd=9: int(_clip(tlx * w + rng.gauss(0, sd), 0, 100))  # noqa: E731
            pre = int(_clip(rng.gauss(32, 14), 0, 100))
            post = int(_clip(pre + 2 + 5 * cx + 3 * ds + rng.gauss(0, 8), 0, 100))
            t0 = base_time + timedelta(days=p * 0.3 + s * 2.1, minutes=rng.randint(0, 600))
            rec = {
                "session_id": f"syn-{p + 1:03d}-{s + 1}", "participant_id": pid, "source": "synthetic", "consent": False,
                "consent_version": "n/a (synthetic)", "created_at": t0.isoformat(), "completed_at": (t0 + timedelta(minutes=4)).isoformat(),
                "completed": True, "device": device,
                "condition": {"complexity": cx, "movement": mv, "distraction": ds, "audio_enabled": au, "block_modalities": mods},
                "ratings": {"pre_stress": pre, "post_stress": post, "tlx_mental": sub(1.25), "tlx_physical": sub(0.35, 6), "tlx_temporal": sub(1.0),
                            "tlx_performance": sub(0.9), "tlx_effort": sub(1.15), "tlx_frustration": sub(0.8)},
                "reflection": None, "trials": trials,
            }
            SessionRecord(**rec)  # validate against the real schema
            out.append(rec)
    return out
