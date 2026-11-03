"""Ingestion + subject-grouped evaluation for the PhysioNet eegmat dataset (real data; nothing is simulated).

Features: relative band power (delta 1-4, theta 4-8, alpha 8-13, beta 13-30 Hz) per scalp region, plus theta/alpha and theta/beta ratios,
computed on non-overlapping 10-second epochs (first 60 s of each recording so rest and task have equal duration).
"""
import hashlib
import re
import zipfile
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
from scipy.signal import welch

from . import config
from .ml_common import evaluate_nested

BANDS = {"delta": (1, 4), "theta": (4, 8), "alpha": (8, 13), "beta": (13, 30)}
REGIONS = {"frontal": ["Fp1", "Fp2", "F3", "F4", "F7", "F8", "Fz"], "central": ["C3", "C4", "Cz"], "temporal": ["T3", "T4", "T5", "T6"],
           "parietal": ["P3", "P4", "Pz"], "occipital": ["O1", "O2"]}
EPOCH_S, MAX_S = 10, 60
FEATURE_NAMES = [f"{r}_{b}" for r in REGIONS for b in BANDS] + [f"{r}_theta_alpha" for r in REGIONS] + [f"{r}_theta_beta" for r in REGIONS]


def archive_path() -> Path:
    return config.EEGMAT_DIR / "eegmat.zip"


def extract() -> Path:
    out = config.EEGMAT_DIR / "extracted"
    if not any(out.rglob("*.edf")) if out.exists() else True:
        out.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive_path()) as z:
            z.extractall(out)  # zipfile strips absolute paths and '..' components
    return out


def _find_root(out: Path) -> Path:
    edfs = list(out.rglob("Subject*_1.edf"))
    if not edfs:
        raise FileNotFoundError("no Subject*_1.edf files found in the archive")
    return edfs[0].parent


def verify_checksums(root: Path) -> Dict:
    sums = root / "SHA256SUMS.txt"
    if not sums.exists():
        return {"checked": False, "reason": "SHA256SUMS.txt not present in archive"}
    ok = bad = 0
    for line in sums.read_text().splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[1].endswith(".edf"):
            f = root / parts[1]
            if f.exists():
                if hashlib.sha256(f.read_bytes()).hexdigest() == parts[0]:
                    ok += 1
                else:
                    bad += 1
    return {"checked": True, "files_ok": ok, "files_mismatch": bad}


def _read(path: Path) -> Tuple[Dict[str, np.ndarray], float, float]:
    import pyedflib
    r = pyedflib.EdfReader(str(path))
    try:
        labels = [l.strip() for l in r.getSignalLabels()]
        fs = [r.getSampleFrequency(i) for i in range(len(labels))]
        sig = {re.sub(r"^EEG\s+", "", lab).split("-")[0]: r.readSignal(i) for i, lab in enumerate(labels) if lab.upper().startswith("EEG")}
        return sig, float(fs[0]), float(r.file_duration)
    finally:
        r.close()


