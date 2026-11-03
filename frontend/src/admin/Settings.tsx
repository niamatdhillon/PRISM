import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { ErrorBox, Note, Spinner } from "../components/ui";
import type { Any } from "../types";

export default function Settings({ role }: { role: string }) {
  const admin = role === "admin";
  const [st, setSt] = useState<Any>(null); const [users, setUsers] = useState<Any[]>([]); const [oll, setOll] = useState<Any>(null); const [err, setErr] = useState<unknown>(null); const [msg, setMsg] = useState("");
  const [eth, setEth] = useState({ approved: false, reference: "", body: "", approved_on: "" }); const [days, setDays] = useState(0); const [nu, setNu] = useState({ email: "", password: "", role: "researcher" }); const [model, setModel] = useState(""); const [testRes, setTestRes] = useState<Any>(null);
  const load = useCallback(async () => {
    try { const s = await api.admin.study(); setSt(s); setEth(s.ethics); setDays(s.retention.days); const o = await api.admin.ollama(); setOll(o); setModel(o.settings.model || ""); if (admin) setUsers((await api.admin.users()).users); } catch (e) { setErr(e); }
  }, [admin]);
  useEffect(() => { void load(); }, [load]);
  const run = async (f: () => Promise<unknown>, ok: string) => { setErr(null); setMsg(""); try { await f(); setMsg(ok); await load(); } catch (e) { setErr(e); } };
  if (!st || !oll) return <><ErrorBox error={err} /><Spinner /></>;
  const s = oll.status;
  return (
    <>
      <ErrorBox error={err} />{msg && <Note kind="info">{msg}</Note>}
      <div className="panel"><h3>Ethics approval &amp; data collection</h3>
        <p className="small">Participant enrolment and session storage are <strong>closed</strong> until an approval is recorded here. Only record an approval that actually exists; the reference and body are shown to participants and stored with every consent.</p>
        <p>Status: <span className={"badge " + (st.collection_open ? "b-real" : "b-bad")}>{st.collection_open ? "COLLECTION OPEN" : "COLLECTION CLOSED"}</span></p>
        <div className="grid g2"><div><label htmlFor="e1">Approving body</label><input id="e1" type="text" value={eth.body} disabled={!admin} onChange={(e) => setEth({ ...eth, body: e.target.value })} /></div><div><label htmlFor="e2">Approval reference</label><input id="e2" type="text" value={eth.reference} disabled={!admin} onChange={(e) => setEth({ ...eth, reference: e.target.value })} /></div>
          <div><label htmlFor="e3">Approval date</label><input id="e3" type="text" placeholder="YYYY-MM-DD" value={eth.approved_on} disabled={!admin} onChange={(e) => setEth({ ...eth, approved_on: e.target.value })} /></div>
          <label className="check" style={{ alignSelf: "end" }}><input type="checkbox" checked={eth.approved} disabled={!admin} onChange={(e) => setEth({ ...eth, approved: e.target.checked })} />Ethics approval is in place; open data collection</label></div>
        {admin ? <button className="btn mt" onClick={() => run(() => api.admin.setEthics(eth), "Ethics settings saved (audit-logged).")}>Save</button> : <small>Admin only.</small>}</div>

      <div className="panel mt"><h3>Retention</h3><p className="small">Sessions older than N days are deleted by the purge action or the CLI (<code>python -m backend.cli purge-expired</code>). 0 = keep until deleted or withdrawn.</p>
        <div className="row"><input type="text" style={{ width: 100 }} value={days} disabled={!admin} aria-label="Retention days" onChange={(e) => setDays(Number(e.target.value.replace(/\D/g, "")) || 0)} />
          {admin && <><button className="btn sm" onClick={() => run(() => api.admin.setRetention(days), "Retention saved.")}>Save</button><button className="btn sm danger" onClick={() => confirm("Purge sessions older than the retention period now?") && run(async () => { const r = await api.admin.purge(); setMsg(`Purged ${r.purged_sessions} sessions.`); }, "Purge complete.")}>Run purge</button></>}</div></div>

      <div className="panel mt"><h3>Ollama (local language model)</h3>
        <p><span className={"badge " + (s.available ? "b-real" : "b-bad")}>{s.available ? `READY · ${s.model}` : `NOT AVAILABLE · ${s.state}`}</span> <span className="mono small">{s.host}{s.version ? ` · v${s.version}` : ""}</span></p>
        {!s.available && <p className="small">{s.reason}</p>}
        <div className="scroll-x">{s.models.length ? <table><thead><tr><th>Installed model</th><th className="num">Size</th><th>Parameters</th><th>Quant.</th></tr></thead><tbody>{s.models.map((m: Any) => <tr key={m.name}><td>{m.name}{m.name === s.model ? " ✓" : ""}</td><td className="num">{m.size_gb} GB</td><td>{m.parameters}</td><td>{m.quant}</td></tr>)}</tbody></table> : <small>No models listed.</small>}</div>
        <div className="grid g2 mt"><div><label htmlFor="om">Model</label><input id="om" type="text" list="models" value={model} disabled={!admin} onChange={(e) => setModel(e.target.value)} /><datalist id="models">{s.models.map((m: Any) => <option key={m.name} value={m.name} />)}</datalist></div>
          <div className="row" style={{ alignSelf: "end" }}>{admin && <button className="btn sm" onClick={() => run(() => api.admin.setOllama({ model }), "Ollama settings saved.")}>Save model</button>}
            <button className="btn sm ghost" onClick={async () => { setErr(null); setTestRes(null); try { setTestRes(await api.admin.testOllama()); } catch (e) { setErr(e); } }}>Test generation</button></div></div>
        {testRes && <Note kind="info">Reply from {testRes.model} in {testRes.seconds}s: “{testRes.reply}”</Note>}
        <details className="mt"><summary>Install &amp; configure</summary><ol className="clean">{oll.install.map((i: string) => <li key={i}>{i}</li>)}</ol><small>Ollama is only contacted on loopback hosts. Never expose an Ollama server to the public internet.</small></details></div>

      {admin && <div className="panel mt"><h3>Staff accounts</h3><div className="scroll-x"><table><thead><tr><th>Email</th><th>Role</th><th>Last sign-in</th><th /></tr></thead><tbody>{users.map((u) => <tr key={u.id}><td>{u.email}</td><td>{u.role}</td><td>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "never"}</td><td><button className="btn sm ghost" onClick={() => run(() => api.admin.setActive(u.id, !u.active), "Account updated.")}>{u.active ? "Deactivate" : "Reactivate"}</button></td></tr>)}</tbody></table></div>
        <h4 className="mt">Add staff account</h4><div className="grid g3"><input type="text" placeholder="email" aria-label="New user email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} /><input type="password" placeholder="password (min 12)" aria-label="New user password" style={{ width: "100%", background: "rgba(5,8,20,.7)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 13px" }} value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
          <select aria-label="Role" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}><option value="researcher">researcher</option><option value="admin">admin</option></select></div>
        <button className="btn sm mt" onClick={() => run(async () => { await api.admin.createUser(nu); setNu({ email: "", password: "", role: "researcher" }); }, "Account created.")}>Create account</button></div>}
    </>
  );
}
