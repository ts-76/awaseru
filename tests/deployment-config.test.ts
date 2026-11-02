import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deploymentConfig } from "../scripts/deployment-config.mjs";

const roots: string[] = [];
function root() {
  const path = mkdtempSync(join(tmpdir(), "awaseru-config-"));
  roots.push(path);
  return path;
}
const env = {
  DEPLOY_WORKER_NAME: "fixture-worker",
  DEPLOY_ACCOUNT_ID: "a".repeat(32),
  DEPLOY_D1_NAME: "fixture-db",
  DEPLOY_D1_ID: "11111111-1111-1111-1111-111111111111",
};
afterEach(() => roots.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
it("builds locally without configuration but refuses all remote command paths", () => {
  const path = root();
  expect(deploymentConfig(path, {}, ["build"]).name).toBe("awaseru-local");
  for (const args of [["deploy"], ["secret", "put"], ["db", "execute", "--remote"], ["domain"]])
    expect(() => deploymentConfig(path, {}, args)).toThrow("Set all DEPLOY_");
  expect(() => deploymentConfig(path, { DEPLOY_WORKER_NAME: "partial" }, ["build"])).toThrow();
});
it("loads the single .env, applies shell precedence, rejects empty overrides and redacts invalid values", () => {
  const path = root();
  writeFileSync(
    path + "/.env",
    Object.entries(env)
      .map(([key, value]) => `${key}="${value}"`)
      .join("\n"),
  );
  expect(deploymentConfig(path, {}, ["deploy"]).account_id).toBe(env.DEPLOY_ACCOUNT_ID);
  expect(deploymentConfig(path, { DEPLOY_WORKER_NAME: "shell-worker" }, ["build"]).name).toBe(
    "shell-worker",
  );
  expect(() => deploymentConfig(path, { DEPLOY_D1_ID: "" }, ["build"])).toThrow("Set all DEPLOY_");
  expect(() =>
    deploymentConfig(path, { DEPLOY_D1_ID: "sensitive-invalid-input" }, ["deploy"]),
  ).toThrow("values redacted");
});
it("pins Worker/account/D1 despite a stale or conflicting Void lock", () => {
  const path = root();
  const config = deploymentConfig(path, env, ["deploy"]);
  writeFileSync(path + "/void.lock.json", JSON.stringify({ source: config, resolved: config }));
  expect(deploymentConfig(path, env, ["deploy"])).toEqual(config);
  for (const change of [
    { name: "other" },
    { account_id: "b".repeat(32) },
    {
      d1_databases: [
        { ...config.d1_databases[0], database_id: "22222222-2222-2222-2222-222222222222" },
      ],
    },
  ]) {
    writeFileSync(
      path + "/void.lock.json",
      JSON.stringify({ source: config, resolved: { ...config, ...change } }),
    );
    expect(() => deploymentConfig(path, env, ["deploy"])).toThrow("conflicts");
  }
  // A local build cannot resurrect the old production identifiers.
  expect(deploymentConfig(path, {}, ["build"]).account_id).toBe("0".repeat(32));
  expect(() => deploymentConfig(path, {}, ["deploy"])).toThrow("Set all DEPLOY_");
});

it("rejects ambient account overrides and permits replacing only a fully synthetic local lock", () => {
  const path = root();
  expect(() =>
    deploymentConfig(path, { ...env, CLOUDFLARE_ACCOUNT_ID: "b".repeat(32) }, ["deploy"]),
  ).toThrow("CLOUDFLARE_ACCOUNT_ID conflicts");
  const local = deploymentConfig(path, {}, ["build"]);
  writeFileSync(path + "/void.lock.json", JSON.stringify({ source: local, resolved: local }));
  expect(deploymentConfig(path, env, ["deploy"]).name).toBe(env.DEPLOY_WORKER_NAME);
});

it("fences inherently remote CLI families without blocking local build/prepare/database work", () => {
  const path = root();
  const remoteCommands = [
    ["db", "restore", "--bookmark", "fixture-bookmark", "--platform", "cloudflare", "--yes"],
    ["project", "rollback", "--platform", "cloudflare"],
    ["project", "status"],
    ["project", "delete", "--force"],
    ["db", "status"],
    ["db", "rename-migrations"],
    ["db", "connect", "--provider", "neon"],
    ["db", "set-url"],
    ["email", "setup", "--platform", "cloudflare"],
    ["github", "connect"],
    ["platform", "install"],
    ["build", "logs"],
  ];
  for (const command of remoteCommands) {
    expect(
      () => deploymentConfig(path, {}, ["node", "/cli/void.mjs", ...command]),
      command.join(" "),
    ).toThrow("Set all DEPLOY_");
    expect(deploymentConfig(path, env, command).name).toBe(env.DEPLOY_WORKER_NAME);
  }
  for (const command of [
    ["build"],
    ["prepare"],
    ["dev"],
    ["db", "migrate"],
    ["db", "generate"],
    ["db", "push"],
    ["db", "reset"],
    ["db", "seed"],
    ["db", "execute", "SELECT 1"],
    ["db", "export"],
    ["db", "studio"],
  ])
    expect(deploymentConfig(path, {}, command).name, command.join(" ")).toBe("awaseru-local");
});
