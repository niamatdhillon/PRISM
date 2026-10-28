"""Vercel serverless entry point: exposes the FastAPI app (hosted mode is auto-selected via the VERCEL env var)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backend.app import app  # noqa: E402,F401
