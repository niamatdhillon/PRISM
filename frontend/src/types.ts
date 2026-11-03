// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any;
export type DisplayMode = "canvas2d" | "scene3d" | "camera_overlay" | "webxr";
export type TaskId = "visual_search" | "auditory_oddball" | "task_switching" | "flanker" | "pattern" | "arithmetic";
export interface TaskSpec { title: string; module: string; objective: string; independent: string[]; dependent: string[]; procedure: string; measures: string; practice: number; trials: number; trial_types: string[]; max_trials: number }
export interface StudyInfo { collection_open: boolean; ethics: { reference: string; body: string; approved_on: string } | null; consent: { version: string; paragraphs: string[] };
  protocol: { version: string; tasks: Record<TaskId, TaskSpec>; display_modes: DisplayMode[] } }
export interface Trial { idx: number; task: TaskId; block: number; modality: "visual" | "audiovisual" | "auditory" | "none"; trial_type: string | null; set_size: number | null; stimulus: string | null;
  response: string | null; correct: boolean | null; rt_ms: number | null; onset_epoch_ms: number | null; timeout: boolean; anticipatory: boolean }
export interface Ratings { pre_stress: number | null; post_stress: number | null; perceived_difficulty: number | null; tlx_mental: number | null; tlx_physical: number | null; tlx_temporal: number | null;
  tlx_performance: number | null; tlx_effort: number | null; tlx_frustration: number | null }
export interface Condition { complexity: 0 | 1 | 2; movement: boolean; distraction: boolean; brightness: number; block_modalities: ("visual" | "audiovisual")[] }
export interface SessionPayload { session_id: string; protocol_version: string; started_at: string; completed_at: string | null; completed: boolean; device: "desktop" | "tablet" | "phone" | "unknown";
  display_mode: DisplayMode; camera_used: boolean; audio_enabled: boolean; condition: Condition; tasks_completed: TaskId[]; ratings: Ratings; timing: { median_frame_ms: number | null; viewport: string | null };
  reflection: string | null; trials: Trial[] }
export interface Me { code: string; sessions: number; consent: { version: string; given_at: string; ethics_ref: string } | null }
export interface Staff { email: string; role: "admin" | "researcher" }
