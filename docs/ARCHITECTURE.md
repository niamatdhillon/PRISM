# PRISM technical architecture

```
Browser (React + TypeScript + Vite; Three.js loaded lazily for 3D/camera/WebXR)
   │  same-origin /api/*  (Vite proxy in dev; Vercel rewrite or reverse proxy in production)
   ▼
FastAPI backend (backend/app.py)               ┌──────────────────────────┐
 ├─ routers/public       health, study info,   │ PostgreSQL (production)  │
 │                        consent text, bibliography │ or SQLite (local)  │
 ├─ routers/participant  enrol, my sessions,   │ via SQLAlchemy + Alembic │
 │                        export, delete, withdraw └──────────▲───────────┘
 ├─ routers/auth         staff login/logout                   │
 ├─ routers/admin        analytics, datasets, ML, users, audit, system
 └─ routers/admin_lab    NLP, RAG, Ollama settings            │
        │                                                     │
        ├─ rag.py  ingest → chunk → TF-IDF + embeddings (FAISS) → hybrid retrieval → answer → verify
        ├─ llm.py  Ollama client (loopback only)  ◄──── local Ollama server (never exposed publicly)
        ├─ ml_common.py / ml_behavioural.py / public_eeg.py   scikit-learn pipelines
        └─ analytics.py, nlp.py
```

## Trust boundaries and access control

| Actor | Credential | Can reach |
|---|---|---|
| Anonymous visitor | none | landing, about/consent text, bibliography, practice-mode lab (no storage), health |
| Participant | httpOnly cookie holding a random secret (only its SHA-256 is stored); recovery code = the secret | **only their own** sessions: view, export, delete, withdraw |
| Researcher | email + Argon2id password → opaque session token in httpOnly cookie (hash stored; 8 h; revocable) | analytics, exports, NLP/RAG, ML runs, datasets (read), Ollama status/test |
| Admin | as above, role `admin` | everything above + ethics gate, retention/purge, user management, dataset ingestion, participant erasure, Ollama settings |

Authorisation is enforced server-side by FastAPI dependencies (`security.require_staff`, `require_admin`, `current_participant`); hiding UI tabs is cosmetic only. Mutating `/api` requests must carry `X-PRISM-Client: web` (no CORS is enabled, cookies are SameSite=Lax) as CSRF defence. Logins are generic on failure, lock an account for 15 minutes after 5 failures, and are audit-logged. Security headers (nosniff, `Permissions-Policy: camera=(self)`, no-store) are set on every API response.

## Data model (alembic/versions/0001_initial.py)

`users`, `auth_sessions`, `participants`, `consents`, `experiment_sessions`, `trials`, `study_config` (ethics, retention, ollama), `datasets`, `model_runs`, `audit_log`, `app_errors`. Foreign keys cascade so deleting a participant or session removes trials. Withdrawal deletes sessions/trials/reflections and keeps only the consent row (version, text hash, ethics reference, timestamps).

## Ethics gate

Participant enrolment and session submission return 403 until an administrator records an approval (body + reference). The reference is stored with every consent. This is a procedural control only: it does not verify that an approval exists.

## Experiment protocol

`backend/protocol.py` is the single source for each task's objective, variables and procedure; `backend/schemas.py` validates every submitted session (allowed tasks/trial types, ranges, timeouts vs RT, camera/display consistency, trial counts). Timing: RT is measured from the first painted frame (`requestAnimationFrame` after render / the Three.js frame in which the target was added) to the input event's `timeStamp`; browser display and input latency remain and vary by device (Anwyl-Irvine 2021; Bridges 2020 are in the corpus).

## Display modes

| Mode | Implementation | Claim |
|---|---|---|
| `scene3d` | Three.js perspective scene, parallax by pointer or device orientation | real 3D rendering, no camera |
| `camera_overlay` | `getUserMedia` video behind a transparent Three.js canvas | **overlay only, not spatial AR** |
| `webxr` | Three.js `renderer.xr` with an `immersive-ar` session (`local`, optional `dom-overlay`) | genuine WebXR where `navigator.xr.isSessionSupported('immersive-ar')` is true (e.g. Chrome on supported Android). **Not testable on the dev machine.** WebXR depth sensing is not used |
| `canvas2d` | 2D canvas pseudo-depth | fallback when WebGL is unavailable |

Capabilities are detected and unavailable modes are disabled in the UI; fallbacks are recorded in the data (`display_mode`, `camera_used`).

## Machine learning

Common protocol (`ml_common.py`): participant-grouped hold-out (25%) → model selection by `GroupKFold` CV *inside the training participants* (PR-AUC primary) → single evaluation on the held-out test set → majority and prior baselines → ROC-AUC, PR-AUC, precision/recall/F1, confusion matrix, Brier + calibration bins, permutation importance (test), participant-cluster bootstrap CIs. Candidates: logistic regression (L2/L1), RBF-SVM, random forest, gradient boosting; imputation and scaling are fitted inside each fold. The behavioural model refuses to run below 60 sessions / 20 participants / 15 per class.

## RAG

25 abstracts → 3-sentence chunks (stride 2) with offsets → TF-IDF (light stemmer) and MiniLM embeddings (LSA fallback in the light image) → FAISS `IndexFlatIP` (persisted under `var/rag_index`) → hybrid reciprocal-rank fusion → sufficiency gate → Ollama (numbered-passage prompt) or extractive fallback → verification (citations exist, ≥50% lexical support, no author-year/DOI references outside the retrieved sources). Ollama can also paraphrase a single reflection and explain a stored model run; numbers in the explanation are string-checked against the stored evaluation.

## Deployment shape

Static frontend (Vercel or any CDN) + containerised backend (any Docker host) + managed PostgreSQL. The frontend and API must be served from the **same origin** (Vercel rewrite or reverse proxy) so cookies are first-party. Ollama stays on a trusted local machine; the backend only talks to loopback Ollama hosts unless `PRISM_ALLOW_REMOTE_OLLAMA=1` is set deliberately for a private network.
