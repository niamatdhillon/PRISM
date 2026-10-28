import type { Any, SessionRecord, Status } from "./types";

async function req<T = Any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try { const j = await r.json(); msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail).slice(0, 300); } catch { /* keep */ }
    throw new Error(msg);
  }
  const ct = r.headers.get("content-type") || "";
  return (ct.includes("json") ? r.json() : r.text()) as Promise<T>;
}
const post = <T = Any>(p: string, body: unknown) => req<T>(p, { method: "POST", body: JSON.stringify(body) });

export const api = {
  status: () => req<Status>("/api/status"),
  analytics: (records: SessionRecord[]) => post("/api/analytics", { records }),
  synthetic: () => req<{ records: SessionRecord[] }>("/api/synthetic"),
  csv: (kind: "sessions" | "trials", records: SessionRecord[]) => post<string>(`/api/export/${kind}`, { records }),
  nlp: (text: string) => post("/api/nlp/analyze", { text }),
  search: (query: string, k = 5) => post("/api/rag/search", { query, k }),
  ask: (question: string, use_llm: boolean) => post("/api/rag/ask", { question, k: 4, use_llm }),
  corpus: () => req("/api/rag/corpus"),
  retrievalEval: () => req("/api/rag/evaluation"),
  mlEvaluate: (source: "synthetic" | "participant", records: SessionRecord[]) => post("/api/ml/evaluate", { source, records }),
  mlPredict: (features: Record<string, number | null>) => post("/api/ml/predict", { features }),
  dictionary: () => req("/api/data-dictionary"),
  saveRemote: (r: SessionRecord) => post("/api/sessions", r),
  bulkRemote: (records: SessionRecord[]) => post("/api/sessions/bulk", { records }),
  listRemote: () => req<{ records: SessionRecord[] }>("/api/sessions"),
  clearRemote: (source: string) => req(`/api/sessions?source=${source}`, { method: "DELETE" }),
};

export function download(name: string, text: string, type = "text/csv") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
