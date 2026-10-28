export type Source = "participant" | "synthetic";
export interface Trial { idx: number; block: number; kind: "target" | "arithmetic"; modality: "visual" | "audiovisual" | "none"; set_size: number;
  target_side: "left" | "right" | null; response: string | null; correct: boolean | null; rt_ms: number | null; timeout: boolean; anticipatory: boolean; }
export interface Ratings { pre_stress: number | null; post_stress: number | null; tlx_mental: number | null; tlx_physical: number | null; tlx_temporal: number | null;
  tlx_performance: number | null; tlx_effort: number | null; tlx_frustration: number | null; }
export interface Condition { complexity: 0 | 1 | 2; movement: boolean; distraction: boolean; audio_enabled: boolean; block_modalities: ("visual" | "audiovisual")[]; }
export interface SessionRecord { session_id: string; participant_id: string; source: Source; consent: boolean; consent_version: string; created_at: string;
  completed_at: string | null; completed: boolean; device: "desktop" | "tablet" | "phone" | "unknown"; condition: Condition; ratings: Ratings; reflection: string | null; trials: Trial[]; }
export interface Status { mode: "local" | "hosted"; persistence: "sqlite" | "browser"; persistence_note: string;
  ollama: { available: boolean; reason: string; models: string[]; model: string | null };
  retrieval: { documents: number; chunks: number; chunking: string; lexical_method: string; semantic_method: string; semantic_neural: boolean; semantic_description: string; note: string };
  components: Record<string, unknown>; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any;
