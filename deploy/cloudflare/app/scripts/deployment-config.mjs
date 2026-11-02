import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const keys = ["DEPLOY_WORKER_NAME", "DEPLOY_ACCOUNT_ID", "DEPLOY_D1_NAME", "DEPLOY_D1_ID"];

/** Build-time only. Shell values take precedence, including explicitly empty values. */
export function deploymentConfig(root = process.cwd(), shell = process.env, args = process.argv) {
  const path = resolve(root, ".env");
  const file = existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
  const values = keys.map((key) => (shell[key] ?? file[key] ?? "").trim());
  const configured = values.every(Boolean);
  // Some CLI operations are remote without --remote (restore/rollback in
  // particular). Fence whole target-scoped remote families and mixed DB paths.
  // Local build/prepare and local DB migration/generation remain available.
  const remoteDatabaseCommands = new Set([
    "restore",
    "status",
    "rename-migrations",
    "connect",
    "set-url",
  ]);
  const remote = args.some(
    (arg, index) =>
      [
        "deploy",
        "secret",
        "domain",
        "project",
        "email",
        "github",
        "platform",
        "--remote",
        "--remote=true",
      ].includes(arg) ||
      (arg === "db" && remoteDatabaseCommands.has(args[index + 1])) ||
      (arg === "build" && args[index + 1] === "logs"),
  );
  if ((!configured && values.some(Boolean)) || (!configured && remote))
    throw new Error(
      "Set all DEPLOY_WORKER_NAME, DEPLOY_ACCOUNT_ID, DEPLOY_D1_NAME and DEPLOY_D1_ID in .env or the shell before remote operations.",
    );
  if (configured) {
    const ambientAccount = (shell.CLOUDFLARE_ACCOUNT_ID ?? file.CLOUDFLARE_ACCOUNT_ID)?.trim();
    if (ambientAccount && ambientAccount !== values[1])
      throw new Error("CLOUDFLARE_ACCOUNT_ID conflicts with DEPLOY_ACCOUNT_ID (values redacted).");
    if (
      !/^[a-z0-9][a-z0-9-]{0,62}$/.test(values[0]) ||
      !/^[a-f0-9]{32}$/.test(values[1]) ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(values[2]) ||
      !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(values[3]) ||
      values[3] === "00000000-0000-0000-0000-000000000000"
    )
      throw new Error("Invalid deployment target configuration (values redacted).");
    const lockPath = resolve(root, "void.lock.json");
    if (existsSync(lockPath)) {
      const lock = JSON.parse(readFileSync(lockPath, "utf8"));
      for (const state of [lock.source, lock.resolved]) {
        const db = state?.d1_databases?.find((item) => item.binding === "DB");
        const localOnly =
          state?.name === "awaseru-local" &&
          state?.account_id === "00000000000000000000000000000000" &&
          db?.database_name === "awaseru-local-db" &&
          db?.database_id === "00000000-0000-0000-0000-000000000000";
        if (localOnly) continue;
        if (
          (state?.name && state.name !== values[0]) ||
          (state?.account_id && state.account_id !== values[1]) ||
          (db?.database_name && db.database_name !== values[2]) ||
          (db?.database_id && db.database_id !== values[3])
        )
          throw new Error(
            "Deployment target conflicts with local void.lock.json. Restore matching environment/lock from your private backup before continuing (values redacted).",
          );
      }
    }
  }
  // Explicit local placeholders replace stale lock fields. They must never be deployed.
  const [name, account, databaseName, databaseId] = configured
    ? values
    : [
        "awaseru-local",
        "00000000000000000000000000000000",
        "awaseru-local-db",
        "00000000-0000-0000-0000-000000000000",
      ];
  return {
    name,
    account_id: account,
    d1_databases: [
      {
        binding: "DB",
        database_name: databaseName,
        database_id: databaseId,
        migrations_dir: "./db/migrations",
      },
    ],
    routes: [],
    workers_dev: true,
    preview_urls: true,
  };
}
