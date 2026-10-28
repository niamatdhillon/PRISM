# PRISM — Predictive Research through Interactive Sensory Mapping

> *Understand the signals. Explore the patterns. Ground the insight in evidence.*

PRISM is an **exploratory research prototype**, not a clinically validated or diagnostic system. It combines an interactive sensory task battery, structured session recording, an NLP + RAG laboratory over a verified literature corpus, a participant-grouped workload classifier, and a computed analytics dashboard.

**Research question.** Can interactions with controlled sensory environments provide useful behavioural signals for predicting task-related cognitive workload, and can NLP and retrieval-augmented generation help interpret participants' reflections and connect findings to scientific evidence?

## What is implemented (and tested)

| Area | Status |
|---|---|
| Sensory Lab: consent → baseline stress → condition setup → 3 practice + 2×12 target trials + 6 arithmetic items → NASA-TLX + stress + optional reflection | Implemented; one full session driven end-to-end in a browser (see *Testing*) |
| Conditions: complexity (6/18/36 items), movement, distraction flicker, optional tone (visual vs audiovisual blocks, randomised order), mute/volume controls | Implemented |
| Structured storage (SQLite locally; browser `localStorage` when hosted) + CSV export (sessions, trials) + delete controls | Implemented; API paths unit-tested (19 pytest tests) |
| Dashboard: computed descriptives, 95% CIs, condition tables, RT histogram, TLX subscales, multisensory paired test, within-person series, missing-data table; three data sources never pooled | Implemented |
| NLP lab: normalisation, tokenisation, stop-words, light stemming, linguistic features, TF-IDF terms, theme/lexicon polarity, nearest literature | Implemented |
| RAG: 16-document corpus (abstracts + metadata from Europe PMC/arXiv), chunking, TF-IDF + semantic index, side-by-side retrieval, hybrid Q&A, insufficient-evidence gate, citation verification | Implemented |
| Semantic embeddings: `sentence-transformers/all-MiniLM-L6-v2` locally; **LSA fallback** (TF-IDF+SVD, not neural) in hosted mode or if the model cannot load | Both paths implemented; neural path run locally, LSA path covered by unit tests |
| Generation: local Ollama when available, otherwise labelled **extractive fallback** | Ollama code path implemented but **not exercised: Ollama is not installed on the development machine** |
| ML: majority baseline, logistic regression, random forest; participant-grouped split + grouped CV; confusion matrix, permutation importance | Implemented and run on **synthetic** data only (see below) |
| WebXR / camera AR | **Not implemented** (stretch goal). The "spatial" scene is a 2D canvas with depth scaling and parallax. |
| GitHub push / Vercel deploy | **Not done**: `gh` and `vercel` CLIs are not installed/authenticated here. Config is prepared; see *Publishing*. |

## Architecture

```
frontend/  React + TypeScript + Vite (hash router, dependency-free SVG charts, canvas stimulus engine)
backend/   FastAPI
  schema.py     pydantic session/trial schema (consent enforced for participant records)
  db.py         SQLite persistence (local mode)
  nlp.py        preprocessing, linguistic features, theme lexicons
  rag.py        ingest → chunk → TF-IDF + semantic index → retrieve → answer → verify → evaluate
  llm.py        Ollama client (disabled in hosted mode)
  ml.py         workload classification + evaluation
  analytics.py  statistics + CSV export
  synthetic.py  documented synthetic demonstration generator (every row source="synthetic")
  data/         corpus_raw.json, qrels.json, data_dictionary.json
api/index.py   Vercel entry point
scripts/       fetch_corpus.py (re-fetches abstracts), make_data_dictionary.py
tests/         pytest suite
```

**Local mode** (default): SQLite persistence; optional Ollama; neural embeddings if `sentence-transformers` is installed.
**Hosted mode** (auto on Vercel or `PRISM_MODE=hosted`): the server stores nothing and never contacts Ollama/localhost; sessions stay in the visitor's browser and the client posts records to stateless analytics endpoints; semantic retrieval uses LSA; answers are extractive. Text submitted to the NLP/RAG lab is processed by the server but not stored.

## NLP and RAG methodology

