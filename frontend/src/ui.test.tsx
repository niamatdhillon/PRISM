import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { ChartCard, Slider } from "./components/ui";

const mockFetch = (routes: Record<string, { status: number; body: unknown }>) => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url); const r = routes[url] ?? { status: 404, body: { detail: "nf" } };
    return { ok: r.status < 400, status: r.status, statusText: "", headers: { get: () => "application/json" }, json: async () => r.body, text: async () => JSON.stringify(r.body) }; }));
  return calls;
};
const study = { collection_open: false, ethics: null, consent: { version: "v1.0", paragraphs: ["p"] }, protocol: { version: "2.0.0", tasks: {}, display_modes: [] } };
const base = { "/api/public/study": { status: 200, body: study }, "/api/me": { status: 401, body: { detail: "x" } }, "/api/auth/me": { status: 401, body: { detail: "x" } }, "/api/public/literature": { status: 200, body: { documents: [] } } };
beforeEach(() => { window.matchMedia = window.matchMedia || (((q: string) => ({ matches: false, media: q, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { }, onchange: null, dispatchEvent: () => false })) as never); HTMLCanvasElement.prototype.getContext = (() => new Proxy({}, { get: () => () => ({ addColorStop() { } }) })) as never; window.scrollTo = (() => undefined) as never; });
afterEach(() => { vi.unstubAllGlobals(); location.hash = ""; });

describe("access control in the UI (server enforces it too)", () => {
  it("admin route shows only a login form for anonymous visitors and requests no admin data", async () => {
    const calls = mockFetch(base); location.hash = "#/admin/participants"; render(<App />);
    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByText(/participants/i, { selector: "nav a" })).toBeNull(); expect(calls.filter((c) => c.startsWith("/api/admin"))).toHaveLength(0);
  });
  it("public navigation never lists researcher pages for non-staff", async () => {
    mockFetch(base); render(<App />); await screen.findByText(/Enter the sensory lab/);
    const nav = screen.getByRole("navigation", { name: "Primary" }); expect(nav).not.toHaveTextContent(/Researcher/); expect(nav).toHaveTextContent(/Participate/);
  });
  it("shows closed-study banner and no synthetic/demo controls", async () => {
    mockFetch(base); render(<App />); expect(await screen.findByText(/Data collection is currently closed/)).toBeInTheDocument();
    expect(document.body.textContent?.toLowerCase()).not.toMatch(/synthetic|load demo/);
  });
  it("My data for an unenrolled visitor offers restore only and fetches no sessions", async () => {
    const calls = mockFetch(base); location.hash = "#/my-data"; render(<App />);
    expect(await screen.findByText(/not enrolled on this device/i)).toBeInTheDocument(); expect(calls.some((c) => c.includes("/api/me/sessions"))).toBe(false);
  });
});

describe("components", () => {
  it("ChartCard with n=0 explains instead of drawing an empty chart; with data it states source and n", () => {
    const { rerender } = render(<ChartCard title="T" source="prism" n={0}><svg data-testid="chart" /></ChartCard>);
    expect(screen.queryByTestId("chart")).toBeNull(); expect(screen.getByText(/No data yet/)).toBeInTheDocument();
    rerender(<ChartCard title="T" source="prism" n={7} limits="lim"><svg data-testid="chart" /></ChartCard>);
    expect(screen.getByTestId("chart")).toBeInTheDocument(); expect(screen.getByText(/n = 7 sessions · lim/)).toBeInTheDocument(); expect(screen.getByText(/PRISM participant observations/)).toBeInTheDocument();
  });
  it("Slider starts unanswered and records an answer when moved", () => {
    const onChange = vi.fn(); render(<Slider id="s" label="L" left="a" right="b" value={null} onChange={onChange} />);
    expect(screen.getByText(/Not answered yet/)).toBeInTheDocument(); fireEvent.change(screen.getByRole("slider"), { target: { value: "70" } }); expect(onChange).toHaveBeenCalledWith(70);
  });
});
