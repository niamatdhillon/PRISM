# Deploying PRISM as ONE Vercel project

One repository → one Vercel project → one URL. The React site is served from Vercel's CDN and the whole FastAPI backend runs as a single Python function under `/api/*` (see `vercel.json` and `api/index.py`). There is no second deployment and no separate backend host.

## What runs where

| Piece | Where | Notes |
|---|---|---|
| Website (React/Vite, Three.js) | Vercel CDN (`frontend/dist`) | built by `vercel.json` |
| API (auth, participants, sessions, admin, NLP, RAG, prediction) | Vercel Python function `api/index.py` | FastAPI, Python 3.12 (`.python-version`) |
| Database | **PostgreSQL** (Neon via the Vercel Marketplace) | required for participants/sessions/admin; migrations run automatically at first request, under an advisory lock |
| MiniLM embeddings | inside the function (ONNX Runtime, 23 MB int8 model in the repo) | no PyTorch |
| EEG model | inside the function; trained on **precomputed band-power features** of the real PhysioNet dataset (`backend/data/eegmat_features.npz`, 99 KB) | raw 175 MB EEG archive is not deployed; raw ingestion is local-only |
| Ollama (Qwen 2.5 3B) | **separate, secured endpoint you control** | cannot run on Vercel; optional |

## Steps (≈ 10 minutes)

1. **Push the repo to GitHub.**
2. **Vercel → Add New → Project → import the repo.** Keep **Root Directory = `./`** (not `frontend`). If Vercel shows a multi-"Services" screen, choose **Import single project / Other**: `vercel.json` already defines the build, output and API rewrite. Do *not* deploy `frontend` and `app` as two projects.
3. **Add the database:** Vercel → *Storage* → *Create* → **Neon (Postgres)** → connect it to this project. This injects `DATABASE_URL`/`POSTGRES_URL` automatically (both are read).
4. **Environment variables** (Project → Settings → Environment Variables):

| Name | Required | Value / purpose |
|---|---|---|
| `PRISM_BOOTSTRAP_ADMIN_EMAIL` | first deploy | your email; becomes the first admin (only if no user exists) |
| `PRISM_BOOTSTRAP_ADMIN_PASSWORD` | first deploy | strong password ≥ 12 chars, mark **Sensitive**; **delete it after first sign-in** |
| `OLLAMA_HOST` | optional | `https://…` URL of your secured Ollama endpoint (see below) |
| `OLLAMA_API_KEY` | optional | bearer token your proxy checks; sent server-side only |
| `OLLAMA_MODEL` | optional | e.g. `qwen2.5:3b` |
| `PRISM_ALLOW_REMOTE_OLLAMA` | with `OLLAMA_HOST` | `1` (remote endpoints must be https) |
| `PRISM_DEMO_LLM` | optional | `0` to keep the public demo extractive-only |
| `PRISM_EMBEDDINGS` | optional | default `auto` (ONNX MiniLM, LSA fallback) |

5. **Deploy**, then open the URL and check `/api/health` → `{"status":"ok","database":"ok","env":"production"}`.
6. **Sign in** (footer → Researcher sign-in), remove the bootstrap password variable, and — only if you have a real ethics approval — record it under *Researcher → Study & Ollama* to open participant data collection. Until then the Sensory Lab runs as a demo and saves nothing.

## Connecting Ollama securely (optional)

Vercel can only call a **public https** endpoint, so put Ollama behind an authenticated reverse proxy or tunnel (for example a Cloudflare Tunnel with Access, or nginx/Caddy that requires `Authorization: Bearer <OLLAMA_API_KEY>`). **Never expose Ollama's port directly.** Set `OLLAMA_HOST`, `OLLAMA_API_KEY`, `OLLAMA_MODEL`, `PRISM_ALLOW_REMOTE_OLLAMA=1`. PRISM checks the connection (4 s timeout), reports `ready`, `unreachable`, `unauthorised`, `model_missing` or `not_configured`, and falls back to **labelled extractive answers** whenever generation is unavailable. Public demo generation is rate-limited (default 5/min per client, in-memory and best-effort on serverless). If you do not configure Ollama, the app works fully but answers are extractive, and the UI says so.

## Limits and what was verified

* **Function size:** Python limit is 500 MB uncompressed (Vercel docs). Measured Linux wheels for `requirements.txt`: ≈ 392 MB dependencies + ≈ 30 MB app/model (FAISS, 68 MB, is intentionally excluded from production; exact NumPy search returns identical results for 102 vectors). If a build ever reports it is too large, set `VERCEL_ANALYZE_BUILD_OUTPUT=1` to see the biggest files or enable large functions with `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`.
* **Duration:** `maxDuration` 120 s (Hobby allows up to 300 s). The first EEG-model request trains five models (~10 s locally) and caches the result in the database.
* **Cold start:** first request builds the retrieval index (TF-IDF + 102 MiniLM embeddings, ~1–2 s locally) and checks the schema.
* **Verified locally:** the exact entry module `api/index.py` with `VERCEL=1`, production env, a clean venv containing only `requirements.txt`, and PostgreSQL 16; 90 backend tests on SQLite, on PostgreSQL and in the production profile; browser tests against the production-mode server.
* **Not verified:** an actual Vercel build/deploy (no account/credentials were available here), Neon specifically, Python 3.12 on Vercel (tested on 3.9 locally), cold-start timings on Vercel, and the Linux wheel installation itself.

## Alternative: container hosting

`Dockerfile` + `render.yaml` + `docker-compose.yml` run the same app as a single container with PostgreSQL (the backend also serves the built site). They were not executed during development (Docker unavailable).
