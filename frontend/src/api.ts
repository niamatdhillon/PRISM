import type { Any, SessionPayload } from "./types";

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

const FRIENDLY: Record<number, string> = {
  401: "Please sign in to continue.", 403: "You don't have access to this area.", 404: "We couldn't find that.", 409: "That conflicts with existing data. Please refresh and try again.",
  422: "Some of the information isn't valid. Please check it and try again.", 429: "You're going a little fast — please wait a moment.", 500: "Something went wrong on our side. Please try again.",
  502: "A connected service didn't respond as expected.", 503: "The service is starting up. Please retry in a moment.", 504: "That took too long. Please try again.",
};
/** Server messages are shown when they are short, human-readable and not a server fault; otherwise a friendly generic message is used. */
function friendly(status: number, detail: unknown): string {
  if (typeof detail === "string" && detail.length < 220 && status < 500 && !/traceback|exception|sqlalchemy|errno|0x[0-9a-f]{4,}/i.test(detail)) return detail;
  return FRIENDLY[status] || "Something unexpected happened. Please try again.";
}

async function req<T = Any>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(method !== "GET" ? { "X-PRISM-Client": "web" } : {}) };
  let r: Response;
  try { r = await fetch(path, { credentials: "same-origin", ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } }); }
  catch { throw new ApiError(0, "We can't reach the server. Please check your connection and try again."); }
  if (!r.ok) {
    let detail: unknown = null;
    try { const j = await r.json(); detail = Array.isArray(j.detail) ? null : j.detail; } catch { /* non-JSON error body */ }
    throw new ApiError(r.status, friendly(r.status, detail));
  }
  const ct = r.headers.get("content-type") || "";
  return (ct.includes("json") ? r.json() : r.text()) as Promise<T>;
}
const post = <T = Any>(p: string, body?: unknown) => req<T>(p, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const put = <T = Any>(p: string, body?: unknown) => req<T>(p, { method: "PUT", body: JSON.stringify(body ?? {}) });
const del = <T = Any>(p: string) => req<T>(p, { method: "DELETE" });

export const demo = {
  capabilities: () => req("/api/public/capabilities"), nlp: (text: string) => post("/api/demo/nlp/analyze", { text }), search: (query: string, k = 5) => post("/api/demo/rag/search", { query, k }),
  ask: (question: string, use_llm: boolean) => post("/api/demo/rag/ask", { question, use_llm }), ragEval: () => req("/api/public/rag-evaluation"), eeg: () => req("/api/public/eeg-model"), literature: () => req("/api/public/literature"),
};

export const api = {
  health: () => req("/api/health"),
  study: () => req("/api/public/study"),
  enroll: (consent_version: string) => post("/api/participants/enroll", { consent: true, consent_version, age_confirmed_18_plus: true }),
  restore: (recovery_code: string) => post("/api/participants/restore", { recovery_code }),
  me: () => req("/api/me"),
  mySessions: () => req("/api/me/sessions"),
  submitSession: (s: SessionPayload) => post("/api/me/sessions", s),
  deleteMySession: (id: string) => del(`/api/me/sessions/${id}`),
  deleteMyData: () => del("/api/me/data"),
  withdraw: () => post("/api/me/withdraw"),
  myExport: (format: "json" | "csv") => req<string>(`/api/me/export?format=${format}`),
  login: (email: string, password: string) => post("/api/auth/login", { email, password }),
  logout: () => post("/api/auth/logout"),
  staff: () => req("/api/auth/me"),
  admin: {
    overview: () => req("/api/admin/overview"), participants: () => req("/api/admin/participants"), eraseParticipant: (c: string) => del(`/api/admin/participants/${c}`),
    analytics: () => req("/api/admin/analytics"), export: (kind: "sessions" | "trials", format: "csv" | "json") => req<string>(`/api/admin/export/${kind}?format=${format}`),
    study: () => req("/api/admin/study"), setEthics: (b: Any) => put("/api/admin/study/ethics", b), setRetention: (days: number) => put("/api/admin/study/retention", { days }), purge: () => post("/api/admin/study/retention/purge"),
    users: () => req("/api/admin/users"), createUser: (b: Any) => post("/api/admin/users", b), setActive: (id: number, active: boolean) => put(`/api/admin/users/${id}/active?active=${active}`),
    datasets: () => req("/api/admin/datasets"), ingest: () => post("/api/admin/datasets/eegmat/ingest"), ingestStatus: () => req("/api/admin/datasets/ingest-status"),
    mlBehavioural: () => post("/api/admin/ml/behavioural/evaluate"), mlEeg: () => post("/api/admin/ml/public-eeg/evaluate"), mlRuns: () => req("/api/admin/ml/runs"), mlExplain: (run_id: number) => post("/api/admin/ml/explain", { run_id }),
    audit: () => req("/api/admin/audit"), errors: () => req("/api/admin/errors"), system: () => req("/api/admin/system"),
    nlp: (text: string) => post("/api/admin/nlp/analyze", { text }), themes: () => req("/api/admin/nlp/reflection-themes"), llmAssist: (text: string) => post("/api/admin/nlp/llm-assist", { text }),
    corpus: () => req("/api/admin/rag/corpus"), search: (query: string, k = 5) => post("/api/admin/rag/search", { query, k }), ask: (question: string, use_llm: boolean) => post("/api/admin/rag/ask", { question, k: 4, use_llm }),
    ragEval: () => req("/api/admin/rag/evaluation"),
    ollama: () => req("/api/admin/ollama"), setOllama: (b: Any) => put("/api/admin/ollama", b), testOllama: () => post("/api/admin/ollama/test"),
  },
};

export function download(name: string, text: string, type = "text/csv") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
