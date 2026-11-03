# PRISM — Predictive Research through Interactive Sensory Mapping

> *Understand the signals. Explore the patterns. Ground the insight in evidence.*

PRISM is a research platform that combines an interactive sensory task battery (3D, camera-overlay and WebXR modes), consented participant data collection, a role-protected researcher area, an NLP + retrieval-augmented-generation laboratory (local Ollama), and leakage-safe predictive modelling. **It is not a diagnostic system and makes no clinical claims.** It has **no ethics approval**; participant data collection is technically locked until a researcher records one.

## The zero-synthetic-data rule

There is no simulated, synthetic or demonstration research data anywhere in PRISM. The old generator, synthetic dashboard tab and synthetic model were deleted, and tests assert that they stay deleted. Three sources are kept apart:

| Source | Used for |
|---|---|
| **A. PRISM participant observations** (consented, in the database) | Dashboard, behavioural model |
| **B. Public research datasets** (PhysioNet *eegmat*, ODC-By 1.0) | Separate EEG model; never merged with A |
| **C. Scientific literature** (25 abstracts, Europe PMC/arXiv) | RAG only |

With no participant data, the dashboard shows "no data" and the behavioural model shows **UNEVALUATED — INSUFFICIENT REAL DATA**. See [docs/DATASETS.md](docs/DATASETS.md).

## What is in the box

- **Participant experience** (`#/`, `#/participate`, `#/my-data`, `#/about`): landing, consent and enrolment (pseudonymous code + recovery code), six tasks with objectives/variables/practice/instructions, NASA-TLX + stress + difficulty ratings, optional reflection, own-data view/export/delete/withdraw.
- **Tasks** ([protocol](backend/protocol.py)): spatial visual search; auditory oddball (d′); task switching (switch cost); flanker (distraction resistance); pattern recognition; mental arithmetic.
- **Display modes for visual search**: `scene3d` (Three.js 3D scene), `camera_overlay` (live camera behind 3D shapes — **not spatial AR**), `webxr` (genuine `immersive-ar` session where supported), `canvas2d` (fallback). Camera is opt-in per session, video-only, never recorded/uploaded; front/rear switch, stop button, permission-denied fallback. Brightness, complexity, movement, flicker, sound (mute/volume) and optional tilt parallax are configurable and recorded.
- **Researcher area** (`#/admin`, sign-in required): dashboard with sample sizes and limits on every chart, participants, datasets, NLP + RAG lab, prediction lab, study/ethics/retention/Ollama/users, system health + audit + error logs.
- **Backend**: FastAPI, SQLAlchemy + Alembic (SQLite locally, PostgreSQL via `DATABASE_URL`), Argon2id auth, RBAC, audit log. Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Data dictionary: [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md).

## Roles and security

| Role | Access |
|---|---|
| Visitor | public pages, practice mode (nothing stored) |
| Participant (cookie secret, no account) | only their own data |
| `researcher` | analytics, exports, NLP/RAG, ML runs, dataset view, Ollama status/test |
| `admin` | all of the above + ethics gate, retention/purge, staff accounts, dataset ingestion, participant erasure, Ollama settings |

Authorisation is enforced on the server for every protected endpoint (tested by calling the endpoints directly, not by looking at the UI). Passwords: Argon2id; 5 failures lock an account 15 min; session tokens are random, stored hashed, revocable, httpOnly + SameSite=Lax cookies (`Secure` in production); mutating requests require `X-PRISM-Client`. **There are no default or hard-coded credentials.**

### Create the first administrator

```bash
python -m backend.cli migrate
python -m backend.cli create-admin you@example.org      # prompts twice for a hidden password (min 12 chars)
```
(`PRISM_ADMIN_PASSWORD` may be set for automation.) Additional staff are created in *Researcher → Study & Ollama*.

### Opening data collection (ethics gate)

Sign in as admin → *Study & Ollama* → enter the approving body and reference of a **real** ethics approval → tick "open". Until then enrolment and session upload return HTTP 403 and the lab runs in practice mode. This is a procedural safeguard; PRISM cannot verify the approval is genuine.

## Local development

