# Datasets and literature sources

PRISM keeps three kinds of data strictly separate and never merges them without an explicit, documented methodology.

| Kind | What | Where it is used |
|---|---|---|
| **A. PRISM participant observations** | Consented sessions collected by this application | Admin dashboard, behavioural model |
| **B. Public research datasets** | PhysioNet *eegmat* (below) | Admin → Datasets / Prediction (separate model) |
| **C. Scientific literature** | 25 abstracts (Europe PMC / arXiv) | RAG corpus only |

**There is no synthetic or simulated research data anywhere in PRISM** (the earlier generator was removed; a test asserts it stays removed).

## B1. EEG During Mental Arithmetic Tasks (used)

| Item | Value |
|---|---|
| Source / URL | https://physionet.org/content/eegmat/1.0.0/ |
| DOI | 10.13026/C2JQ1P |
| Publisher | PhysioNet (MIT Laboratory for Computational Physiology) |
| Licence | Open Data Commons Attribution License v1.0 (attribution required) — verified on the dataset page |
| Primary paper | Zyma I, Tukaev S, Seleznov I, et al. *Electroencephalograms during Mental Arithmetic Task Performance.* Data 2019;4(1):14. doi:10.3390/data4010014 (DOI verified on Crossref) |
| Platform citation | Goldberger AL, et al. PhysioBank, PhysioToolkit, and PhysioNet. Circulation 2000. doi:10.1161/01.CIR.101.23.e215 |
| Download | https://physionet.org/static/published-projects/eegmat/eeg-during-mental-arithmetic-tasks-1.0.0.zip (175.1 MB) |
| Archive SHA-256 (as downloaded on the dev machine) | `cbd43c71fbda2eea06c714ef8c2228e47c2444ae7be3e72a5e441889b011f9e7` |
| Participants | 36 (counted from the files; subject-info.csv: 24 "good" / 12 "bad" counters; ages ~16-26) |
| Observations | 72 EDF recordings (rest + task per subject); all 72 per-file SHA-256 checksums from the archive's SHA256SUMS.txt matched during ingestion |
| Measurements | Raw EEG, 500 Hz, 19-20 scalp channels (10/20), linked-ear reference; ICA-cleaned by the authors |
| Missing values | None in the derived feature matrix (0 of 12,960 cells) |
| PRISM preprocessing | First 60 s of each recording → six 10 s epochs → Welch relative band power (delta/theta/alpha/beta) per region + theta/alpha and theta/beta ratios → 432 epochs (216 rest, 216 task) |
| Target | Rest (0) vs mental arithmetic (1): an experimental condition, **not** a self-reported workload rating |
| Suitable for | Demonstrating a leakage-safe, subject-grouped physiological workload classifier on real data |
| Not suitable for | Predicting PRISM's behavioural/self-report outcomes; any clinical inference |
| Caveats | Baseline files are longer than the "60 s" the README states (e.g. 182 s); rest always precedes the task (order confound); README mentions a 30 Hz "high-pass" filter (probably low-pass); includes participants under 18 (as published) |

To reproduce: download the zip to `datasets_cache/eegmat/eegmat.zip` (git-ignored), then Admin → Datasets → *Ingest dataset* (or `python -c "from backend import public_eeg; public_eeg.ingest()"`).

## B2. Reviewed but not used

Only catalogue metadata (Zenodo API) was inspected; contents were **not** verified and nothing was downloaded.

| Dataset | URL | Licence (catalogue) | Size (catalogue) | Reason |
|---|---|---|---|---|
| UNIVERSE (mental workload & stress, uncontrolled environments) | https://zenodo.org/records/10371068 | CC-BY-4.0 | ~20 GB | GB-scale |
| EPIStress (physiological signals, cognitive stress) | https://zenodo.org/records/16407549 | CC-BY-4.0 | ~7 GB | GB-scale |
| MOCAS (objective cognitive workload) | https://zenodo.org/records/10396672 | CC-BY-4.0 | not verified | candidate for future work |
| Mental workload and stress in everyday situations | https://zenodo.org/records/15681263 | CC-BY-4.0 | ~1.8 GB | not verified |
| MultiPhysio-HRC | https://zenodo.org/records/18668043 | CC-BY-4.0 | ~15.7 GB | GB-scale |

## C. Literature corpus

25 documents: titles, authors, venue, year, DOI/PMID/arXiv id and abstract retrieved by `scripts/fetch_corpus.py` from the Europe PMC and arXiv APIs (identifiers were checked against API metadata; several identifiers recalled from memory were wrong and were corrected). See `backend/data/corpus_raw.json`. Only abstracts are stored; copyright remains with the publishers/authors.
