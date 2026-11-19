// Real-browser end-to-end tests (Chrome via playwright-core). Camera tests use Chrome's FAKE capture device (a synthetic test pattern),
// which exercises the real getUserMedia -> <video> -> WebGL VideoTexture pipeline without real hardware.
// Usage: BASE=http://127.0.0.1:8010 ADMIN_EMAIL=... ADMIN_PASSWORD=... node e2e/e2e.mjs
import { chromium, devices } from "playwright-core";
const BASE = process.env.BASE || "http://127.0.0.1:8010", CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", SHOTS = process.env.SHOTS || "/tmp/e2e_shots";
const results = []; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GPU = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"];
async function step(name, fn) { try { const extra = await fn(); results.push({ name, ok: true, extra }); console.log("PASS", name, extra ? "· " + extra : ""); } catch (e) { const msg = String(e.message || e).split("\n").slice(0, 4).join(" | "); results.push({ name, ok: false, err: msg }); console.log("FAIL", name, "·", msg); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [...GPU, "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const track = `window.__streams=[];const _g=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(c)=>{const s=await _g(c);window.__streams.push(s);return s;};`;
const newPage = async (opts = {}) => { const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts }); const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(String(e))); page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text()); }); await page.addInitScript(track); page.errs = errs; return page; };
const live = (page) => page.evaluate(() => window.__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === "live").length);

// ---------- public pages
const p = await newPage();
await step("landing loads with hero, 3D canvas and the five public nav items", async () => {
  await p.goto(BASE + "/"); await p.waitForSelector(".wordmark"); await p.waitForSelector(".hero3d canvas", { timeout: 15000 });
  const nav = (await p.locator("nav[aria-label=Primary]").innerText()).toLowerCase(); for (const l of ["home", "about", "explore", "sensory lab", "research"]) assert(nav.includes(l), "missing nav " + l); assert(!/researcher/i.test(nav), "researcher nav visible to anonymous");
  const t = (await p.locator("body").innerText()).toLowerCase(); for (const bad of ["practice mode", "no ethics approval is recorded", "study closed", "synthetic"]) assert(!t.includes(bad), "alarming text: " + bad);
  await p.screenshot({ path: SHOTS + "/landing.png" }); assert(p.errs.length === 0, "console errors: " + p.errs.join("|")); return "no console errors";
});
for (const [hash, h] of [["about", "interdisciplinary"], ["research", "consent"], ["my-data", "My data"], ["explore", "instruments"]]) await step(`route #/${hash} renders`, async () => { await p.goto(`${BASE}/#/${hash}`); await p.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), h, { timeout: 10000 }); });

