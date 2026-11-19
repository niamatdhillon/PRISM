"""Vercel Python function entry point: the whole PRISM API (FastAPI) is served from this single function under /api/*."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backend.app import app  # noqa: E402,F401
