"""Guards for the zero-synthetic-data rule."""
import pathlib
import re

import pytest

from conftest import enroll, make_client, open_study

ROOT = pathlib.Path(__file__).resolve().parent.parent


def test_generator_module_is_gone_and_unreferenced():
    assert not (ROOT / "backend" / "synthetic.py").exists()
    for p in (ROOT / "backend").rglob("*.py"):
        t = p.read_text()
        assert "import synthetic" not in t and "synthetic.generate" not in t, p
        assert not re.search(r"random\.(gauss|normalvariate)|np\.random\.(normal|randn)|rng\.(normal|gauss)", t), f"random data generation found in {p}"


def test_no_synthetic_source_in_schema_models_or_api(client):
    assert "synthetic" not in (ROOT / "backend" / "schemas.py").read_text().lower()
    assert "synthetic" not in (ROOT / "backend" / "models.py").read_text().lower()
    assert client.get("/api/synthetic").status_code == 404
    assert client.get("/api/openapi.json").status_code in (200, 404)
    assert "synthetic" not in client.get("/api/openapi.json").text.lower()


def test_frontend_has_no_synthetic_demo_features():
    for p in (ROOT / "frontend" / "src").rglob("*.ts*"):
        t = p.read_text().lower()
        assert "load synthetic" not in t and "synthetic demo" not in t and "/api/synthetic" not in t, p


def test_analytics_on_empty_database_reports_zero_not_fabricated_results(admin):
    a = admin.get("/api/admin/analytics").json()
    assert a["n_sessions"] == 0 and a["sessions"] == [] and a["rt_histogram"]["bins"] == [] and a["by_complexity"] == []
    assert all(v["status"] == "insufficient_data" for v in (a["tests"]["complexity_vs_tlx"], a["tests"]["stress_pre_post"]))


def test_behavioural_model_refuses_to_report_metrics_without_enough_real_data(admin):
    r = admin.post("/api/admin/ml/behavioural/evaluate").json()
    assert r["status"] == "insufficient_data" and "UNEVALUATED" in r["label"]
    for forbidden in ("test_selected", "test_all_models", "cv_train", "uncertainty", "permutation_importance_test"):
        assert forbidden not in r, forbidden


def test_behavioural_model_refuses_with_a_handful_of_real_sessions(admin):
    from conftest import session_payload
    open_study(admin)
    for i in range(3):
        pc = make_client(); enroll(pc); assert pc.post("/api/me/sessions", json=session_payload(f"sessioncount{i:03d}")).status_code == 200
    r = admin.post("/api/admin/ml/behavioural/evaluate").json()
    assert r["status"] == "insufficient_data" and r["n_sessions"] == 3 and "test_selected" not in r


def test_public_eeg_model_awaits_data_when_not_ingested(admin, monkeypatch):
    from backend import config
    f = config.VAR_DIR / "eegmat_features.npz"
    if f.exists():
        monkeypatch.setattr(config, "VAR_DIR", pathlib.Path("/nonexistent-prism-var"))
    r = admin.post("/api/admin/ml/public-eeg/evaluate").json()
    assert r["status"] == "awaiting_data" and "test_selected" not in r


def test_ml_pipeline_never_touches_test_rows_during_selection():
    """Mechanics check using scikit-learn's bundled REAL UCI breast-cancer data with artificial group ids (metrics are NOT asserted or used)."""
    import numpy as np
    from sklearn.datasets import load_breast_cancer
    from backend import ml_common
    X, y = load_breast_cancer(return_X_y=True); g = np.array([f"g{i // 5}" for i in range(len(y))])
    tr, te, _ = ml_common.group_split(y, g)
    assert not (set(g[tr]) & set(g[te]))
    seen_val = []
    from sklearn.model_selection import GroupKFold
    for a, b in GroupKFold(n_splits=5).split(X[tr], y[tr], g[tr]):
        assert not (set(g[tr][a]) & set(g[tr][b])); seen_val.append(set(tr[b]))
    assert all(not (s & set(te)) for s in seen_val)  # validation folds are drawn from TRAIN only
    res = ml_common.evaluate_nested(X, y, g, [f"f{i}" for i in range(X.shape[1])])
    assert res["status"] == "ok" and res["split"]["n_train_groups"] + res["split"]["n_test_groups"] == len(set(g))
    assert set(res["test_all_models"]) >= {"baseline_majority", "baseline_prior", "logistic_regression", "svm_rbf", "random_forest", "gradient_boosting"}
    assert res["selected_model"] in res["cv_train"] and res["uncertainty"]["resampling_unit"] == "participant"


@pytest.mark.skipif(not (ROOT / "datasets_cache" / "eegmat" / "eegmat.zip").exists(), reason="eegmat archive not downloaded")
def test_public_dataset_registry_matches_documented_provenance():
    from backend import datasets
    e = datasets.EEGMAT
    assert e["doi"] == "10.13026/C2JQ1P" and "ODC-By" in e["licence"] and e["source_url"].startswith("https://physionet.org/")
