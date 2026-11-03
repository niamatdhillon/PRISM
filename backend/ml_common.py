"""Shared model zoo + nested, leakage-safe evaluation used by both the behavioural and the public-EEG pipelines.

Protocol (no test data is used for fitting, preprocessing or model selection):
  1. Group hold-out split by participant/subject -> TRAIN(+validation via CV) and TEST.
  2. Model selection by GroupKFold cross-validation inside TRAIN only (primary criterion: PR-AUC, then ROC-AUC).
  3. The selected model is refit on TRAIN and evaluated ONCE on TEST.
  4. Baselines (majority class, stratified-prior) evaluated on the same TEST set; uncertainty by participant-cluster bootstrap.
"""
from typing import Dict, List, Sequence

import numpy as np
from sklearn.calibration import calibration_curve
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, average_precision_score, balanced_accuracy_score, brier_score_loss, confusion_matrix, f1_score,
                             precision_score, recall_score, roc_auc_score)
from sklearn.model_selection import GroupKFold, GroupShuffleSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.base import clone

SEED = 42


def model_zoo() -> Dict[str, object]:
    imp = lambda: SimpleImputer(strategy="median")  # noqa: E731  (fit inside each CV fold -> no leakage)
    return {
        "logistic_regression": make_pipeline(imp(), StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=3000, C=1.0)),
        "logistic_regression_l1": make_pipeline(imp(), StandardScaler(), LogisticRegression(class_weight="balanced", penalty="l1", solver="liblinear", C=0.5, max_iter=3000)),
        "svm_rbf": make_pipeline(imp(), StandardScaler(), SVC(kernel="rbf", C=1.0, gamma="scale", class_weight="balanced", probability=True, random_state=SEED)),
        "random_forest": make_pipeline(imp(), RandomForestClassifier(n_estimators=200, max_depth=6, min_samples_leaf=3, class_weight="balanced_subsample", random_state=SEED, n_jobs=1)),
        "gradient_boosting": make_pipeline(imp(), GradientBoostingClassifier(n_estimators=100, max_depth=2, learning_rate=0.05, subsample=0.8, random_state=SEED)),
    }


def group_split(y, g, test_size=0.25, min_test_per_class=3):
    for s in range(SEED, SEED + 300):
        tr, te = next(GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=s).split(np.zeros(len(y)), y, g))
        if len(set(y[tr])) == 2 and len(set(y[te])) == 2 and min(np.bincount(y[te])) >= min_test_per_class:
            return tr, te, s
    return None, None, None


def _scores(model, X, y):
    p = model.predict_proba(X)[:, 1]
    pred = (p >= 0.5).astype(int)
    out = {"accuracy": accuracy_score(y, pred), "balanced_accuracy": balanced_accuracy_score(y, pred), "precision": precision_score(y, pred, zero_division=0),
           "recall": recall_score(y, pred, zero_division=0), "f1": f1_score(y, pred, zero_division=0), "brier": brier_score_loss(y, p)}
    if len(set(y)) == 2:
        out["roc_auc"], out["pr_auc"] = roc_auc_score(y, p), average_precision_score(y, p)
    return out, p, pred


def cv_select(X, y, g, n_splits=5):
    """Cross-validate every candidate on TRAIN only; returns per-model mean/sd of PR-AUC, ROC-AUC, F1."""
    ng = len(set(g))
    k = min(n_splits, ng)
    res = {}
    for name, mdl in model_zoo().items():
        pr, roc, f1 = [], [], []
        for a, b in GroupKFold(n_splits=k).split(X, y, g):
            if len(set(y[a])) < 2 or len(set(y[b])) < 2:
                continue
            m = clone(mdl).fit(X[a], y[a])
            p = m.predict_proba(X[b])[:, 1]
            pr.append(average_precision_score(y[b], p)); roc.append(roc_auc_score(y[b], p)); f1.append(f1_score(y[b], (p >= 0.5).astype(int), zero_division=0))
        if pr:
            res[name] = {"cv_pr_auc": round(float(np.mean(pr)), 3), "cv_pr_auc_sd": round(float(np.std(pr)), 3), "cv_roc_auc": round(float(np.mean(roc)), 3),
                         "cv_f1": round(float(np.mean(f1)), 3), "folds": len(pr)}
    return res


