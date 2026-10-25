/**
 * 截图工具：用 CDP 精确控制视口，并抓 console 错误。
 * 用法：
 *   node tools/shot.mjs <url> <out.png> [width] [height] [waitMs] [jsToEval] [deviceScaleFactor]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const [url, out, wArg, hArg, waitArg, evalJs, dsfArg] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node tools/shot.mjs <url> <out.png> [w] [h] [waitMs] [js]");
  process.exit(1);
}
const W = parseInt(wArg || "390", 10);
const H = parseInt(hArg || "844", 10);
const WAIT = parseInt(waitArg || "1800", 10);
const DSF = parseFloat(dsfArg || "2");   // 出商店图时传 3，得到 1170×2532
const PORT = 9333 + Math.floor(Math.random() * 200);

const userDir = path.join(process.env.TEMP || "/tmp", "cdp-shot-" + Date.now());
const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--mute-audio",
  "--no-first-run",
  "--remote-debugging-port=" + PORT,
  "--user-data-dir=" + userDir,
  "about:blank"
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (e) { /* 还没起来 */ }
    await sleep(150);
  }
  throw new Error("CDP 未就绪");
}

let msgId = 0;
function send(ws, method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => {
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === id) {
        ws.removeEventListener("message", onMsg);
        resolve(m.result || m.error);
      }
    };
    ws.addEventListener("message", onMsg);
  });
}

try {
  const wsUrl = await getWs();
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

  const errors = [];
  const logs = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      errors.push("[EXC] " + (d.exception?.description || d.text));
    }
    if (m.method === "Runtime.consoleAPICalled") {
      const line = m.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a.preview?.properties)).join(" ");
      if (m.params.type === "error") errors.push("[ERR] " + line);
      else logs.push("[" + m.params.type + "] " + line);
    }
  });

  await send(ws, "Runtime.enable");
  await send(ws, "Page.enable");
  await send(ws, "Emulation.setDeviceMetricsOverride", {
    width: W, height: H, deviceScaleFactor: DSF, mobile: true
  });

  await send(ws, "Page.navigate", { url });
  await sleep(WAIT);

  if (evalJs) {
    const r = await send(ws, "Runtime.evaluate", { expression: evalJs, awaitPromise: true });
    if (r && r.exceptionDetails) errors.push("[EVAL] " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    else if (r && r.result) console.log("eval =>", r.result.value ?? r.result.description);
    await sleep(700);
  }

  const shot = await send(ws, "Page.captureScreenshot", { format: "png" });
  if (!shot || !shot.data) throw new Error("截图失败");
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(path.resolve(out), Buffer.from(shot.data, "base64"));
  console.log("shot ->", out, Math.round(W * DSF) + "x" + Math.round(H * DSF));
  if (logs.length) { console.log("---- console ----"); logs.slice(0, 20).forEach((l) => console.log(l)); }
  if (errors.length) {
    console.log("---- 页面错误 ----");
    errors.forEach((e) => console.log(e));
  } else {
    console.log("无 JS 错误");
  }
  ws.close();
} catch (e) {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
} finally {
  chrome.kill();
  await sleep(200);
  try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { }
}
