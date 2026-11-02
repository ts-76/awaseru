import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = join(root, "deploy/cloudflare");
const expected = new Map();
const add = (path, contents) => expected.set(path, Buffer.from(contents));
// Explicit allowlist: never copy local credentials, resolved targets or generated output.
const sources = [
  "pages",
  "routes",
  "middleware",
  "server",
  "db",
  "env.ts",
  "void.config.ts",
  "vite.config.ts",
  "tsconfig.json",
  "package.json",
  "scripts/deployment-config.mjs",
];
function collect(source, destination) {
  const entries = readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Template source must not contain symlinks: ${from}`);
    if (entry.isDirectory()) collect(from, to);
    else if (entry.isFile()) add(to, readFileSync(from));
  }
}
for (const source of sources) {
  const path = join(root, source);
  if (["pages", "routes", "middleware", "server", "db"].includes(source))
    collect(path, join("app", source));
  else add(join("app", source), readFileSync(path));
}
for (const name of ["build.mjs", "wrangler.json"])
  add(name, readFileSync(join(root, "scripts/cloudflare-template", name)));
for (const name of ["package-lock.json", ".node-version", ".npmrc"])
  add(name, readFileSync(join(root, name)));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
pkg.scripts = {
  postinstall: "cd app && void prepare",
  build: "node build.mjs",
  deploy:
    "wrangler d1 migrations apply DB --remote --config wrangler.json && wrangler deploy --config wrangler.json",
};
pkg.cloudflare = {
  bindings: {
    DB: {
      description:
        "日程・回答・所有者情報を保存する専用データベース。新規作成する名前を指定してください。",
    },
  },
};
add("package.json", JSON.stringify(pkg, null, 2) + "\n");
add(
  ".gitignore",
  "node_modules\napp/.void\napp/.cloudflare/\napp/.wrangler\napp/dist\napp/.void-wrangler.jsonc\napp/void.lock.json\n.env*\n.dev.vars*\n.wrangler\n",
);
add(
  "README.md",
  `# awaseru — Cloudflare template

This standalone directory deploys awaseru to your own Cloudflare account.
Use Node.js 26 (see .node-version), install dependencies with npm ci, then run npm run build.
Cloudflare's Deploy button provisions the DB binding and records its database ID in wrangler.json.
npm run deploy applies D1 migrations by binding name DB, then publishes the Worker.

After deployment, configure Cloudflare Access and the ACCESS_OWNER_EMAIL, ACCESS_TEAM_DOMAIN,
ACCESS_CREATE_AUD and ACCESS_MCP_AUD Worker secrets. Until all four are valid, creation and MCP
routes return HTTP 503. Existing response links remain accessible by design.

See [setup instructions](https://github.com/ts-76/awaseru/blob/main/docs/deploy-cloudflare.md)
and the [application README](https://github.com/ts-76/awaseru#readme).

This directory is generated. To maintain the original template, edit the main application in
[ts-76/awaseru](https://github.com/ts-76/awaseru), run npm run template:generate there,
and commit the generated changes. The standalone clone does not include that generator.
`,
);

function inventory(path, base = path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const file = join(path, entry.name);
    return entry.isDirectory() ? inventory(file, base) : [relative(base, file)];
  });
}
if (process.argv.includes("--check")) {
  const differences = [...expected]
    .filter(
      ([path, contents]) =>
        !existsSync(join(target, path)) || !readFileSync(join(target, path)).equals(contents),
    )
    .map(([path]) => path);
  const extra = inventory(target).filter((path) => !expected.has(path));
  if (differences.length || extra.length)
    throw new Error(
      `Cloudflare template is stale. Run npm run template:generate. Changed: ${[...differences, ...extra].join(", ")}`,
    );
  console.log(`Cloudflare template matches main source (${expected.size} files).`);
} else {
  rmSync(target, { recursive: true, force: true });
  for (const [path, contents] of expected) {
    const file = resolve(target, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
  console.log(`Generated standalone Cloudflare template (${expected.size} files).`);
}
