"""Regenerate the packaged EEG assets from the real PhysioNet archive (datasets_cache/eegmat/eegmat.zip).
Outputs backend/data/eegmat_features.npz and eegmat_summary.json: derived band-power features (no raw EEG) used by the serverless deployment."""
import shutil
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend import config, public_eeg  # noqa: E402

s = public_eeg.ingest()
for f in ("eegmat_features.npz", "eegmat_summary.json"):
    shutil.copy(config.VAR_DIR / f, config.DATA_DIR / f)
print("exported", s["n_subjects"], "subjects,", s["n_epochs"], "epochs; checksums:", s["checksums"])