1. **Corpus.** `scripts/fetch_corpus.py` pulls title, authors, venue, year, DOI and abstract for 13 PubMed records (Europe PMC API) and 3 arXiv papers. Identifiers were checked against the APIs (several identifiers I first recalled were wrong and were corrected from API metadata). Only abstracts are stored; copyright stays with the publishers/authors.
2. **Chunking.** 3-sentence windows, stride 2 → 59 passages, with character offsets back into the abstract.
3. **Indexes.** TF-IDF (sublinear tf, light suffix stemmer, stop-word removal) and a semantic index (MiniLM sentence embeddings, or LSA fallback), both cosine similarity.
4. **Q&A.** Candidates from reciprocal-rank fusion of both rankings. A *sufficiency gate* answers "insufficient evidence" unless a single passage covers ≥40% of the question's content terms (≥2 terms), or — with neural embeddings only — the best cosine ≥ 0.50. These thresholds are judgement calls tuned by eye on a handful of probe questions, not fitted on a held-out set.
5. **Answer modes.** *Generated* (Ollama, prompt restricted to numbered passages) or *extractive* (top sentences quoted verbatim, each with `[n]`). The UI badge states which one produced the text. An extractive system is **not** generative RAG.
6. **Verification.** Each answer sentence must cite an existing passage and share ≥50% of its content stems with it. This catches fabricated/absent citations and unsupported sentences; it cannot prove entailment.

**Retrieval evaluation (real, small).** 16 queries with document-level relevance judgements written by the AI assistant that built PRISM (single annotator, queries written after reading the abstracts → optimistic; see `backend/data/qrels.json`). Neural run on the dev machine (MiniLM):

| Method | P@1 | P@3 | P@5 | R@3 | R@5 | MRR |
|---|---|---|---|---|---|---|
| TF-IDF | 0.875 | 0.396 | 0.250 | 0.875 | 0.896 | 0.906 |
| Semantic (MiniLM) | 0.875 | 0.417 | 0.275 | 0.938 | 0.979 | 0.938 |

The difference is small and not statistically meaningful at n=16. Recompute with `GET /api/rag/evaluation` (values depend on the embedder in use; LSA numbers differ).
Off-topic probes ("capital of France", "sourdough", "football World Cup") return *insufficient evidence* (asserted in tests). The paraphrase "Is loud sound harmful for concentration?" was observed to be accepted only after lowering the neural threshold to 0.50 — expect false negatives on loosely worded questions.

## Predictive ML methodology

- **Target:** session-level high perceived workload = raw NASA-TLX ≥ 50 (arbitrary documented cut-off).
- **Features:** mean/SD RT, accuracy, error rate, timeouts, arithmetic accuracy, device (behaviour-only); a second set adds design conditions. TLX items and post-task stress are excluded (they define/co-occur with the label).
- **Protocol:** `GroupShuffleSplit` by participant (25% test, fixed seed 42), grouped 5-fold CV on the train part, majority-class baseline, class-weighted models.
- **Real participant data:** evaluation is *refused* (status "UNEVALUATED") below 30 sessions / 10 participants / 8 per class.
- **What the shipped numbers are:** they come from **synthetic demonstration data** (60 simulated participants × 3 sessions, generative formulas documented at the top of `backend/synthetic.py`). The metrics only show the pipeline recovers the simulator's assumptions. **They are not evidence about humans and must not be quoted as such.** Run on 180 synthetic sessions (45 test sessions / 15 held-out participants; test classes 26 low / 19 high), behaviour-only features:

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC | CV F1 (train) |
|---|---|---|---|---|---|---|
| Majority baseline | 0.578 | 0.000 | 0.000 | 0.000 | 0.500 | 0.000 |
| Logistic regression | 0.844 | 0.875 | 0.737 | 0.800 | 0.913 | 0.736 ± 0.095 |
| Random forest | 0.844 | 0.929 | 0.684 | 0.788 | 0.889 | 0.650 ± 0.097 |

No public labelled workload dataset is integrated (none was verified for provenance/licence within the time budget).

## Dataset provenance

| Data | Source | Status |
|---|---|---|
| Participant observations | Recorded by this app with consent | Empty until someone completes a session |
| Synthetic demonstration data | `backend/synthetic.py` | Labelled `source="synthetic"` everywhere; deletable with "Clear demonstration records" |
| Public datasets | none bundled | Dashboard shows 0 |
| Literature corpus | Europe PMC (PubMed records) and arXiv abstracts | 16 documents; see Method page for the bibliography |