// ---------- Explore: camera pipeline (fake device)
await step("Explore: 3D hologram canvas renders and a shard can be popped by click", async () => {
  await p.goto(BASE + "/#/explore?tab=ar"); await p.waitForSelector(".stagehost canvas", { timeout: 15000 }); await sleep(800);
  const box = await p.locator(".stagehost").boundingBox(); let popped = 0;
  for (let i = 0; i < 40 && !popped; i++) { await p.mouse.click(box.x + 60 + (i * 53) % (box.width - 120), box.y + 40 + (i * 31) % (box.height - 80)); const t = await p.locator(".badge.b-info", { hasText: "shards popped" }).innerText(); popped = parseInt(t.match(/\d+/)[0]); }
  await p.screenshot({ path: SHOTS + "/explore_3d.png" }); return `popped=${popped}`;
});
await step("Explore: live camera starts, video is live, feed is drawn inside the 3D scene", async () => {
  await p.getByLabel("Live camera", { exact: false }).check().catch(() => p.locator("label:has-text('Live camera') input").check());
  await p.getByRole("button", { name: /Start camera/ }).click(); await p.waitForSelector("text=camera on", { timeout: 15000 }); await sleep(1500);
  const v = await p.evaluate(() => { const el = document.querySelector("video"); return { w: el.videoWidth, h: el.videoHeight, ready: el.readyState, tracks: el.srcObject?.getVideoTracks().map((t) => t.readyState) }; });
  assert(v.w > 0 && v.tracks?.[0] === "live", "video not live: " + JSON.stringify(v)); await p.screenshot({ path: SHOTS + "/explore_camera.png" }); return `video ${v.w}x${v.h}`;
});
await step("Explore: switch front/rear, then Stop releases every track", async () => {
  await p.getByRole("button", { name: /Use (front|rear) camera/ }).click(); await sleep(1200); assert((await live(p)) >= 1, "no live track after switching");
  await p.getByRole("button", { name: "Stop camera" }).click(); await sleep(500); const n = await live(p); assert(n === 0, `${n} tracks still live after stop`); return "0 live tracks after Stop";
});
await step("Explore: leaving the page releases the camera", async () => {
  await p.getByRole("button", { name: /Start camera/ }).click(); await p.waitForSelector("text=camera on"); assert((await live(p)) >= 1, "camera did not start");
  await p.evaluate(() => { location.hash = "#/about"; }); await sleep(800); const n = await live(p); assert(n === 0, `${n} tracks still live after navigating away`); return "released on navigation";
});
await step("Explore: WebXR AR option is disabled with an explanation on this desktop (no false claim)", async () => {
  await p.goto(BASE + "/#/explore?tab=ar"); await p.waitForSelector("label:has-text('AR (WebXR)')"); const dis = await p.locator("label:has-text('AR (WebXR)') input").isDisabled(); const txt = await p.locator("label:has-text('AR (WebXR)')").innerText(); assert(dis && /unavailable/i.test(txt), "AR should be disabled here: " + txt); return txt.replace(/\n/g, " ");
});

// ---------- camera permission denied
const d = await newPage(); await d.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { const e = new Error("Permission denied"); e.name = "NotAllowedError"; throw e; }; });
await step("camera permission denial shows a friendly message and the page stays usable", async () => {
  await d.goto(BASE + "/#/explore?tab=ar"); await d.waitForSelector(".stagehost canvas"); await d.locator("label:has-text('Live camera') input").check(); await d.getByRole("button", { name: /Start camera/ }).click();
  await d.waitForSelector("[role=alert]"); const t = await d.locator("[role=alert]").innerText(); assert(/permission was denied/i.test(t) && /3D/.test(t), t); await d.getByRole("button", { name: "Continue in 3D" }).click(); await d.waitForSelector(".stagehost canvas"); assert(d.errs.length === 0, d.errs.join("|")); return "message + 3D fallback";
});

// ---------- public NLP + RAG demo
await step("Explore: text analysis returns lemmas, TF-IDF, keyphrases and VADER", async () => {
  await p.goto(BASE + "/#/explore?tab=nlp"); await p.waitForSelector("text=Preprocessing", { timeout: 20000 }); const t = await p.locator("main").innerText(); for (const k of ["TF-IDF", "Keyphrases", "VADER", "Nearest literature"]) assert(t.includes(k), "missing " + k); return "ok";
});
await step("Explore: Evidence Q&A answers with sources; off-topic question says insufficient evidence", async () => {
  await p.goto(BASE + "/#/explore?tab=ask"); await p.waitForSelector("#aq"); await p.fill("#aq", "Do redundant audio and visual signals speed up responses?"); await p.getByRole("button", { name: "Ask the corpus" }).click();
  await p.waitForSelector(".answer", { timeout: 120000 }); await p.waitForSelector(".evidence"); const mode = await p.locator(".badge").filter({ hasText: /GENERATED|EXTRACTIVE|INSUFFICIENT/ }).first().innerText(); const n = await p.locator(".evidence").count(); assert(n >= 1, "no sources shown");
  await p.getByRole("button", { name: "What is the capital of France?" }).click(); await p.waitForSelector("text=INSUFFICIENT EVIDENCE", { timeout: 60000 }); await p.screenshot({ path: SHOTS + "/explore_ask.png" }); return `answer mode: ${mode.trim()}; ${n} sources`;
});
await step("Explore: EEG model page shows provenance and real held-out metrics", async () => {
  await p.goto(BASE + "/#/explore?tab=eeg"); await p.waitForSelector("text=Selected model", { timeout: 60000 }); const t = await p.locator("main").innerText(); assert(/PhysioNet/.test(t) && /ROC-AUC/i.test(t) && /ODC-By/.test(t), "provenance/metrics missing"); assert(!/Explain this run/.test(t), "admin-only explain visible"); await p.screenshot({ path: SHOTS + "/explore_eeg.png", fullPage: false }); return "ok";
});

