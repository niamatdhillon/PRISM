# PRISM data dictionary

Generated from `backend/data/data_dictionary.json` (single source of truth; schema in `backend/schema.py`).

## participants

| Field | Type | Description |
|---|---|---|
| `code` | string | Random pseudonymous code (P-XXXXXX) shown to the participant. Not derived from any personal data. |
| `token_hash` | sha256 | Hash of the random secret in the participant's cookie / recovery code. The secret itself is never stored. |
| `status / withdrawn_at` | active|withdrawn | Withdrawal deletes all sessions, trials and reflections and invalidates the secret. |

## consents

| Field | Type | Description |
|---|---|---|
| `version, text_sha256, ethics_ref, given_at, withdrawn_at` | record | Which consent text (hash) was accepted under which ethics reference and when. Retained after withdrawal as a minimal governance record. |

## experiment_sessions

| Field | Type | Description |
|---|---|---|
| `id` | string | Random session identifier. |
| `device` | desktop|tablet|phone|unknown | Coarse category from viewport size and touch support; no user-agent string is stored. |
| `display_mode` | canvas2d|scene3d|camera_overlay|webxr | Mode actually used for the visual-search task (fallbacks are recorded, never hidden). |
| `camera_used` | bool | Whether the camera backdrop was active. No image or video is ever captured, stored or uploaded. |
| `audio_enabled` | bool | Whether sound was enabled. |
| `condition` | json | complexity 0-2 (6/18/36 items), movement, distraction (2 Hz low-contrast flicker), brightness 0.2-1.0, block_modalities (visual/audiovisual per block). |
| `ratings` | json 0-100 | pre_stress, post_stress (single-item self-report), perceived_difficulty, six NASA-TLX items (performance: 0 = perfect, 100 = failure). Raw TLX = mean of six. |
| `timing` | json | median_frame_ms (display refresh estimate in 3D modes) and viewport size, for timing-quality screening. |
| `reflection` | text|null | Optional free text (max 4000 chars); participants are asked not to include identifiers. Visible to researchers only. |

## trials

| Field | Type | Description |
|---|---|---|
| `task` | enum | visual_search, auditory_oddball, task_switching, flanker, pattern, arithmetic. |
| `trial_type` | string|null | oddball: standard|deviant; task switching: first|repeat|switch; flanker: congruent|incongruent; pattern: progression|alternation|cycle. |
| `modality` | enum | visual, audiovisual (tone at target onset; only if actually delivered), auditory, none. |
| `set_size, stimulus` | int, string | visual search: items on screen and target side; other tasks: stimulus descriptor (e.g. 'colour:cyan-circle'). |
| `response, correct` | string, bool|null | Participant response and correctness (null for timeouts). Oddball: response 'press' or null; correct also covers correct rejections. |
| `rt_ms` | float|null | Time from the first painted frame showing the stimulus (performance.now) to the input event timestamp. Includes display and input latency that varies by device. |
| `onset_epoch_ms` | float | Stimulus onset as epoch milliseconds (timeOrigin + performance.now). |
| `timeout / anticipatory` | bool | No response in the window / RT below 150 ms (100 ms for tones); anticipatory trials are excluded from RT summaries. |

## derived_session_metrics

| Field | Type | Description |
|---|---|---|
| `vs_mean_rt, vs_rt_cv, vs_accuracy` | float | Visual-search mean RT of correct non-anticipatory trials, coefficient of variation, and accuracy (timeouts count as incorrect). |
| `od_dprime, od_hit_rate, od_fa_rate` | float | Oddball signal-detection sensitivity d' (log-linear corrected), hit and false-alarm rates. |
| `ts_switch_cost_rt/acc` | float | Task-switching cost: switch minus repeat RT (ms); repeat minus switch accuracy. |
| `fl_congruency_rt/acc` | float | Flanker effect: incongruent minus congruent RT; congruent minus incongruent accuracy. |
| `tlx_global, stress_delta` | float | Raw NASA-TLX (mean of six items) and post minus pre stress. |
