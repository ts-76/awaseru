import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Hono, type Handler } from "hono";
import type { CloudEnv, CloudContext } from "void";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { accessGate } from "../server/access";
vi.mock("void", () => ({
  defineHandler: (...handlers: unknown[]) => handlers.at(-1),
  defineMiddleware: (handler: unknown) => handler,
}));
import security from "../middleware/01.security";
import { loader as pollLoader } from "../pages/p/[id].server";
import { GET as listRoute } from "../routes/api/create/polls/index";
import { DELETE as deleteRoute } from "../routes/api/create/polls/[id]";
import { POST as claimRoute } from "../routes/api/create/polls/claim";
import { SchedulingService } from "../server/service";
import { hash } from "../server/rules";
import { POST as createRoute } from "../routes/api/create";
import { POST as oldCreate } from "../routes/api/polls/index";
import { GET as getRoute } from "../routes/api/polls/[id]";
import { POST as respondRoute } from "../routes/api/polls/[id]/responses/index";
import { PATCH as editRoute } from "../routes/api/polls/[id]/responses/[responseId]";
import { PATCH as stateRoute } from "../routes/api/polls/[id]/state";
import { POST as mcpRoute } from "../routes/mcp";
const config = {
  ACCESS_OWNER_EMAIL: "owner@example.com",
  ACCESS_TEAM_DOMAIN: "fixture.cloudflareaccess.com",
  ACCESS_CREATE_AUD: "a".repeat(64),
  ACCESS_MCP_AUD: "b".repeat(64),
};
let pair: Awaited<ReturnType<typeof generateKeyPair>>;
let resolver: ReturnType<typeof createLocalJWKSet>;
let database: DatabaseSync;
let app: Hono<CloudEnv>;
function handler(fn: (c: CloudContext) => unknown): Handler<CloudEnv> {
  return async (c) => {
    const result = await fn(c);
    if (!(result instanceof Response)) throw new Error("Expected route Response");
    return result;
  };
}
async function json(r: Response) {
  return JSON.parse(await r.text());
}
const secret = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
const body = () => ({
  title: "認証テスト",
  description: "",
  slots: ["2026-11-01T12:00:00+09:00"],
  adminKey: secret(),
  idempotencyKey: crypto.randomUUID(),
});
async function signed(overrides: JWTPayload = {}, key = pair.privateKey, alg = "RS256") {
  return new SignJWT({
    iss: "https://fixture.cloudflareaccess.com",
    aud: config.ACCESS_CREATE_AUD,
    sub: "owner",
    email: "owner@example.com",
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  })
    .setProtectedHeader({ alg, kid: "fixture" })
    .sign(key);
}
async function request(path: string, token?: string, options: RequestInit = {}) {
  return app.request(`https://scheduler.example${path}`, {
    ...options,
    headers: { ...(token ? { "Cf-Access-Jwt-Assertion": token } : {}), ...options.headers },
  });
}
async function create(token?: string, headers: Record<string, string> = {}, data = body()) {
  return request("/api/create", token, {
    method: "POST",
    headers: {
      Origin: "https://scheduler.example",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(data),
  });
}
const count = () => Number(database.prepare("SELECT COUNT(*) AS n FROM polls").get()!.n);
beforeAll(async () => {
  pair = await generateKeyPair("RS256");
  resolver = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: "fixture", alg: "RS256" }],
  });
});
beforeEach(() => {
  database = new DatabaseSync(":memory:");
  for (const f of readdirSync("db/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    database.exec(readFileSync(`db/migrations/${f}`, "utf8"));
  const db = {
    prepare(sql: string) {
      let params: unknown[] = [];
      const statement = {
        bind(...v: unknown[]) {
          params = v;
          return statement;
        },
        async first() {
          return database.prepare(sql).get(...(params as [])) || null;
        },
        async all() {
          return { results: database.prepare(sql).all(...(params as [])) };
        },
        async run() {
          return {
            meta: { changes: Number(database.prepare(sql).run(...(params as [])).changes) },
          };
        },
      };
      return statement;
    },
  };
  app = new Hono<CloudEnv>();
  app.use("*", async (c, next) => {
    c.env = { DB: db } as unknown as CloudEnv["Bindings"];
    await next();
  });
  app.use("*", security);
  app.use(
    "*",
    accessGate(() => config, resolver),
  );
  app.post("/api/create", handler(createRoute));
  app.get("/api/create/polls", handler(listRoute));
  app.delete("/api/create/polls/:id", handler(deleteRoute));
  app.post("/api/create/polls/claim", handler(claimRoute));
  app.get("/create/polls", (c) => c.text("my polls"));
  app.get("/p/:id", async (c) => c.json(await pollLoader(c)));
  app.post("/api/polls", handler(oldCreate));
  app.get("/create", (c) => c.text("create form"));
  app.get("/api/polls/:id", handler(getRoute));
  app.post("/api/polls/:id/responses", handler(respondRoute));
  app.patch("/api/polls/:id/responses/:responseId", handler(editRoute));
  app.patch("/api/polls/:id/state", handler(stateRoute));
  app.all("/mcp", handler(mcpRoute));
});
afterEach(() => database.close());
describe("Cloudflare Access origin boundary with real RSA signed fixtures", () => {
  it("accepts owner creation and keeps public read/response anonymous", async () => {
    const input = body();
    const created = await create(await signed(), {}, input);
    expect(created.status).toBe(200);
    const p = await json(created);
    expect(count()).toBe(1);
    const publicPoll = await request(`/api/polls/${p.id}`);
    expect(publicPoll.status).toBe(200);
    const editKey = secret();
    const response = await request(`/api/polls/${p.id}/responses`, undefined, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "参加者",
        comment: "",
        answers: ["yes"],
        pollRevision: 0,
        editKey,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    expect(response.status).toBe(200);
    const saved = await json(response);
    const edited = await request(`/api/polls/${p.id}/responses/${saved.responseId}`, undefined, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${editKey}` },
      body: JSON.stringify({
        name: "参加者",
        comment: "更新",
        answers: ["maybe"],
        pollRevision: 0,
        revision: 0,
      }),
    });
    expect(edited.status).toBe(200);
    const closed = await request(`/api/polls/${p.id}/state`, undefined, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.adminKey}` },
      body: JSON.stringify({ status: "closed", revision: 0 }),
    });
    expect(closed.status).toBe(200);

    expect((await json(await request(`/api/polls/${p.id}`))).responses).toHaveLength(1);
  });
  it("rejects absent JWT, spoof email header, Authorization bearer, old anonymous and authenticated endpoint; DB stays empty", async () => {
    for (const headers of [
      {},
      { "Cf-Access-Authenticated-User-Email": "owner@example.com" },
      { Authorization: `Bearer ${await signed()}` },
    ] as Record<string, string>[])
      expect((await create(undefined, headers)).status).toBe(401);
    for (const token of [undefined, await signed()])
      expect(
        (await request("/api/polls", token, { method: "POST", body: JSON.stringify(body()) }))
          .status,
      ).toBe(410);
    expect(count()).toBe(0);
  });
  it("rejects correctly signed missing/empty identity, expiry, issuer and app mismatch", async () => {
    const invalid: JWTPayload[] = [
      { exp: undefined },
      { exp: 0 },
      { sub: undefined },
      { sub: "" },
      { sub: " " },
      { email: undefined },
      { email: "" },
      { iss: "https://evil.example" },
      { aud: config.ACCESS_MCP_AUD },
    ];
    for (const claims of invalid)
      expect((await create(await signed(claims))).status, JSON.stringify(claims)).toBe(401);
    expect((await create(await signed({ email: "other@example.com" }))).status).toBe(403);
    expect(count()).toBe(0);
  });
  it("rejects wrong RSA signature and non RS256 algorithm", async () => {
    const other = await generateKeyPair("RS256");
    expect((await create(await signed({}, other.privateKey))).status).toBe(401);
    const ec = await generateKeyPair("ES256");
    expect((await create(await signed({}, ec.privateKey, "ES256"))).status).toBe(401);
    expect(count()).toBe(0);
  });
  it("requires same Origin JSON even after valid auth", async () => {
    const token = await signed();
    for (const origin of ["", "https://evil.example"])
      expect((await create(token, { Origin: origin })).status).toBe(403);
    for (const content of ["text/plain", "application/x-www-form-urlencoded"])
      expect((await create(token, { "Content-Type": content })).status).toBe(415);
    expect(count()).toBe(0);
  });
  it("gates all methods, trailing slash and encoded spellings before routing", async () => {
    for (const path of [
      "/create",
      "/create/",
      "/%63reate",
      "/api/create",
      "/api/create/",
      "/api/%63reate",
      "/mcp",
      "/mcp/",
    ])
      for (const method of ["GET", "HEAD", "POST"])
        expect((await request(path, undefined, { method })).status, `${method} ${path}`).toBe(401);
    expect(count()).toBe(0);
  });
  it("fails closed for missing config, same app audiences or invalid team; no JWKS outage bypass", async () => {
    for (const cfg of [
      {},
      { ...config, ACCESS_MCP_AUD: config.ACCESS_CREATE_AUD },
      { ...config, ACCESS_TEAM_DOMAIN: "evil.example" },
      { ...config, ACCESS_OWNER_EMAIL: undefined },
      { ...config, ACCESS_OWNER_EMAIL: "" },
      { ...config, ACCESS_OWNER_EMAIL: "not-an-email" },
    ]) {
      const isolated = new Hono()
        .use(
          "*",
          accessGate(() => cfg, resolver),
        )
        .all("*", (c) => c.text("unsafe"));
      const result = await isolated.request("https://scheduler.example/create", {
        headers: { "Cf-Access-Jwt-Assertion": await signed() },
      });
      expect(result.status).toBe(503);
      expect(result.headers.get("Cache-Control")).toBe("no-store");
    }
    const unavailable = new Hono()
      .use(
        "*",
        accessGate(
          () => config,
          async () => {
            throw new Error("JWKS unavailable");
          },
        ),
      )
      .get("/create", (c) => c.text("unsafe"));
    expect(
      (
        await unavailable.request("https://scheduler.example/create", {
          headers: { "Cf-Access-Jwt-Assertion": await signed() },
        })
      ).status,
    ).toBe(401);
  });
  it("isolates browser and MCP audiences, initializes real SDK and lists five tools", async () => {
    expect((await request("/mcp", await signed(), { method: "POST" })).status).toBe(401);
    const token = await signed({ aud: config.ACCESS_MCP_AUD });
    expect((await create(token)).status).toBe(401);
    const rpc = async (message: unknown) =>
      request("/mcp", token, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(message),
      });
    const initialized = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "fixture", version: "1" },
      },
    });
    expect(initialized.status).toBe(200);
    expect((await json(initialized)).result.serverInfo.name).toBe("awaseru");
    const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    expect((await json(list)).result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "create_poll",
      "get_poll",
      "set_poll_state",
      "submit_response",
      "update_response",
    ]);
    expect(count()).toBe(0);
    const input = { ...body(), slotEnds: ["2026-11-01T14:00:00+09:00"] };
    const created = await rpc({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "create_poll", arguments: input },
    });
    const value = (await json(created)).result;
    expect(value.isError).not.toBe(true);
    const poll = JSON.parse(value.content[0].text);
    expect(poll.slotEnds).toEqual(input.slotEnds);
    const invalidRange = await rpc({
      jsonrpc: "2.0",
      id: 30,
      method: "tools/call",
      params: {
        name: "create_poll",
        arguments: { ...body(), slotEnds: ["2026-11-01T10:00:00+09:00"] },
      },
    });
    const invalidResult = await json(invalidRange);
    expect(invalidResult.result?.isError || !!invalidResult.error).toBe(true);
    const legacy = await rpc({
      jsonrpc: "2.0",
      id: 31,
      method: "tools/call",
      params: { name: "create_poll", arguments: body() },
    });
    const legacyValue = (await json(legacy)).result;
    expect(legacyValue.isError).not.toBe(true);
    expect(JSON.parse(legacyValue.content[0].text).slotEnds).toBeUndefined();
    expect(count()).toBe(2);
    const owned = await json(await request("/api/create/polls", await signed()));
    expect(owned.items.map((p: { id: string }) => p.id)).toContain(poll.id);
    const denied = await rpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "set_poll_state",
        arguments: { id: poll.id, status: "closed", revision: 0, adminKey: secret() },
      },
    });
    expect((await json(denied)).result.isError).toBe(true);
    expect((await json(await request(`/api/polls/${poll.id}`))).status).toBe("open");
  });
});