## Local setup

Requirements: Python ≥ 3.9, Node ≥ 18.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-local.txt      # add sentence-transformers (~1 GB incl. torch); use requirements.txt for the light install
cd frontend && npm install && cd ..
# terminal 1 – API
uvicorn backend.app:app --port 8000
# terminal 2 – UI (proxies /api to :8000)
cd frontend && npm run dev                  # http://127.0.0.1:5173
# tests
python -m pytest -q
```

The first neural run downloads `all-MiniLM-L6-v2` (~90 MB) from Hugging Face; set `PRISM_EMBEDDINGS=lsa` to skip it.

### Ollama (optional)

PRISM never downloads a model for you. Install [Ollama](https://ollama.com), pull a model you have room for, then optionally pin it:

```bash
ollama pull <model>          # your choice
export OLLAMA_MODEL=<model>  # optional; default is the first installed model
```

`GET /api/status` and the Q&A tab show whether Ollama is reachable. If it is not, answers fall back to the labelled extractive mode. (Status on the development machine: Ollama not installed.)

## Hosted mode and Vercel

`vercel.json` builds the frontend (`frontend/dist`) and serves `api/index.py` (the same FastAPI app) as a Python function; `VERCEL` makes the app choose hosted mode. `requirements.txt` is deliberately light (no torch). Sessions are kept in the browser; **there is no durable server database**. If you need one, add a hosted Postgres (e.g. Vercel Marketplace/Neon) behind `backend/db.py`.

Not verified: the Vercel Python bundle size with scikit-learn+scipy (limit 250 MB unzipped) and cold-start time were **not tested** because the Vercel CLI is unavailable here.

```bash
npm i -g vercel && vercel login          # you
vercel                                    # preview deploy; inspect the URL and /api/status
vercel --prod                             # only after the preview works
```
Dashboard alternative: import the GitHub repo in Vercel; no environment variables are required.

## Publishing to GitHub

```bash
gh auth login
gh repo create prism-sensory-intelligence --private --source=. --remote=origin --push
```
(Use `--public` only after you are happy no participant records are in the tree; `data/` and `*.sqlite3` are git-ignored.)

## Ethical safeguards

Consent is enforced server-side for participant records; no names/emails/IPs/camera/microphone; pseudonymous random ID; coarse device class; export and deletion controls; synthetic/participant separation; slow low-contrast flicker with a photosensitivity warning; reduced-motion respected. **This prototype has no ethics-committee approval.** A real study needs one, a privacy notice and a data-protection review.

## Known limitations

- Supervised results are from simulated data; real-data evaluation needs ≥ 30 sessions from ≥ 10 participants.
- Retrieval test set is tiny and single-annotator; corpus is abstracts only.
- Browser RT includes display/input/audio latency that varies by device; audio–visual synchrony is not hardware-verified.
- Condition choice is self-selected unless "Randomise" is used → confounded.
- Stress is a single self-report item, not a validated scale; no clinical or diagnostic claims are made.
- No WebXR/AR. No durable hosted database. Hosted mode has no LLM.
- Not tested: Ollama generation, Vercel deployment, Safari/Firefox, screen readers, real touch devices.

## Demonstration guide (≈5 min)

1. **Overview** – read the research question; note the "synthetic" vs "participant" badges.
2. **Sensory Lab** – click through consent, run the *Multisensory* preset, answer the questionnaires, write a one-sentence reflection.
3. **Dashboard** – "Load synthetic demo data", compare tabs, show CIs, the multisensory paired test, the missing-data table, export CSV, then "Clear demonstration records".
4. **NLP + RAG** – (a) *Reflection analysis*: show preprocessing chips and TF-IDF terms; (b) *Keyword vs semantic*: query "why do people respond faster when sound and light are combined?" and compare lists; (c) *Evidence-grounded Q&A*: ask a literature question, click a `[n]` citation, then ask "What is the capital of France?" to show the insufficient-evidence state; (d) *Evaluation*: the P@k table and its annotation caveat.
5. **Prediction** – synthetic-data banner, baseline vs models, confusion matrix, then switch to *Participant data* to show it refuses to report metrics on too little data.
6. **Method** – hypotheses, data dictionary, limitations.