Requirements: Python 3.9+ (3.11 in Docker), Node 18+.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-local.txt          # includes sentence-transformers (~1 GB with torch); use requirements.txt for the light profile
python -m backend.cli migrate
python -m backend.cli create-admin you@example.org
uvicorn backend.app:app --port 8000            # API  (docs at /api/docs in development)
cd frontend && npm install && npm run dev       # UI at http://127.0.0.1:5173 (proxies /api)
```
Tests: `python -m pytest -q` and `cd frontend && npm test`. Environment variables: [.env.example](.env.example).

### Ollama

```bash
# macOS app from https://ollama.com (or `ollama serve`), then pull a small model:
ollama pull qwen2.5:3b            # ~1.9 GB; fits easily in 16 GB RAM
```
In *Study & Ollama* choose the model and press *Test generation*. The backend talks to Ollama only on loopback hosts. Status states: `ready`, `unreachable`, `no_models`, `model_missing`, `host_rejected`; call errors are typed (`timeout`, `unreachable`, `model_missing`, `http_error`, `bad_response`). If Ollama is down, answers fall back to a labelled **extractive** mode (verbatim quotes) — never labelled as Ollama. Development machine: Ollama 0.40.6, `qwen2.5:3b` (3.1B, Q4_K_M) pulled, used for the live tests below. Ollama can also paraphrase one reflection and explain a stored model run; it never produces predictive results.

## NLP and RAG

- **NLP:** normalisation, tokenisation, stop-words, light stemming (TF-IDF) and dictionary lemmas (simplemma), linguistic features, TF-IDF terms, RAKE-style keyphrases, theme lexicons, VADER sentiment (descriptive only, with caveats), NMF theme modelling over real reflections (refuses below 10 reflections).
- **RAG:** 25 abstracts → 102 three-sentence chunks → TF-IDF + `all-MiniLM-L6-v2` embeddings in a FAISS `IndexFlatIP` (persisted) → hybrid reciprocal-rank fusion → insufficient-evidence gate → Ollama (numbered-passage prompt) or extractive fallback → verification (each citation exists; ≥50% lexical support; no author-year/DOI references outside the retrieved sources).
- **Retrieval evaluation (measured on the dev machine, neural embeddings):** 25 queries, single annotator (the AI that built PRISM), document-level, written after reading the abstracts → optimistic.

| Method | P@1 | P@3 | P@5 | R@3 | R@5 | MRR |
|---|---|---|---|---|---|---|
| TF-IDF | 0.92 | 0.427 | 0.272 | 0.873 | 0.900 | 0.94 |
| Semantic (MiniLM) | 0.92 | 0.480 | 0.304 | 0.960 | 0.987 | 0.96 |

- **Gate evaluation:** accepts 25/25 answerable and rejects 12/12 off-topic questions — but thresholds were tuned *after* inspecting these same questions (one answerable question was initially rejected, one off-topic accepted), so this is optimistic. Live Ollama (qwen2.5:3b): "Do redundant audio and visual signals speed up responses?" → generated, cited, verified; "Does background noise impair performance?" → the model itself answered INSUFFICIENT_EVIDENCE.
- **Known limits:** the numeric verifier cannot catch wording errors (a 3B model called epochs "subjects" in one explanation); lexical support is not entailment; the corpus is abstracts only.

## Predictive ML

Protocol ([ml_common.py](backend/ml_common.py)): participant-grouped 25% hold-out → model selection by grouped CV *inside the training participants* (PR-AUC) → one test evaluation → majority/prior baselines → ROC-AUC, PR-AUC, precision/recall/F1, confusion matrix, Brier + calibration bins, permutation importance, participant-cluster bootstrap CIs. Candidates: logistic regression (L2, L1), RBF-SVM, random forest, gradient boosting. Imputation/scaling are fitted inside folds.

**Behavioural model (PRISM data → raw TLX ≥ 50):** requires ≥ 60 completed sessions, ≥ 20 participants, ≥ 15 per class. **Current status: UNEVALUATED** (no real participant data exists yet). No performance numbers exist for it.

**Public EEG model (PhysioNet eegmat; rest vs mental arithmetic)** — real data, 36 subjects, 432 epochs (216/216), subject-grouped split (27 train / 9 test subjects, seed 42):

| | Value |
|---|---|
| Selected (CV PR-AUC 0.817 ± 0.121) | logistic regression |
| Test accuracy / F1 / precision / recall | 0.676 / 0.701 / 0.651 / 0.759 |
| Test ROC-AUC (95% CI, participant bootstrap) | 0.700 (0.535 – 0.859) |
| Test PR-AUC / Brier | 0.735 / 0.255 |
| Baselines (test) | majority F1 0.000, acc 0.5; prior ROC-AUC 0.5 |
| Other candidates (test ROC-AUC) | L1-LR 0.694, SVM 0.629, GB 0.657, RF 0.567 |

Interpretation: modest, above-chance discrimination with wide uncertainty; a single split with 9 test subjects. The target is an experimental condition, not self-reported workload, and the rest recording always precedes the task. This model says nothing about PRISM's behavioural data and no clinical claim follows.

## Ethics, privacy, retention

Consent is versioned and hashed; participants can view, export, delete sessions or withdraw (deletes all sessions/trials/reflections, invalidates their secret; a minimal consent record remains). Retention days can be set and enforced (`purge-expired` CLI or admin action). No name/email/IP/user-agent/camera/microphone data is collected. Reflections are visible only to researchers. Every export, deletion, login and configuration change is written to the audit log. Safety text covers flicker and camera use.

## Deployment

Backend must be hosted separately from a static frontend (camera needs HTTPS; Postgres and Python ML do not fit serverless limits well):

1. **Database + backend**: build the [Dockerfile](Dockerfile) (light profile: LSA retrieval, no torch; add `--build-arg EXTRA="sentence-transformers"` if RAM allows) on any Docker host with managed PostgreSQL. [deploy/render.yaml](deploy/render.yaml) and [docker-compose.yml](docker-compose.yml) are provided. Set `DATABASE_URL`, `PRISM_ENV=production`; run `python -m backend.cli migrate` and `create-admin` in the container.
2. **Frontend**: copy [deploy/vercel.json.example](deploy/vercel.json.example) to `vercel.json`, replace the backend host in the rewrite (frontend and API must share one origin so cookies are first-party), then deploy `frontend/`.
3. **Ollama** remains on a trusted local machine; do not expose it to the internet. In a hosted deployment the RAG lab works without it (extractive mode, clearly labelled) and generation is unavailable.

## Evaluation summary of what has actually been run

| Check | Result |
|---|---|
| Backend `pytest` (auth/RBAC, participant isolation, validation, withdrawal/deletion, no-synthetic guards, ML gating & leakage, migrations, analytics, NLP, RAG, Ollama mocks, one live Ollama test) | 81 passed |
| Frontend `vitest` (generators, camera permission/fallback logic with mocked `getUserMedia`, access gating, chart rules) | 16 passed |
| Browser (Chrome-based in-app pane): sign-in, ethics gate, enrolment, 3D visual-search session saved to the DB, camera-denied fallback, datasets ingestion, EEG model page, Ollama explanation, 375 px layout on all 11 routes | exercised manually; see below for what is not covered |

## Known limitations / not verified

- **Real camera feed, WebXR sessions, device sensors, iOS Safari, Android Chrome, Firefox, touch hardware, screen readers: not tested** (the pane blocks capture; no devices). Logic is unit-tested with mocks only. WebXR `immersive-ar` and depth sensing are not exercised; depth sensing is not implemented.
- GitHub push, Vercel/Render deployment, PostgreSQL and Docker were **not performed or run** (no CLI/credentials/Docker on the dev machine). Migrations were tested on SQLite only.
- Timing accuracy is browser-limited (frame-quantised onsets, input/audio latency); no hardware timing validation.
- Behavioural prediction cannot be evaluated until enough real participants exist.
- No ethics approval; collection is gated, not authorised.
- Retrieval/gate evaluations are small, single-annotator and optimistic.
- Light Docker profile uses LSA instead of neural embeddings.