const snapshot = () =>
  JSON.stringify([
    database.prepare("SELECT * FROM polls ORDER BY id").all(),
    database.prepare("SELECT * FROM responses ORDER BY id").all(),
  ]);
async function claim(id: string, adminKey: string, token?: string, extras = {}) {
  return request("/api/create/polls/claim", token, {
    method: "POST",
    headers: { Origin: "https://scheduler.example", "Content-Type": "application/json" },
    body: JSON.stringify({ id, adminKey, ...extras }),
  });
}
describe("本人一覧と既存日程の帰属", () => {
  it("signed別subを隔離しWeb/MCP同一主体で同じ一覧、body/query/header偽装で奪えない", async () => {
    const a = await signed(),
      b = await signed({ sub: "other-sub" });
    const data = body();
    const p = await json(await create(a, {}, data));
    const q = await json(await create(b));
    await request(`/api/polls/${p.id}/responses`, undefined, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "公開名",
        comment: "秘密ではない本文",
        answers: ["yes"],
        pollRevision: 0,
        editKey: secret(),
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const own = await json(
      await request("/api/create/polls?owner=other-sub", a, {
        headers: { "X-User-ID": "other-sub" },
      }),
    );
    expect(own.items.map((v: { id: string }) => v.id)).toEqual([p.id]);
    expect(own.items[0]).toMatchObject({
      title: "認証テスト",
      status: "open",
      responseCount: 1,
      selectedSlot: null,
    });
    expect(
      (await json(await request("/api/create/polls", b))).items.map((v: { id: string }) => v.id),
    ).toEqual([q.id]);
    expect(Object.keys(own.items[0]).sort()).toEqual([
      "createdAt",
      "id",
      "responseCount",
      "revision",
      "selectedSlot",
      "status",
      "title",
    ]);
    for (const text of [
      data.adminKey,
      "owner_id",
      "admin_hash",
      "edit_hash",
      "payload_hash",
      "公開名",
      "秘密ではない本文",
    ])
      expect(JSON.stringify(own)).not.toContain(text);
    const before = snapshot();
    expect(
      (await create(a, {}, { ...body(), ownerId: "other-sub" } as ReturnType<typeof body>)).status,
    ).toBe(422);
    expect((await create(b, {}, data)).status).toBe(409);
    expect((await create(b, {}, { ...data, title: "別内容" })).status).toBe(409);
    expect((await claim(p.id, data.adminKey, b)).status).toBe(403);
    expect(snapshot()).toBe(before);
    expect(
      (
        await request(`/api/polls/${p.id}/state`, a, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "closed", revision: 0 }),
        })
      ).status,
    ).toBe(403);
    expect(snapshot()).toBe(before);
  });
  it("ownerなしのservice作成/list/claimは拒否しDB不変", async () => {
    const service = new SchedulingService({} as D1Database);
    for (const call of [
      () => service.create(body()),
      () => service.list(),
      () => service.claim({ id: crypto.randomUUID(), adminKey: secret() }),
    ])
      await expect(call()).rejects.toMatchObject({ status: 401 });
    expect(count()).toBe(0);
  });
  it("新経路を未認証/偽emailで拒否、claimにもOrigin/JSON境界を適用", async () => {
    const token = await signed(),
      data = body(),
      p = await json(await create(token, {}, data)),
      before = snapshot();
    for (const path of ["/create/polls", "/api/create/polls", "/api/create/polls/claim"]) {
      expect((await request(path)).status).toBe(401);
      expect(
        (
          await request(path, undefined, {
            headers: { "Cf-Access-Authenticated-User-Email": "owner@example.com" },
          })
        ).status,
      ).toBe(401);
    }
    expect((await claim(p.id, data.adminKey)).status).toBe(401);
    for (const headers of [
      { Origin: "https://evil.example", "Content-Type": "application/json" },
      { Origin: "https://scheduler.example", "Content-Type": "text/plain" },
    ])
      expect(
        (
          await request("/api/create/polls/claim", token, {
            method: "POST",
            headers,
            body: JSON.stringify({ id: p.id, adminKey: data.adminKey }),
          })
        ).status,
      ).toBe(headers.Origin.includes("evil") ? 403 : 415);
    expect(snapshot()).toBe(before);
  });
  it("旧NULL行同内容retryは未帰属のまま、誤claim不変・同本人再追加冪等", async () => {
    const token = await signed(),
      data = body(),
      p = await json(await create(token, {}, data));
    database.prepare("UPDATE polls SET owner_id=NULL WHERE id=?").run(p.id);
    const legacy = snapshot();
    expect((await json(await create(token, {}, data))).id).toBe(p.id);
    expect(snapshot()).toBe(legacy);
    expect((await json(await request("/api/create/polls", token))).items).toEqual([]);
    expect((await claim(p.id, secret(), token)).status).toBe(403);
    expect((await claim(p.id, data.adminKey, token, { ownerId: "evil" })).status).toBe(422);
    expect(snapshot()).toBe(legacy);
    expect((await claim(p.id, data.adminKey, token)).status).toBe(200);
    const saved = snapshot();
    expect((await claim(p.id, data.adminKey, token)).status).toBe(200);
    expect(snapshot()).toBe(saved);
    const row = database.prepare("SELECT * FROM polls WHERE id=?").get(p.id)!;
    expect(row.owner_id).toBe(
      await hash(JSON.stringify(["https://fixture.cloudflareaccess.com", "owner"])),
    );
    expect({ ...row, owner_id: null }).toEqual(JSON.parse(legacy)[0][0]);
    expect((await json(await request("/api/create/polls", token))).items[0].id).toBe(p.id);
  });
  it("二主体claim競合は一方だけが帰属し、他方は上書きできない", async () => {
    const a = await signed(),
      b = await signed({ sub: "other-sub" }),
      data = body(),
      p = await json(await create(a, {}, data));
    database.prepare("UPDATE polls SET owner_id=NULL WHERE id=?").run(p.id);
    const results = await Promise.all([
      claim(p.id, data.adminKey, a),
      claim(p.id, data.adminKey, b),
    ]);
    expect(results.map((v) => v.status).sort()).toEqual([200, 403]);
    const counts = await Promise.all(
      [a, b].map(
        async (token) => (await json(await request("/api/create/polls", token))).items.length,
      ),
    );
    expect(counts.sort()).toEqual([0, 1]);
    const before = snapshot();
    expect((await claim(p.id, data.adminKey, results[0].status === 200 ? b : a)).status).toBe(403);
    expect(snapshot()).toBe(before);
  });
  it("同時刻id tieと50件境界、途中新規/改変cursorもowner条件を維持", async () => {
    const a = await signed(),
      b = await signed({ sub: "other-sub" });
    const ids: string[] = [];
    for (let n = 0; n < 53; n++) ids.push((await json(await create(a))).id);
    await create(b);
    database.prepare("UPDATE polls SET created_at=?").run("2026-10-30T00:00:00.000Z");
    const first = await json(await request("/api/create/polls", a));
    expect(first.items.map((v: { id: string }) => v.id)).toEqual(
      [...ids].sort().reverse().slice(0, 50),
    );
    expect(first.nextCursor).toBeTypeOf("string");
    const newest = await json(await create(a));
    const next = await json(
      await request(`/api/create/polls?cursor=${encodeURIComponent(first.nextCursor)}`, a),
    );
    expect(next.items.map((v: { id: string }) => v.id)).toEqual(
      [...ids].sort().reverse().slice(50),
    );
    expect(next.nextCursor).toBe(null);
    expect(next.items.map((v: { id: string }) => v.id)).not.toContain(newest.id);
    const other = await json(
      await request(`/api/create/polls?cursor=${encodeURIComponent(first.nextCursor)}`, b),
    );
    for (const p of other.items) expect(ids).not.toContain(p.id);
    for (const cursor of [
      "!",
      "a".repeat(513),
      btoa("{}"),
      btoa(JSON.stringify({ createdAt: "garbage", id: ids[0] })),
      btoa(JSON.stringify({ createdAt: "2026-10-30T00:00:00.000Z", id: "bad" })),
    ])
      expect(
        (await request(`/api/create/polls?cursor=${encodeURIComponent(cursor)}`, a)).status,
      ).toBe(422);
    expect(count()).toBe(55);
  });
});

