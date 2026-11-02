import { spawn } from "node:child_process";
const base = "http://127.0.0.1:5197",
  env = {
    ...process.env,
    BASE_URL: base,
  };
const run = (file, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(file, args, { env, stdio: "inherit" });
    p.on("error", reject);
    p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`${file} exited ${c}`))));
  });
await run("node_modules/.bin/void", ["db", "migrate"]);
let server;
let output = "";
async function start() {
  server = spawn(
    "npm",
    ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5197", "--strictPort"],
    { env, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  for (const stream of [server.stdout, server.stderr])
    stream.on("data", (b) => {
      output = (output + b.toString()).slice(-10000);
    });
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(`Development server exited: ${output}`);
    try {
      if ((await fetch(base + "/connect", { redirect: "manual" })).status === 302) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Development server did not start: ${output}`);
}
async function stop() {
  if (server) {
    const p = server;
    server = null;
    if (p.exitCode !== null) return;
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch (e) {
      if (e.code !== "ESRCH") throw e;
    }
    await new Promise((resolve) => {
      p.once("exit", resolve);
      setTimeout(resolve, 3000);
    });
  }
}
try {
  await start();
  await run(process.execPath, ["scripts/smoke.mjs"]);
  await stop();
  await start();
  if (env.ACCESS_CREATE_ASSERTION && env.ACCESS_MCP_ASSERTION)
    await run(process.execPath, ["scripts/smoke.mjs", "--compare"]);
  else await run(process.execPath, ["scripts/smoke.mjs"]);
} finally {
  await stop();
}
