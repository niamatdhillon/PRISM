# PRISM data dictionary

Generated from `backend/data/data_dictionary.json` (single source of truth; schema in `backend/schema.py`).

## session

| Field | Type | Description |
|---|---|---|
| `session_id` | string | Random identifier of one experimental session. |
| `participant_id` | string | Pseudonymous random ID generated in the participant's browser (no name, email or IP stored). Synthetic participants are prefixed SYN-. |
| `source` | enum — participant | synthetic | Provenance. 'synthetic' rows are generated demonstration data and must never be reported as human results. No public behavioural dataset is bundled. |
| `consent / consent_version` | bool / string | Participant observations are rejected unless consent=true. Version identifies the consent text shown. |
| `created_at / completed_at` | ISO-8601 UTC | Session start and completion timestamps. |
| `completed` | bool | True only if all blocks and the post-task questionnaire were finished. |
| `device` | enum — desktop | tablet | phone | unknown | Coarse category from viewport width + touch support. No user-agent string is stored. |
| `condition.complexity` | int 0-2 | Visual clutter: number of items on screen (0=6, 1=18, 2=36). |
| `condition.movement` | bool | Whether the items drift. |
| `condition.distraction` | bool | Irrelevant full-field luminance flicker during trials. |
| `condition.audio_enabled` | bool | Whether the participant allowed sound; if true, one block is visual-only and one audiovisual (order randomised). |
| `condition.block_modalities` | list | Modality of block 0 and block 1. |
| `ratings.pre_stress / post_stress` | int 0-100 | Single-item visual-analogue self-rating 'How stressed do you feel right now?' before/after the tasks (0 = not at all, 100 = extremely). Self-report, not a clinical measure. |
| `ratings.tlx_mental ... tlx_frustration` | int 0-100 | Six NASA-TLX items: mental, physical, temporal demand, performance (0 = perfect, 100 = failure), effort, frustration. Analysed as raw (unweighted) TLX = mean of six. |
| `reflection` | string | null | Optional free text (<= 4000 chars) written by the participant. Participants are told not to include personal identifiers. |

## trial

| Field | Type | Description |
|---|---|---|
| `idx / block` | int | Trial order within session; block 0 and 1 = target-localisation blocks, block 2 = arithmetic task. |
| `kind` | enum — target | arithmetic | Task type. |
| `modality` | enum — visual | audiovisual | none | Cue modality in the block. audiovisual adds a short tone at target onset. |
| `set_size` | int | Number of items on screen (6/18/36) for target trials. |
| `target_side / response` | string | Side where the diamond appeared and the participant's response (left/right; true/false for arithmetic). |
| `correct` | bool | null | Whether the response was correct; null for timeouts. |
| `rt_ms` | float | null | Response time from the first animation frame showing the stimulus (performance.now), ms. null on timeout. |
| `timeout / anticipatory` | bool | No response within 2.5 s (target) / RT < 150 ms (flagged, excluded from RT summaries). |

## derived_session_metrics

| Field | Type | Description |
|---|---|---|
| `mean_rt_ms, median_rt_ms, rt_sd_ms, rt_cv` | float | Computed from correct, non-anticipatory target trials only. rt_cv = SD/mean (intra-individual variability). |
| `accuracy / error_rate` | float | accuracy = correct / all target trials (timeouts count as incorrect); error_rate = wrong / answered trials. |
| `arithmetic_accuracy` | float | Proportion correct on the 6 arithmetic items. |
| `tlx_global` | float | Raw NASA-TLX 0-100 (null if any item missing). |
| `stress_delta` | int | post_stress - pre_stress. |
