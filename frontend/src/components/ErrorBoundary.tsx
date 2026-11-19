import { Component, ReactNode } from "react";

/** Catches render faults so a single failing view never leaves a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean; key?: string }> {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps(p: { resetKey?: string }, s: { failed: boolean; key?: string }) { return p.resetKey !== s.key ? { failed: false, key: p.resetKey } : null; }
  componentDidCatch(e: Error) { console.error("view error:", e.message); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (<div className="wrap" style={{ paddingTop: 60 }}><div className="panel"><h3>This view couldn’t load</h3><p className="small">Something went wrong while showing this page. Your data is safe. You can reload, or go back to the home page.</p>
      <div className="row"><button className="btn" onClick={() => location.reload()}>Reload</button><a className="btn ghost" href="#/">Home</a></div></div></div>);
  }
}
