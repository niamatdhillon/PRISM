#!/usr/bin/env bash
# One command local run: builds the frontend and serves site + API on http://127.0.0.1:8000
set -e
cd "$(dirname "$0")/.."
[ -d .venv ] || { python3 -m venv .venv && .venv/bin/pip install -r requirements-local.txt; }
(cd frontend && npm install --no-audit --no-fund && npm run build)
.venv/bin/python -m backend.cli migrate
echo "PRISM running at http://127.0.0.1:8000  (create an admin first:  .venv/bin/python -m backend.cli create-admin you@example.org)"
exec .venv/bin/uvicorn backend.app:app --port 8000
