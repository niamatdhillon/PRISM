import { useCallback, useEffect, useState } from "react";
import { api, download } from "../api";
import { useApp } from "../context";
import { Empty, ErrorBox, Note } from "../components/ui";
import type { Any } from "../types";

export default function MyData() {
  const { me, refreshMe, study } = useApp();
  const [sessions, setSessions] = useState<Any[] | null>(null); const [err, setErr] = useState<unknown>(null); const [code, setCode] = useState(""); const [msg, setMsg] = useState("");
  const load = useCallback(async () => { if (!me) return; try { setSessions((await api.mySessions()).sessions); } catch (e) { setErr(e); } }, [me]);
  useEffect(() => { void load(); }, [load]);

  const restore = async () => { setErr(null); try { await api.restore(code.trim()); await refreshMe(); setMsg("Access restored on this device."); } catch (e) { setErr(e); } };
  const exp = async (f: "json" | "csv") => { const t = await api.myExport(f); download(`${me?.code}.${f}`, typeof t === "string" ? t : JSON.stringify(t, null, 1), f === "csv" ? "text/csv" : "application/json"); };
  const delOne = async (id: string) => { if (!confirm("Delete this session and its trials?")) return; await api.deleteMySession(id); await refreshMe(); await load(); };
  const delAll = async () => { if (!confirm("Delete ALL your sessions? You stay enrolled.")) return; await api.deleteMyData(); await refreshMe(); await load(); setMsg("All your session data was deleted."); };
  const withdraw = async () => { if (!confirm("Withdraw from the study? All your data is deleted and your code stops working. This cannot be undone.")) return; await api.withdraw(); await refreshMe(); setSessions(null); setMsg("You have withdrawn. All your task data and reflections were deleted."); };

  return (
    <div className="wrap" style={{ paddingTop: 36 }}>
      <span className="kicker">Participant privacy</span><h2>My data</h2>
      <ErrorBox error={err} />{msg && <Note kind="info">{msg}</Note>}
      {!me ? (
        <div className="grid g2">
          <div className="panel"><h3>You are not enrolled on this device</h3><p className="small">{study?.collection_open ? <>Enrol by giving consent in <a href="#/participate">Participate</a>.</> : "Data collection is currently closed, so nothing is stored for you."}</p></div>
          <div className="panel"><h3>Restore access</h3><p className="small">Use the recovery code you were shown when you enrolled.</p><label htmlFor="rc">Recovery code</label><input id="rc" type="text" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
            <div className="mt"><button className="btn" disabled={code.trim().length < 20} onClick={restore}>Restore</button></div></div>
        </div>
      ) : (
        <>
          <div className="panel"><div className="row spread"><div><div className="stat-l">Your participant code</div><div className="stat" style={{ fontSize: "2.2rem" }}>{me.code}</div></div>
            <div className="small">Consent {me.consent?.version} given {me.consent ? new Date(me.consent.given_at).toLocaleString() : "—"}<br />Ethics ref: {me.consent?.ethics_ref}</div></div>
            <p className="small">What is stored: your responses, reaction times, conditions, ratings, device category, display mode, timestamps and optional reflection. Not stored: name, email, IP address, camera images, microphone audio. Used for: statistical analysis by authorised researchers; never to diagnose.</p></div>
          <section className="block"><div className="row spread"><h3>Your sessions ({sessions?.length ?? 0})</h3>
            <div className="row"><button className="btn sm" disabled={!sessions?.length} onClick={() => exp("json")}>Download JSON</button><button className="btn sm ghost" disabled={!sessions?.length} onClick={() => exp("csv")}>Download CSV (trials)</button></div></div>
            {!sessions?.length ? <Empty>No sessions stored. <a href="#/participate">Take part</a>.</Empty> : (
              <div className="scroll-x"><table><thead><tr><th>Started</th><th>Tasks</th><th>Display</th><th className="num">Mean RT (visual search, ms)</th><th className="num">Accuracy</th><th className="num">TLX</th><th /></tr></thead>
                <tbody>{sessions.map((s) => <tr key={s.session_id}><td>{new Date(s.created_at).toLocaleString()}</td><td className="small">{s.tasks.join(", ").replace(/_/g, " ")}</td><td>{s.display_mode}{s.camera_used ? " + camera" : ""}</td><td className="num">{s.vs_mean_rt ?? "—"}</td><td className="num">{s.vs_accuracy ?? "—"}</td><td className="num">{s.tlx_global ?? "—"}</td><td><button className="btn sm danger" onClick={() => delOne(s.session_id)}>Delete</button></td></tr>)}</tbody></table></div>)}
            <small>Descriptive figures for you only; there is no comparison with other participants.</small></section>
          <section className="block"><h3>Delete or withdraw</h3><div className="row"><button className="btn danger" disabled={!sessions?.length} onClick={delAll}>Delete all my sessions</button><button className="btn danger" onClick={withdraw}>Withdraw from the study</button></div>
            <small>Withdrawal deletes all task data and reflections and disables your code. A minimal consent record (code, version, timestamps) is retained for governance.</small></section>
        </>)}
    </div>
  );
}
