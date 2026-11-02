#!/usr/bin/env node
// Also copyable into a target project: only Node built-ins, no plugin imports.
// Opengrep runs only in CI, so each tool is checked only when its option is given:
// --project for the locally installed Secretlint, --opengrep for the CI binary.
import { mkdtemp, writeFile, rm, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
const run = promisify(execFile);
const options = {};
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--linux-sudo") options.sudo = true;
  else if (
    ["--project", "--opengrep"].includes(args[i]) &&
    args[i + 1] &&
    !args[i + 1].startsWith("--")
  )
    options[args[i++].slice(2)] = resolve(args[i]);
  else
    throw new Error(
      "verify-security-tools.mjs [--project PATH] [--opengrep PATH] [--linux-sudo]",
    );
}
if (!options.project && !options.opengrep)
  throw new Error("--project or --opengrep is required");
const temp = await mkdtemp(join(tmpdir(), "dev-compass-security-"));
const server = createServer((socket) => socket.end());
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
  HOME: temp,
  TMPDIR: temp,
  LANG: "C.UTF-8",
  OPENGREP_ENABLE_VERSION_CHECK: "0",
};
let wrapper = null;
if (process.platform === "darwin")
  wrapper = [
    "/usr/bin/sandbox-exec",
    "-p",
    "(version 1)(allow default)(deny network*)",
  ];
else if (process.platform === "linux")
  wrapper = options.sudo
    ? ["sudo", "-n", "unshare", "--net", "--"]
    : ["unshare", "--user", "--map-root-user", "--net", "--"];
// Shared by the per-tool checks below.
async function execute(command, argv, isolated = true) {
  const invocation = isolated
    ? [...wrapper, command, ...argv]
    : [command, ...argv];
  try {
    const r = await run(invocation[0], invocation.slice(1), {
      cwd: temp,
      env,
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { code: 0, output: r.stdout + r.stderr, stdout: r.stdout };
  } catch (error) {
    return {
      code: typeof error.code === "number" ? error.code : -1,
      output: (error.stdout ?? "") + (error.stderr ?? ""),
      stdout: error.stdout ?? "",
    };
  }
}
let report;
let stage = "versions";
try {
  for (const name of options.project
    ? ["secretlint", "@secretlint/secretlint-rule-preset-recommend"]
    : []) {
    const manifest = JSON.parse(
      await readFile(
        join(options.project, "node_modules", name, "package.json"),
        "utf8",
      ),
    );
    if (manifest.version !== "13.1.0")
      throw new Error("Secretlint and preset must both be pinned to 13.1.0");
  }
  if (!wrapper) throw new Error("Network isolation is unsupported on this OS");
  stage = "network-control";
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const port = server.address().port;
  const probe = `const net=require('node:net'); const s=net.connect(${port},'127.0.0.1'); s.on('connect',()=>{s.destroy();process.exit(0)});s.on('error',()=>process.exit(42));setTimeout(()=>process.exit(42),1500);`;
  if (
    (await execute(process.execPath, ["-e", probe], false)).code !== 0 ||
    (await execute(process.execPath, ["-e", probe])).code !== 42
  )
    throw new Error(
      "Network isolation control failed; no offline verification claimed",
    );
  if (options.opengrep) await verifyOpengrep();
  if (options.project) await verifySecretlint();
  report = {
    status: "verified",
    networkIsolation: true,
    opengrep: options.opengrep
      ? { cleanExit: 0, detectionExit: 1 }
      : "not_checked",
    secretlint: options.project
      ? { cleanExit: 0, detectionExit: 1, masked: true }
      : "not_checked",
    scope: "synthetic fixtures only; project scan and CI are separate",
  };
} catch {
  report = {
    status: "not_verified",
    stage,
    message:
      "起動・版・隔離・検出・マスクのいずれかが未確認です。生出力は秘密漏えい防止のため表示しません。Linuxはunshare権限と、必要な場合だけ--linux-sudoを確認してください。",
  };
  process.exitCode = 1;
} finally {
  if (server.listening) await new Promise((done) => server.close(done));
  await rm(temp, { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 2));

async function verifyOpengrep() {
  await writeFile(
    join(temp, "rule.yaml"),
    "rules:\n  - id: fixture-eval\n    languages: [javascript, typescript]\n    severity: ERROR\n    message: Avoid eval\n    pattern: eval($X)\n",
  );
  await writeFile(join(temp, "clean.js"), 'console.log("safe");\n');
  await writeFile(join(temp, "unsafe.js"), "eval(input);\n");
  for (const [file, expected, count] of [
    ["clean.js", 0, 0],
    ["unsafe.js", 1, 1],
  ]) {
    stage = `opengrep-${file}`;
    const r = await execute(options.opengrep, [
      "scan",
      "--config",
      join(temp, "rule.yaml"),
      "--disable-version-check",
      "--error",
      "--json",
      join(temp, file),
    ]);
    const result = JSON.parse(r.stdout);
    if (
      r.code !== expected ||
      result.results?.length !== count ||
      result.errors?.length
    )
      throw new Error("Opengrep fixture verification failed");
  }
}

async function verifySecretlint() {
  const secretlint = join(
    options.project,
    "node_modules/secretlint/bin/secretlint.js",
  );
  // A dedicated fixture config preserves the user's actual config. Name-based
  // preset resolution requires it to be adjacent to the installed node_modules.
  const configPath = join(
    options.project,
    `.secretlintrc.verify-${randomBytes(8).toString("hex")}.json`,
  );
  try {
    await writeFile(
      configPath,
      JSON.stringify({
        rules: [{ id: "@secretlint/secretlint-rule-preset-recommend" }],
      }),
      { flag: "wx", mode: 0o600 },
    );
    const key = "MIIE" + randomBytes(192).toString("base64");
    await writeFile(join(temp, "clean.txt"), "Nothing sensitive here.\n");
    await writeFile(
      join(temp, "unsafe.txt"),
      `-----BEGIN RSA PRIVATE KEY-----\n${key}\n-----END RSA PRIVATE KEY-----\n`,
      { mode: 0o600 },
    );
    for (const [file, expected] of [
      ["clean.txt", 0],
      ["unsafe.txt", 1],
    ]) {
      stage = `secretlint-${file}`;
      const r = await execute(process.execPath, [
        secretlint,
        "--secretlintrc",
        configPath,
        "--no-gitignore",
        join(temp, file),
      ]);
      if (
        r.code !== expected ||
        (expected === 1 &&
          (!r.output.includes("PrivateKey") || r.output.includes(key)))
      )
        throw new Error("Secretlint fixture or masking verification failed");
    }
  } finally {
    await rm(configPath, { force: true });
  }
}
