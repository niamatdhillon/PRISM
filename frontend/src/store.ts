// Record store: SQLite via the API in local mode, browser localStorage in hosted mode (the hosted server keeps nothing).
import { api } from "./api";
import type { SessionRecord, Status } from "./types";

const KEY = "prism.records.v1";
const PID = "prism.pid";
const safe = <T,>(f: () => T, d: T): T => { try { return f(); } catch { return d; } };
const readLocal = (): SessionRecord[] => safe(() => JSON.parse(localStorage.getItem(KEY) || "[]"), []);
const writeLocal = (r: SessionRecord[]) => localStorage.setItem(KEY, JSON.stringify(r));

export function participantId(): string {
  let id = safe(() => localStorage.getItem(PID), null);
  if (!id) { id = "P-" + crypto.randomUUID().slice(0, 8); safe(() => localStorage.setItem(PID, id as string), null); }
  return id;
}
export function resetParticipantId() { safe(() => localStorage.removeItem(PID), null); }

export const store = {
  async list(st: Status | null): Promise<SessionRecord[]> {
    if (st?.persistence === "sqlite") return (await api.listRemote()).records;
    return readLocal();
  },
  async save(st: Status | null, rec: SessionRecord) {
    if (st?.persistence === "sqlite") await api.saveRemote(rec);
    else { const all = readLocal().filter((r) => r.session_id !== rec.session_id); all.push(rec); writeLocal(all); }
  },
  async addMany(st: Status | null, recs: SessionRecord[]) {
    if (st?.persistence === "sqlite") await api.bulkRemote(recs);
    else { const ids = new Set(recs.map((r) => r.session_id)); writeLocal([...readLocal().filter((r) => !ids.has(r.session_id)), ...recs]); }
  },
  async clear(st: Status | null, source: "synthetic" | "participant" | "all") {
    if (st?.persistence === "sqlite") await api.clearRemote(source);
    else writeLocal(source === "all" ? [] : readLocal().filter((r) => r.source !== source));
  },
};
