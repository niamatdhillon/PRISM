"""Runtime configuration (environment variables only; no secrets in code)."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ON_VERCEL = bool(os.environ.get("VERCEL"))
DATA_DIR = Path(__file__).resolve().parent / "data"
VAR_DIR = Path(os.environ.get("PRISM_VAR_DIR") or ("/tmp/prism" if ON_VERCEL else ROOT / "var"))  # runtime files (index cache, local sqlite); /tmp is the only writable place on Vercel
MODEL_DIR = DATA_DIR / "models"

ENV = os.environ.get("PRISM_ENV") or ("production" if ON_VERCEL else "development")  # development | production
IS_PROD = ENV == "production"
DATABASE_URL = (os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL") or os.environ.get("POSTGRES_PRISMA_URL")
                or f"sqlite:///{VAR_DIR / 'prism.sqlite3'}")  # Vercel/Neon marketplace variables are honoured
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
OLLAMA_HOST_SET = bool(os.environ.get("OLLAMA_HOST"))
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "")
OLLAMA_TIMEOUT_S = float(os.environ.get("OLLAMA_TIMEOUT_S", "120"))
OLLAMA_API_KEY = os.environ.get("OLLAMA_API_KEY", "")  # sent as "Authorization: Bearer ..." to an authenticated reverse proxy in front of a remote Ollama (server-side only)
ALLOW_REMOTE_OLLAMA = os.environ.get("PRISM_ALLOW_REMOTE_OLLAMA", "0") == "1"  # off: only loopback hosts accepted

EMBED_MODEL = os.environ.get("PRISM_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
EMBED_BACKEND = os.environ.get("PRISM_EMBEDDINGS", "auto")  # auto/onnx = MiniLM ONNX (falls back to LSA) | st = sentence-transformers | lsa
EEGMAT_DIR = Path(os.environ.get("PRISM_EEGMAT_DIR", ROOT / "datasets_cache" / "eegmat"))

# Single-service deployment: the API also serves the built frontend (same origin => first-party cookies, no proxy needed).
STATIC_DIR = Path(os.environ.get("PRISM_STATIC_DIR", ROOT / "frontend" / "dist"))
# Optional first-admin bootstrap for hosts without a shell (set BOTH as secret env vars on the platform; used only while no user exists).
BOOTSTRAP_ADMIN_EMAIL = os.environ.get("PRISM_BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
BOOTSTRAP_ADMIN_PASSWORD = os.environ.get("PRISM_BOOTSTRAP_ADMIN_PASSWORD", "")

DEMO_LLM = os.environ.get("PRISM_DEMO_LLM", "1") == "1"        # public demo may use Ollama when it is configured/reachable
DEMO_RATE_PER_MIN = int(os.environ.get("PRISM_DEMO_RATE_PER_MIN", "20"))
DEMO_LLM_RATE_PER_MIN = int(os.environ.get("PRISM_DEMO_LLM_RATE_PER_MIN", "5"))