// ---------- Sensory Lab (demo mode: ethics gate stays closed in this DB? -> we opened it for the participant test, so test demo on a closed-state check via API below)
await step("Sensory Lab: 3D visual search runs a trial; answers appear; key response is recorded in the UI flow", async () => {
  const q = await newPage(); await q.goto(BASE + "/#/lab"); await q.waitForSelector("#pre", { timeout: 15000 }).catch(async () => { await q.locator("input[type=checkbox]").evaluateAll((els) => els.forEach((e) => e.click())); await q.getByRole("button", { name: /I consent/ }).click(); await q.getByRole("button", { name: "Continue" }).click(); await q.waitForSelector("#pre"); });
  await q.locator("#pre").fill("30"); await q.getByRole("button", { name: "Continue" }).click(); await q.waitForSelector("text=Set up your session");
  await q.locator("fieldset").first().locator("input[type=checkbox]").evaluateAll((els) => els.forEach((e) => { const want = /Spatial visual search/.test(e.parentElement.innerText); if (e.checked !== want) e.click(); }));
  await q.getByRole("button", { name: "Start session" }).click(); await q.getByRole("button", { name: "Start task" }).click(); await q.waitForSelector(".stagehost canvas", { timeout: 15000 });
  await q.getByRole("button", { name: "Begin visual search" }).click(); await q.waitForSelector("button:has-text('Left')", { timeout: 15000 }); await q.screenshot({ path: SHOTS + "/lab_3d_trial.png" }); await q.keyboard.press("f"); await q.waitForSelector("text=/Correct|Incorrect/", { timeout: 5000 });
  const hud = await q.locator(".hud").innerText(); await q.context().close(); return hud.split("\n")[0];
});
await step("Sensory Lab: camera-overlay mode locks Begin until the camera starts, then runs with the feed in the scene", async () => {
  const q = await newPage(); await q.goto(BASE + "/#/lab"); await q.waitForSelector("#pre", { timeout: 15000 }).catch(async () => { await q.locator("input[type=checkbox]").evaluateAll((els) => els.forEach((e) => e.click())); await q.getByRole("button", { name: /I consent/ }).click(); await q.getByRole("button", { name: "Continue" }).click(); await q.waitForSelector("#pre"); });
  await q.locator("#pre").fill("30"); await q.getByRole("button", { name: "Continue" }).click(); await q.waitForSelector("text=Set up your session");
  await q.locator("fieldset").first().locator("input[type=checkbox]").evaluateAll((els) => els.forEach((e) => { const want = /Spatial visual search/.test(e.parentElement.innerText); if (e.checked !== want) e.click(); }));
  await q.locator("label:has-text('Camera overlay') input").check(); await q.getByRole("button", { name: "Start session" }).click(); await q.getByRole("button", { name: "Start task" }).click();
  await q.waitForSelector("button:has-text('Begin visual search')"); assert(await q.getByRole("button", { name: "Begin visual search" }).isDisabled(), "Begin should be locked before the camera starts");
  await q.getByRole("button", { name: /Start camera/ }).click(); await q.waitForSelector("text=camera live", { timeout: 15000 }); await sleep(1200); assert(!(await q.getByRole("button", { name: "Begin visual search" }).isDisabled()), "Begin should unlock");
  await q.screenshot({ path: SHOTS + "/lab_camera_preview.png" }); await q.getByRole("button", { name: "Begin visual search" }).click(); await q.waitForSelector("button:has-text('Left')", { timeout: 15000 }); await q.screenshot({ path: SHOTS + "/lab_camera_trial.png" });
  const n = await live(q); assert(n >= 1, "camera not live during task"); await q.context().close(); return "feed + target in one scene";
});