def _epoch_features(sig: Dict[str, np.ndarray], fs: float) -> np.ndarray:
    n = int(min(len(v) for v in sig.values()) // fs)
    n = min(n, MAX_S) // EPOCH_S
    rows = []
    for e in range(n):
        a, b = int(e * EPOCH_S * fs), int((e + 1) * EPOCH_S * fs)
        feat = {}
        for reg, chans in REGIONS.items():
            have = [c for c in chans if c in sig]
            if not have:
                feat.update({f"{reg}_{bn}": np.nan for bn in BANDS})
                continue
            pw = {bn: [] for bn in BANDS}
            for c in have:
                f, p = welch(sig[c][a:b], fs=fs, nperseg=int(2 * fs), noverlap=int(fs))
                tot = p[(f >= 1) & (f <= 30)].sum()
                for bn, (lo, hi) in BANDS.items():
                    pw[bn].append(p[(f >= lo) & (f < hi)].sum() / tot)
            for bn in BANDS:
                feat[f"{reg}_{bn}"] = float(np.mean(pw[bn]))
            feat[f"{reg}_theta_alpha"] = feat[f"{reg}_theta"] / feat[f"{reg}_alpha"]
            feat[f"{reg}_theta_beta"] = feat[f"{reg}_theta"] / feat[f"{reg}_beta"]
        rows.append([feat.get(k, np.nan) for k in FEATURE_NAMES])
    return np.array(rows, dtype=float)


def ingest() -> Dict:
    """Extract, verify, and featurise the archive. Returns a dataset summary (sample sizes, channels, missingness) computed from the actual files."""
    if not archive_path().exists():
        raise FileNotFoundError(f"{archive_path()} not found. Download it from the dataset URL (see docs/DATASETS.md).")
    root = _find_root(extract())
    checks = verify_checksums(root)
    subjects = sorted({int(re.search(r"Subject(\d+)_", f.name).group(1)) for f in root.glob("Subject*_?.edf")})
    X, y, g, info, skipped = [], [], [], [], []
    for sid in subjects:
        for suffix, label in (("1", 0), ("2", 1)):
            f = root / f"Subject{sid:02d}_{suffix}.edf"
            if not f.exists():
                skipped.append(f.name); continue
            sig, fs, dur = _read(f)
            feats = _epoch_features(sig, fs)
            if len(feats) == 0:
                skipped.append(f.name); continue
            X.append(feats); y += [label] * len(feats); g += [f"S{sid:02d}"] * len(feats)
            if len(info) < 2 or sid == subjects[0]:
                info.append({"file": f.name, "n_eeg_channels": len(sig), "channels": sorted(sig), "sampling_hz": fs, "duration_s": dur})
    X = np.vstack(X)
    np.savez_compressed(config.VAR_DIR / "eegmat_features.npz", X=X, y=np.array(y), g=np.array(g), names=np.array(FEATURE_NAMES))
    return {"n_subjects": len(set(g)), "n_recordings": len({(a, b) for a, b in zip(g, y)}), "n_epochs": int(len(y)), "epoch_seconds": EPOCH_S, "max_seconds_per_recording": MAX_S,
            "class_counts": {"rest": int((np.array(y) == 0).sum()), "task": int((np.array(y) == 1).sum())}, "example_recordings": info[:2],
            "features": FEATURE_NAMES, "missing_values": {"nan_cells": int(np.isnan(X).sum()), "total_cells": int(X.size)},
            "skipped_files": skipped, "checksums": checks, "preprocessing": "Relative band power (1-30 Hz total) from Welch PSD (2 s Hamming windows, 50% overlap) per channel, averaged within region; 10 s epochs from the first 60 s of each recording; no cross-subject normalisation (standardisation is fitted inside each CV fold)."}


def evaluate() -> Dict:
    f = config.VAR_DIR / "eegmat_features.npz"
    if not f.exists():
        return {"kind": "public_eeg", "status": "awaiting_data", "label": "AWAITING DATA - dataset not ingested",
                "message": "Run the dataset ingestion first (Admin -> Datasets). No model is trained and no metric is reported without it."}
    d = np.load(f, allow_pickle=False)
    X, y, g = d["X"], d["y"], d["g"]
    res = evaluate_nested(X, y, g, list(d["names"]))
    base = {"kind": "public_eeg", "dataset_slug": "eegmat", "data_source": "PhysioNet eegmat (public, ODC-By 1.0)", "target": "rest (0) vs mental arithmetic (1), epoch-level; subject-grouped evaluation",
            "n_epochs": int(len(y)), "n_subjects": int(len(set(g))), "features": list(d["names"]), "data_fingerprint": hashlib.sha256(X.tobytes()).hexdigest()}
    if res["status"] != "ok":
        return {**base, **res, "label": "UNEVALUATED"}
    return {**base, **res, "label": "TRAINED on real public EEG data (subject-grouped hold-out)",
            "limitations": ["Task and rest differ in more than workload (e.g. order: rest always precedes the task).", "36 subjects: wide uncertainty; single hold-out split.",
                            "Not comparable to PRISM's behavioural data; no transfer claim.", "Not a clinical or diagnostic result."]}
