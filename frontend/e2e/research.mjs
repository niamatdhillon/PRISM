// Research-participation flow through the real UI against the live server + database.
import { chromium } from "playwright-core";
const BASE = process.env.BASE, CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const out = []; const ok = (c, m) => { out.push([c ? "PASS" : "FAIL", m]); console.log(c ? "PASS" : "FAIL", m); if (!c) process.exitCode = 1; };
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const mk = async () => { const c = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await c.newPage(); p.setDefaultTimeout(20000); return p; };
const answerAll = async (p, until) => { const t0 = Date.now(); while (Date.now() - t0 < 120000) { if (await p.locator(until).count()) return; const st = p.getByRole("button", { name: "Start task" }); if (await st.count()) { await st.click(); continue; } const btns = p.locator(".answers button:not([disabled])"); if (await btns.count()) await btns.nth(Math.floor(Math.random() * await btns.count())).click().catch(() => { }); await sleep(250); } throw new Error("tasks did not finish"); };
const setR = (p, id, v) => p.evaluate(([i, x]) => { const el = document.getElementById(i); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(x)); el.dispatchEvent(new Event("input", { bubbles: true })); }, [id, v]);

const A = await mk(), B = await mk();   // two different participants (separate cookie jars)
async function participate(p, tasks) {
  await p.goto(BASE + "/#/lab"); await p.waitForSelector("text=Before you begin");
  await p.locator("input[type=checkbox]").evaluateAll((els) => els.forEach((e) => e.click())); await p.getByRole("button", { name: /I consent/ }).click();
  await p.waitForSelector("text=You’re in"); const code = (await p.locator("strong.mono").first().innerText()).trim(); await p.getByRole("button", { name: "Continue", exact: true }).click();
  await p.waitForSelector("#pre"); await setR(p, "pre", 25); await p.getByRole("button", { name: "Continue", exact: true }).click(); await p.waitForSelector("text=Set up your session");
  await p.locator("fieldset").first().locator("input[type=checkbox]").evaluateAll((els, want) => els.forEach((e) => { const w = want.some((t) => e.parentElement.innerText.includes(t)); if (e.checked !== w) e.click(); }), tasks);
  await p.getByRole("button", { name: "Start session" }).click(); await answerAll(p, "#post");
  for (const [id, v] of [["post", 35], ["diff", 40], ["t1", 55], ["t2", 10], ["t3", 45], ["t4", 40], ["t5", 60], ["t6", 30]]) await setR(p, id, v);
  await p.locator("#refl").fill("The tasks were manageable but I felt a little rushed."); await p.getByRole("button", { name: "Save session" }).click(); await p.waitForSelector("text=Session complete");
  return code;
}
const codeA = await participate(A, ["Mental arithmetic", "Pattern recognition"]); ok(/^P-[0-9A-F]{6}$/.test(codeA), `participant A enrolled via UI: ${codeA}`);
const codeB = await participate(B, ["Mental arithmetic"]); ok(codeA !== codeB, `participant B enrolled separately: ${codeB}`);

await A.goto(BASE + "/#/my-data"); await A.waitForSelector(`text=${codeA}`); await A.waitForSelector("tbody tr"); const rowsA = await A.locator("tbody tr").count(); const txtA = await A.locator("main").innerText();
ok(rowsA === 1 && txtA.includes(codeA) && !txtA.includes(codeB), "A's My data shows only A's 1 session");
const apiB = await B.request.get(BASE + "/api/me/sessions"); const sB = (await apiB.json()).sessions; const sidA = await A.request.get(BASE + "/api/me/sessions").then((r) => r.json()).then((j) => j.sessions[0].session_id);
ok(sB.length === 1 && sB[0].session_id !== sidA, "B's API view contains B's session only");
const steal = await B.request.delete(BASE + `/api/me/sessions/${sidA}`, { headers: { "x-prism-client": "web" } }); ok(steal.status() === 404, "B cannot delete A's session (404)");
const adm = await B.request.get(BASE + "/api/admin/participants"); ok(adm.status() === 401, "participant cannot call admin API (401)");

// researcher view via admin login
const R = await mk(); await R.goto(BASE + "/#/admin"); await R.waitForSelector("#em"); await R.fill("#em", process.env.ADMIN_EMAIL); await R.fill("#pw", process.env.ADMIN_PASSWORD); await R.getByRole("button", { name: "Sign in" }).click(); await R.waitForSelector("text=Signed in as");
const ov = await R.request.get(BASE + "/api/admin/overview").then((r) => r.json()); ok(ov.participants >= 2 && ov.completed_sessions >= 2 && ov.trials > 0, `researcher sees ${ov.participants} participants / ${ov.completed_sessions} sessions / ${ov.trials} trials`);
await R.goto(BASE + "/#/admin"); await R.waitForSelector("text=Descriptive statistics", { timeout: 20000 }); await R.screenshot({ path: "/tmp/e2e_shots/admin_dashboard_with_data.png" }); ok(true, "researcher dashboard renders charts from stored data");
const csv = await R.request.get(BASE + "/api/admin/export/trials").then((r) => r.text()); ok(csv.includes(codeA) && csv.includes(codeB) && !/recovery|token/i.test(csv), "CSV export contains both pseudonymous codes and no secrets");
// withdrawal + deletion
await A.goto(BASE + "/#/my-data"); await A.waitForSelector(`text=${codeA}`); A.on("dialog", (d) => d.accept()); await A.getByRole("button", { name: "Withdraw from the study" }).click(); await A.waitForSelector("text=You have withdrawn");
const ov2 = await R.request.get(BASE + "/api/admin/overview").then((r) => r.json()); ok(ov2.completed_sessions === ov.completed_sessions - 1, "withdrawal removed A's data from researcher analytics");
await b.close(); process.exit(process.exitCode || 0);
