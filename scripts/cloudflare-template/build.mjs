import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// This template uses Wrangler's provisioned DB, never a developer's DEPLOY_* target.
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key.startsWith("DEPLOY_") || key === "CLOUDFLARE_ACCOUNT_ID") delete env[key];
}
const result = spawnSync(process.execPath, ["../node_modules/vite-plus/bin/vp", "build"], {
  cwd: fileURLToPath(new URL("./app/", import.meta.url)),
  env,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
