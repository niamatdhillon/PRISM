"""Runtime configuration. Hosted mode is selected automatically on Vercel or by PRISM_MODE=hosted."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(__file__).resolve().parent / "data"

MODE = os.environ.get("PRISM_MODE") or ("hosted" if os.environ.get("VERCEL") else "local")
IS_HOSTED = MODE == "hosted"

# Local-only settings (ignored in hosted mode: a hosted server must never call a visitor's/owner's localhost).
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "")  # empty -> use first installed model
OLLAMA_TIMEOUT_S = float(os.environ.get("OLLAMA_TIMEOUT_S", "120"))

EMBED_MODEL = os.environ.get("PRISM_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
# auto: try sentence-transformers (local mode only); lsa: force the lightweight fallback
EMBED_BACKEND = os.environ.get("PRISM_EMBEDDINGS", "lsa" if IS_HOSTED else "auto")

DB_PATH = Path(os.environ.get("PRISM_DB", ROOT / "data" / "prism.sqlite3"))
CONSENT_VERSION = "v0.1-demo"
