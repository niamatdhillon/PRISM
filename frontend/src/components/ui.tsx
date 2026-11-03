import { ReactNode, useEffect, useState } from "react";


export function SourceTag({ source }: { source: "prism" | "public" | "literature" }) {
  if (source === "prism") return <span className="badge b-real">● PRISM participant observations</span>;
  if (source === "public") return <span className="badge b-pub">◆ Public dataset</span>;
  return <span className="badge b-info">≡ Scientific literature</span>;
}
export const Empty = ({ children }: { children: ReactNode }) => <div className="note info" role="status">{children}</div>;
/** Every chart sits in a ChartCard that states its data source, sample size and limitation; with n = 0 it shows an explanation instead of an empty chart. */
export function ChartCard({ title, source, n, unit = "sessions", limits, children }: { title: string; source: "prism" | "public" | "literature"; n: number; unit?: string; limits?: string; children: ReactNode }) {
  return (
    <div className="panel"><div className="row spread"><h3 style={{ margin: 0 }}>{title}</h3><SourceTag source={source} /></div>
      {n > 0 ? <div style={{ marginTop: 10 }}>{children}</div> : <Empty>No data yet — nothing to chart.</Empty>}
      <small className="mono" style={{ display: "block", marginTop: 8 }}>n = {n} {unit}{limits ? ` · ${limits}` : ""}</small></div>
  );
}
export const Note = ({ kind = "warn", children }: { kind?: "warn" | "info" | "bad"; children: ReactNode }) =>
  <div className={"note " + (kind === "warn" ? "" : kind)} role="note">{children}</div>;
export const Spinner = ({ label = "Working…" }: { label?: string }) => <span role="status"><span className="spin" aria-hidden />{label}</span>;
export const ErrorBox = ({ error }: { error: unknown }) => error ? <div className="err" role="alert">⚠ {String((error as Error).message || error)}</div> : null;

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>{t.label}</button>)}
    </div>
  );
}

export function Slider({ id, label, left, right, value, onChange, hint }: { id: string; label: string; left: string; right: string; value: number | null; onChange: (v: number | null) => void; hint?: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <label htmlFor={id}>{label}</label>
      {hint && <small>{hint}</small>}
      <div className="row" style={{ flexWrap: "nowrap", marginTop: 6 }}>
        <input id={id} type="range" min={0} max={100} step={1} value={value ?? 50} aria-valuetext={value === null ? "not answered" : String(value)}
          onChange={(e) => onChange(Number(e.target.value))} onPointerDown={(e) => { if (value === null) onChange(Number((e.target as HTMLInputElement).value)); }} />
        <span className="slider-val" aria-live="polite">{value === null ? "–" : value}</span>
      </div>
      <div className="row spread small"><span>{left}</span><span>{right}</span></div>
      {value === null && <small>Not answered yet — move the slider to answer (leaving it untouched records “no answer”).</small>}
    </div>
  );
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true; setLoading(true); setError(null);
    fn().then((d) => live && setData(d)).catch((e) => live && setError(e)).finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading, setData };
}
export const fmt = (v: number | null | undefined, d = 1) => v === null || v === undefined ? "—" : v.toFixed(d);