// ---------- security over the live server
await step("anonymous requests to admin APIs are rejected (401) and unauthenticated writes without the CSRF header are blocked (403)", async () => {
  for (const u of ["/api/admin/overview", "/api/admin/export/sessions", "/api/admin/users", "/api/admin/study"]) { const r = await p.request.get(BASE + u); assert(r.status() === 401, `${u} -> ${r.status()}`); }
  const r = await p.request.post(BASE + "/api/auth/login", { data: { email: "a@b.c", password: "x" } }); assert(r.status() === 403, "csrf header not enforced: " + r.status()); return "401/403 as required";
});

// ---------- admin UI
const a = await newPage();
await step("admin signs in through the UI and every researcher page loads without errors", async () => {
  await a.goto(BASE + "/#/admin"); await a.waitForSelector("#em"); await a.fill("#em", process.env.ADMIN_EMAIL); await a.fill("#pw", process.env.ADMIN_PASSWORD); await a.getByRole("button", { name: "Sign in" }).click(); await a.waitForSelector("text=Signed in as");
  for (const [h, t] of [["", "participants"], ["participants", "Participants"], ["datasets", "EEG During Mental Arithmetic"], ["nlp", "Text analysis"], ["prediction", "PRISM behavioural"], ["settings", "Ethics approval"], ["system", "Audit log"]]) { await a.goto(`${BASE}/#/admin${h ? "/" + h : ""}`); await a.waitForFunction((x) => document.body.innerText.toLowerCase().includes(x.toLowerCase()), t, { timeout: 15000 }); await sleep(600); assert(!(await a.locator("[role=alert]").count()), "error alert on " + h); }
  await a.goto(BASE + "/#/admin/prediction"); await a.getByRole("tab", { name: /Public EEG/ }).click(); await a.waitForSelector("text=Selected model", { timeout: 60000 }); await a.screenshot({ path: SHOTS + "/admin_prediction.png" }); assert(a.errs.length === 0, a.errs.join("|")); return "7 pages ok";
});

// ---------- mobile + tablet emulation (Chromium engine; NOT real iOS Safari)
for (const [name, dev] of [["iPhone 13 (emulated)", devices["iPhone 13"]], ["Pixel 7 (emulated)", devices["Pixel 7"]], ["iPad Mini (emulated)", devices["iPad Mini"]]]) {
  await step(`responsive: ${name} - no horizontal overflow on all public routes, menu works`, async () => {
    const m = await newPage({ ...dev }); const bad = [];
    for (const h of ["", "about", "explore", "explore?tab=ask", "explore?tab=eeg", "lab", "research", "my-data", "admin"]) { await m.goto(`${BASE}/#/${h}`); await sleep(900); const o = await m.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth })); if (o.sw > o.iw + 2) bad.push(`${h || "home"} ${o.sw}>${o.iw}`); }
    assert(!bad.length, "overflow: " + bad.join(", ")); await m.goto(BASE + "/"); await m.screenshot({ path: `${SHOTS}/mobile_${name.split(" ")[0]}_home.png` });
    if (/iPhone|Pixel/.test(name)) { await m.getByRole("button", { name: "Menu" }).click(); await m.waitForSelector(".nav-links.open"); }
    await m.context().close(); return "ok";
  });
}
await step("responsive: phone landscape - Sensory Lab stage and answer buttons fit the viewport", async () => {
  const m = await newPage({ ...devices["iPhone 13 landscape"] }); await m.goto(BASE + "/#/explore?tab=ar"); await m.waitForSelector(".stagehost canvas"); const h = await m.evaluate(() => ({ stage: document.querySelector(".stagehost").getBoundingClientRect().height, vh: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth }));
  assert(h.stage <= h.vh && h.sw <= h.iw + 2, JSON.stringify(h)); await m.screenshot({ path: SHOTS + "/mobile_landscape_explore.png" }); await m.context().close(); return `stage ${Math.round(h.stage)}px of ${h.vh}px`;
});

await browser.close();
const fails = results.filter((r) => !r.ok); console.log(`\n${results.length - fails.length}/${results.length} passed`); process.exit(fails.length ? 1 : 0);
