import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const ARTIFACT_DIR = "C:/Users/TT-USER/.gemini/antigravity/brain/ca1d41df-5add-4c7a-a5e3-18946a17f2c5";

async function getDisposableTestToken() {
  const testEmail = `qa_disposable_${Date.now()}@example.com`;
  const testPassword = "Password123!";
  try {
    const regRes = await fetch("http://127.0.0.1:8000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword, full_name: "Disposable QA" }),
    });
    if (regRes.ok) {
      const data = await regRes.json();
      return data.token || data.access_token;
    }
  } catch (e) {}

  try {
    const logRes = await fetch("http://127.0.0.1:8000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alex@example.com", password: "Password123!" }),
    });
    if (logRes.ok) {
      const data = await logRes.json();
      return data.token || data.access_token;
    }
  } catch (e) {}
  return "";
}

async function run() {
  const token = await getDisposableTestToken();
  const chromeDataDir = path.join(os.tmpdir(), "chrome_cdp_" + Date.now());
  const chromeProc = spawn(
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    [
      "--headless=new",
      "--remote-debugging-port=9222",
      `--user-data-dir=${chromeDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
    ],
    { stdio: "ignore" }
  );

  console.log("Launched headless Chrome (PID:", chromeProc.pid, ")");

  let verData = null;
  for (let i = 0; i < 30; i++) {
    try {
      const verRes = await fetch("http://127.0.0.1:9222/json/version");
      if (verRes.ok) {
        verData = await verRes.json();
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!verData) {
    chromeProc.kill();
    throw new Error("Could not connect to Chrome CDP on port 9222");
  }

  console.log("Connected to Chrome:", verData.Browser);

  const tabRes = await fetch("http://127.0.0.1:9222/json/new?http://localhost:3000/login", { method: 'PUT' });
  const tab = await tabRes.json();
  const wsUrl = tab.webSocketDebuggerUrl;

  const ws = new WebSocket(wsUrl);

  let msgId = 1;
  const pending = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  await new Promise((res) => { ws.onopen = res; });
  console.log("CDP WebSocket opened");

  await send("Network.enable");
  await send("Page.enable");
  await send("Runtime.enable");

  // First navigate to login and set localStorage & cookie
  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await new Promise((r) => setTimeout(r, 1500));

  if (token) {
    await send("Network.setCookie", {
      name: "auth_token",
      value: token,
      domain: "localhost",
      path: "/",
      expires: Date.now() / 1000 + 86400,
    });

    await send("Runtime.evaluate", {
      expression: `localStorage.setItem('auth_token', '${token}');`,
    });
  }

  async function capture(url, filename, width = 1440, height = 900, isMobile = false) {
    console.log(`Capturing ${url} -> ${filename} (${width}x${height})...`);
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: isMobile ? 2 : 1,
      mobile: isMobile,
    });

    await send("Page.navigate", { url });
    // Wait until page is rendered and background queries finish
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const res = await send("Runtime.evaluate", {
        expression: "Boolean(document.querySelector('table') || document.querySelector('.divide-y') || document.querySelector('h1')) && !document.querySelector('.animate-spin')"
      });
      if (res?.result?.value === true && i >= 4) {
        break;
      }
    }

    // Extra rendering settle buffer
    await new Promise((r) => setTimeout(r, 1000));

    const { data } = await send("Page.captureScreenshot", { format: "png" });
    const outPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
    console.log(`Saved: ${outPath} (${data.length} b64 chars)`);
  }

  await capture("http://localhost:3000/dashboard", "today_desktop_1440.png", 1440, 900);
  await capture("http://localhost:3000/stocks", "explore_desktop_1440.png", 1440, 900);
  await capture("http://localhost:3000/stocks/TCS", "tcs_research_1440.png", 1440, 900);
  await capture("http://localhost:3000/portfolio", "portfolio_desktop_1440.png", 1440, 900);
  await capture("http://localhost:3000/portfolio", "portfolio_mobile_390.png", 390, 844, true);
  await capture("http://localhost:3000/watchlist", "watchlist_desktop_1440.png", 1440, 900);
  await capture("http://localhost:3000/backtest?symbol=TCS", "backtest_tcs_1440.png", 1440, 900);
  await capture("http://localhost:3000/settings", "settings_desktop_1440.png", 1440, 900);

  ws.close();
  chromeProc.kill();
  console.log("All views captured successfully!");
}

run().catch((err) => {
  console.error("Capture error:", err);
  process.exit(1);
});
