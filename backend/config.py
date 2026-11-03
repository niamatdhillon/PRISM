"""Runtime configuration (environment variables only; no secrets in code)."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(__file__).resolve().parent / "data"
VAR_DIR = Path(os.environ.get("PRISM_VAR_DIR", ROOT / "var"))  # local-only runtime files (db, indexes, dataset cache); git-ignored

ENV = os.environ.get("PRISM_ENV", "development")  # development | production
IS_PROD = ENV == "production"
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{VAR_DIR / 'prism.sqlite3'}")
if DATABASE_URL.startswith("postgres://"):  # common provider spelling
    DATABASE_URL = "postgresql+psycopg2://" + DATABASE_URL[len("postgres://"):]
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = "postgresql+psycopg2://" + DATABASE_URL[len("postgresql://"):]

COOKIE_SECURE = os.environ.get("PRISM_COOKIE_SECURE", "1" if IS_PROD else "0") == "1"
ADMIN_SESSION_HOURS = int(os.environ.get("PRISM_ADMIN_SESSION_HOURS", "8"))
PARTICIPANT_COOKIE_DAYS = int(os.environ.get("PRISM_PARTICIPANT_COOKIE_DAYS", "90"))
LOGIN_MAX_FAILS, LOGIN_LOCK_MINUTES = 5, 15

# Ollama: values below are defaults; an admin may override host/model in the database (stored settings).
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "")
OLLAMA_TIMEOUT_S = float(os.environ.get("OLLAMA_TIMEOUT_S", "120"))
ALLOW_REMOTE_OLLAMA = os.environ.get("PRISM_ALLOW_REMOTE_OLLAMA", "0") == "1"  # off: only loopback hosts accepted

EMBED_MODEL = os.environ.get("PRISM_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
EMBED_BACKEND = os.environ.get("PRISM_EMBEDDINGS", "auto")  # auto | lsa
EEGMAT_DIR = Path(os.environ.get("PRISM_EEGMAT_DIR", ROOT / "datasets_cache" / "eegmat"))
