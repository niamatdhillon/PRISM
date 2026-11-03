import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Empty, ErrorBox, Spinner } from "../components/ui";
import type { Any } from "../types";

export default function Participants({ role }: { role: string }) {
  const [rows, setRows] = useState<Any[] | null>(null); const [err, setErr] = useState<unknown>(null);
  const load = useCallback(() => api.admin.participants().then((r) => setRows(r.participants)).catch(setErr), []);
  useEffect(() => { void load(); }, [load]);
  const erase = async (c: string) => { if (!confirm(`Erase ${c} and all of their data? This is permanent and is written to the audit log.`)) return; try { await api.admin.eraseParticipant(c); await load(); } catch (e) { setErr(e); } };
  if (!rows) return <><ErrorBox error={err} /><Spinner /></>;
  return (
    <>
      <p className="small">Participants are pseudonymous: only the random code is shown. There is no name or contact information to display.</p><ErrorBox error={err} />
      {!rows.length ? <Empty>No participants have enrolled yet.</Empty> : (
        <div className="scroll-x panel"><table><thead><tr><th>Code</th><th>Status</th><th>Enrolled</th><th className="num">Sessions</th><th /></tr></thead>
          <tbody>{rows.map((p) => <tr key={p.code}><td className="mono">{p.code}</td><td>{p.status}{p.withdrawn_at ? ` (${new Date(p.withdrawn_at).toLocaleDateString()})` : ""}</td><td>{new Date(p.created_at).toLocaleString()}</td><td className="num">{p.sessions}</td>
            <td>{role === "admin" ? <button className="btn sm danger" onClick={() => erase(p.code)}>Erase</button> : <small>admin only</small>}</td></tr>)}</tbody></table></div>)}
    </>
  );
}