def _boot(y, p, g, n=300):
    rng = np.random.default_rng(SEED)
    groups = np.array(sorted(set(g)))
    idx_by = {k: np.where(g == k)[0] for k in groups}
    roc, f1 = [], []
    for _ in range(n):
        pick = rng.choice(groups, size=len(groups), replace=True)
        ix = np.concatenate([idx_by[k] for k in pick])
        if len(set(y[ix])) < 2:
            continue
        roc.append(roc_auc_score(y[ix], p[ix])); f1.append(f1_score(y[ix], (p[ix] >= 0.5).astype(int), zero_division=0))
    q = lambda v: [round(float(np.percentile(v, 2.5)), 3), round(float(np.percentile(v, 97.5)), 3)] if v else None  # noqa: E731
    return {"roc_auc_ci95": q(roc), "f1_ci95": q(f1), "n_boot": len(roc), "resampling_unit": "participant"}


def evaluate_nested(X: np.ndarray, y: np.ndarray, g: np.ndarray, feature_names: Sequence[str]) -> Dict:
    tr, te, seed = group_split(y, g)
    if tr is None:
        return {"status": "insufficient_data", "message": "Could not form a participant-grouped split with both classes in train and test."}
    sel = cv_select(X[tr], y[tr], g[tr])
    if not sel:
        return {"status": "insufficient_data", "message": "Cross-validation folds lacked both classes."}
    best = max(sel, key=lambda k: (sel[k]["cv_pr_auc"], sel[k]["cv_roc_auc"]))
    zoo = model_zoo()
    test = {}
    for name in list(sel) + ["__baseline__"]:
        if name == "__baseline__":
            for bn, st in (("baseline_majority", "most_frequent"), ("baseline_prior", "prior")):
                m = DummyClassifier(strategy=st).fit(X[tr], y[tr]); met, p, pred = _scores(m, X[te], y[te]); test[bn] = {k: round(float(v), 3) for k, v in met.items()}
                test[bn]["confusion_matrix"] = confusion_matrix(y[te], pred, labels=[0, 1]).tolist()
            continue
        m = clone(zoo[name]).fit(X[tr], y[tr]); met, p, pred = _scores(m, X[te], y[te])
        test[name] = {k: round(float(v), 3) for k, v in met.items()}; test[name]["confusion_matrix"] = confusion_matrix(y[te], pred, labels=[0, 1]).tolist()
    final = clone(zoo[best]).fit(X[tr], y[tr]); met, p, pred = _scores(final, X[te], y[te])
    frac_pos, mean_pred = calibration_curve(y[te], p, n_bins=5, strategy="quantile")
    pi = permutation_importance(final, X[te], y[te], n_repeats=20, random_state=SEED, scoring="roc_auc")
    imp = sorted([{"feature": f, "mean": round(float(a), 4), "sd": round(float(b), 4)} for f, a, b in zip(feature_names, pi.importances_mean, pi.importances_std)], key=lambda d: -d["mean"])
    return {
        "status": "ok", "selected_model": best, "selection_criterion": "mean cross-validated PR-AUC on the training participants only",
        "cv_train": sel, "test_all_models": test, "test_selected": {k: round(float(v), 3) for k, v in met.items()},
        "test_selected_confusion_matrix": confusion_matrix(y[te], pred, labels=[0, 1]).tolist(),
        "uncertainty": _boot(y[te], p, g[te]),
        "calibration": {"bins": [{"mean_predicted": round(float(a), 3), "fraction_positive": round(float(b), 3)} for a, b in zip(mean_pred, frac_pos)], "brier": round(float(met["brier"]), 3),
                        "note": "5 quantile bins on the held-out set; few observations per bin -> noisy."},
        "permutation_importance_test": imp,
        "split": {"method": "GroupShuffleSplit by participant (test 25%) + GroupKFold CV inside train", "seed": int(seed), "n_train_rows": int(len(tr)), "n_test_rows": int(len(te)),
                  "n_train_groups": int(len(set(g[tr]))), "n_test_groups": int(len(set(g[te]))), "test_class_counts": {"0": int((y[te] == 0).sum()), "1": int((y[te] == 1).sum())},
                  "train_class_counts": {"0": int((y[tr] == 0).sum()), "1": int((y[tr] == 1).sum())}},
    }
