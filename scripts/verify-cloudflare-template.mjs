import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = mkdtempSync(join(tmpdir(), "awaseru-template-check-"));
const cwd = join(temp, "template");
function verificationEnv() {
  const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
  // Verification must never authenticate or target a real account.
  for (const key of Object.keys(env)) {
    if (key.startsWith("CLOUDFLARE_") || key.startsWith("DEPLOY_")) delete env[key];
  }
  return env;
}
function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env: verificationEnv(),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Command failed: ${args.join(" ")}`);
}
async function verifyRuntime(wrangler) {
  const reservation = createServer();
  await new Promise((resolve, reject) =>
    reservation.listen(0, "127.0.0.1", resolve).once("error", reject),
  );
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const worker = spawn(
    process.execPath,
    [
      wrangler,
      "dev",
      "--local",
      "--config",
      "wrangler.json",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--inspector-port",
      "0",
    ],
    { cwd, env: verificationEnv(), stdio: ["ignore", "pipe", "pipe"] },
  );
  let logs = "";
  worker.stdout.on("data", (data) => {
    logs += data;
  });
  worker.stderr.on("data", (data) => {
    logs += data;
  });
  const stopped = new Promise((resolve) => worker.once("exit", resolve));
  try {
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        await fetch(base, { redirect: "manual", signal: AbortSignal.timeout(500) });
        ready = true;
        break;
      } catch {
        await delay(200);
      }
    }
    assert.ok(ready, `Wrangler did not start: ${logs}`);
    const home = await fetch(base, { redirect: "manual" });
    assert.ok(
      [301, 302, 303, 307, 308].includes(home.status),
      `Unexpected home response: ${home.status}`,
    );
    assert.equal(home.headers.get("location"), "/create/polls");
    for (const path of ["/create", "/api/create/session", "/mcp"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 503, `${path} must remain closed without auth`);
      assert.equal((await response.json()).code, "auth_unconfigured");
    }
    const missing = await fetch(base + "/p/template-check-missing");
    assert.equal(missing.status, 404);
    assert.ok((await missing.text()).length > 0);
    console.log(
      "Standalone Wrangler runtime: root redirect, missing-auth 503 and public missing-poll 404 passed.",
    );
  } finally {
    worker.kill("SIGTERM");
    await Promise.race([stopped, delay(5000)]);
    if (worker.exitCode === null) {
      worker.kill("SIGKILL");
      await stopped;
    }
  }
}

try {
  cpSync(join(root, "deploy/cloudflare"), cwd, { recursive: true });
  symlinkSync(join(root, "node_modules"), join(cwd, "node_modules"), "dir");
  run(["build.mjs"]);
  const source = JSON.parse(readFileSync(join(cwd, "wrangler.json"), "utf8"));
  const built = JSON.parse(readFileSync(join(cwd, "app/dist/ssr/wrangler.json"), "utf8"));
  assert.equal(built.name, "awaseru-local");
  assert.equal(built.d1_databases[0].binding, "DB");
  assert.equal(source.d1_databases[0].binding, "DB");
  assert.equal(source.d1_databases[0].database_id, "00000000-0000-0000-0000-000000000000");
  assert.equal(source.assets.binding, built.assets.binding);
  const wrangler = join(root, "node_modules/wrangler/bin/wrangler.js");
  run([
    wrangler,
    "deploy",
    "--dry-run",
    "--config",
    "wrangler.json",
    "--outdir",
    join(temp, "dry-run"),
  ]);
  assert.ok(
    readdirSync(join(temp, "dry-run")).length > 1,
    "Dry-run must include imported Worker modules",
  );
  run([wrangler, "d1", "migrations", "apply", "DB", "--local", "--config", "wrangler.json"]);
  run([
    wrangler,
    "d1",
    "execute",
    "DB",
    "--local",
    "--config",
    "wrangler.json",
    "--command",
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ]);
  await verifyRuntime(wrangler);
  console.log("Standalone template build, Wrangler dry-run and local D1 migrations passed.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