describe("所有者削除の実HTTP境界", () => {
  it("匿名/別sub/owner偽装/Origin/JSON/revisionを拒否し本人削除後は全公開から消える", async () => {
    const token = await signed(),
      other = await signed({ sub: "other" }),
      input = body(),
      p = await json(await create(token, {}, input));
    const remove = (auth?: string, revision = 0, extras = {}, headers = {}) =>
      request(`/api/create/polls/${p.id}`, auth, {
        method: "DELETE",
        headers: {
          Origin: "https://scheduler.example",
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ revision, ...extras }),
      });
    const before = snapshot();
    expect((await remove()).status).toBe(401);
    expect((await remove(other)).status).toBe(409);
    expect((await remove(token, 0, { ownerId: "owner" })).status).toBe(422);
    expect((await remove(token, 1)).status).toBe(409);
    expect((await remove(token, 0, {}, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await remove(token, 0, {}, { "Content-Type": "text/plain" })).status).toBe(415);
    expect(snapshot()).toBe(before);
    expect((await request(`/p/${p.id}`)).status).toBe(200);
    expect(await json(await request(`/p/${p.id}`))).toEqual({ id: p.id });
    expect((await remove(token)).status).toBe(200);
    expect((await request(`/p/${p.id}`)).status).toBe(404);
    expect((await request(`/api/polls/${p.id}`)).status).toBe(404);
    expect((await json(await request("/api/create/polls", token))).items).toEqual([]);
    const deleted = snapshot();
    expect((await claim(p.id, input.adminKey, token)).status).toBe(403);
    expect((await create(token, {}, input)).status).toBe(404);
    expect((await remove(token)).status).toBe(409);
    expect(snapshot()).toBe(deleted);
  });
});
