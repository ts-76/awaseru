import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const base = process.env.BASE_URL || "http://127.0.0.1:5173";
const key = () => randomBytes(32).toString("base64url");
// Optional short-lived assertions from a real Access-authenticated session. Never written to files.
const createAssertion = process.env.ACCESS_CREATE_ASSERTION;
const mcpAssertion = process.env.ACCESS_MCP_ASSERTION;
let checks = 0;
const ok = (name, id) => {
  checks++;
  console.log(`smoke ok: ${name} （確認 ${id}）`);
};
async function api(path, method = "GET", body, secret, expected = 200) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: new URL(base).origin,
      ...((path === "/api/create" || path.startsWith("/api/create/")) && createAssertion
        ? { "Cf-Access-Jwt-Assertion": createAssertion }
        : {}),
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(r.status, expected, `${method} ${path}: ${await r.clone().text()}`);
  assert.equal(r.headers.get("cache-control"), "no-store");
  return r.json();
}
if (process.argv.includes("--compare")) {
  const saved = JSON.parse(readFileSync("notes/persistence.json", "utf8"));
  assert.deepEqual(await api(`/api/polls/${saved.id}`), saved);
  const owned = JSON.parse(readFileSync("notes/owned-persistence.json", "utf8"));
  assert.deepEqual(await api("/api/create/polls"), owned);
  console.log(
    "smoke compare ok: イベント・候補・回答・コメント・状態・revision 再起動後の保存値一致 （確認 C5 R6）",
  );
  process.exit(0);
}
if (!createAssertion || !mcpAssertion) {
  const expected = Number(process.env.AUTH_REJECTION_STATUS || 503);
  for (const path of [
    "/create",
    "/create/",
    "/create/polls",
    "/create/connect",
    "/api/create/polls",
    "/api/create/polls/claim",
    "/api/create/polls/" + randomUUID(),
    "/api/create/session",
    "/%63reate",
    "/api/create",
    "/api/create/",
    "/api/%63reate",
    "/mcp",
    "/mcp/",
  ]) {
    for (const method of ["GET", "HEAD", "POST", "PATCH"]) {
      const r = await fetch(base + path, {
        method,
        redirect: "manual",
        headers: {
          "Cf-Access-Authenticated-User-Email": "owner@example.com",
          Authorization: "Bearer obsolete-token",
        },
      });
      assert.equal(r.status, expected, `${method} ${path}`);
      assert.equal(r.headers.get("cache-control"), "no-store");
    }
  }
  ok(`未認証・偽装header・旧Bearerは全保護経路で${expected}`, "C1 C2 R7 R9");
  await api("/api/polls", "POST", {}, undefined, 410);
  ok("旧作成APIは無効", "C1 R9");
  const connect = await fetch(base + "/connect", { redirect: "manual" });
  assert.equal(connect.status, 302);
  assert.equal(connect.headers.get("location"), "/create/connect");
  const root = await fetch(base, { redirect: "manual" });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get("location"), "/create/polls");
  ok("旧接続案内URLと本人一覧へのredirect", "C1");
  // Unknown or deleted polls answer 404, but still render the public shell.
  const publicPage = await fetch(base + "/p/" + randomUUID());
  assert.equal(publicPage.status, 404);
  const html = await publicPage.text();
  for (const leak of [
    "<nav",
    'href="/create',
    'href="/connect',
    'href="/mcp',
    "MCP接続",
    "ログイン",
  ])
    assert.ok(!html.includes(leak), `公開日程画面に管理導線: ${leak}`);
  ok("公開日程画面に管理ナビ・ログイン・MCP導線なし", "C1");
  console.log(
    "Authenticated create/MCP operations not run: real Access assertions required. No authentication bypass is enabled.",
  );
  process.exit(0);
}
const b = {
  title: "HTTP確認用の日程調整",
  description: "合成データ",
  slots: ["2026-11-03T12:00:00+09:00", "2026-11-04T13:00:00+09:00"],
  adminKey: key(),
  idempotencyKey: randomUUID(),
};
const p = await api("/api/create", "POST", b);
assert.equal((await api("/api/create", "POST", b)).id, p.id);
ok("作成と同一再送は同じイベント", "C1 R8");
const path = `/api/polls/${p.id}`;
await api("/api/create", "POST", { ...b, title: "異なる内容" }, undefined, 409);
await api("/api/create", "POST", { ...b, adminKey: key() }, undefined, 409);
ok("作成の変更payload・別秘密で再送409", "R2 R8");
await api(
  "/api/create",
  "POST",
  { ...b, idempotencyKey: randomUUID(), slots: ["2026-02-30T12:00:00+09:00"] },
  undefined,
  422,
);
await api(
  "/api/create",
  "POST",
  { ...b, idempotencyKey: randomUUID(), slots: [b.slots[0], b.slots[0]] },
  undefined,
  422,
);
ok("無効日付と重複候補422", "R1");
const rb = {
  name: "スモーク参加者",
  comment: "合成コメント",
  answers: ["yes", "maybe"],
  pollRevision: 0,
  editKey: key(),
  idempotencyKey: randomUUID(),
};
await api(path + "/responses", "POST", { ...rb, answers: ["yes"] }, undefined, 422);
const r = await api(path + "/responses", "POST", rb);
assert.equal(r.poll.responses.length, 1);
ok("全候補回答必須422と正常保存", "C2 R4");
const publicText = JSON.stringify(await api(path));
for (const k of [
  b.adminKey,
  rb.editKey,
  "admin_hash",
  "edit_hash",
  "create_key",
  "request_key",
  "payload_hash",
])
  assert(!publicText.includes(k));
ok("共有レスポンスに秘密・hash・再送キーなし", "R2 R3");
const update = {
  name: rb.name,
  comment: "更新したコメント",
  answers: ["yes", "no"],
  pollRevision: 0,
  revision: 0,
};
const before = await api(path);
await api(path + `/responses/${r.responseId}`, "PATCH", update, key(), 403);
await api(path + "/state", "PATCH", { status: "closed", revision: 0 }, key(), 403);
assert.deepEqual(await api(path), before);
ok("他人編集と不正管理キー403かつデータ不変", "C3 R2 R4");
await api(path + `/responses/${r.responseId}`, "PATCH", update, rb.editKey);
const edited = await api(path);
for (const revision of [0, 2])
  await api(path + `/responses/${r.responseId}`, "PATCH", { ...update, revision }, rb.editKey, 409);
assert.deepEqual(await api(path), edited);
ok("本人編集と回答stale/future revision409不変", "C2 R5 R8");
await api(
  path + "/state",
  "PATCH",
  { status: "finalized", revision: 0, selectedSlot: "2027-01-01T12:00:00+09:00" },
  b.adminKey,
  422,
);
ok("別候補での日程確定422", "R5");
await Promise.allSettled([
  api(path + "/state", "PATCH", { status: "closed", revision: 0 }, b.adminKey),
  api(path + "/responses", "POST", { ...rb, idempotencyKey: randomUUID() }),
]);
const closed = await api(path);
assert.equal(closed.status, "closed");
await api(path + "/responses", "POST", { ...rb, idempotencyKey: randomUUID() }, undefined, 409);
await api(
  path + `/responses/${r.responseId}`,
  "PATCH",
  { ...update, revision: 1 },
  rb.editKey,
  409,
);
assert.deepEqual(await api(path), closed);
ok("締切競合後の追加編集409・不変", "C3 R5");
assert.equal((await api(path + "/responses", "POST", rb)).responseId, r.responseId);
await api(path + "/responses", "POST", { ...rb, comment: "変更" }, undefined, 409);
ok("締切後も成功済再送は同じ回答・変更再送409", "R8");
await api(path + "/state", "PATCH", { status: "open", revision: 1 }, b.adminKey);
const reopened = await api(path);
for (const revision of [0, 3])
  await api(path + "/state", "PATCH", { status: "closed", revision }, b.adminKey, 409);
assert.deepEqual(await api(path), reopened);
ok("イベント過去・未来revision409不変と再開", "R5 R8");
await api(
  path + "/state",
  "PATCH",
  { status: "finalized", revision: 2, selectedSlot: b.slots[0] },
  b.adminKey,
);
const final = await api(path);
await api(
  path + "/responses",
  "POST",
  { ...rb, idempotencyKey: randomUUID(), pollRevision: 3 },
  undefined,
  409,
);
assert.deepEqual(await api(path), final);
ok("日程確定と確定後回答409不変", "C3 R5");
const giant = new ReadableStream({
  start(c) {
    c.enqueue(new TextEncoder().encode(JSON.stringify({ padding: "x".repeat(40000) })));
    c.close();
  },
});
const over = await fetch(base + "/api/create", {
  method: "POST",
  body: giant,
  duplex: "half",
  headers: { "Content-Type": "application/json" },
});
assert.equal(over.status, 413);
assert.deepEqual(await api(path), final);
ok("Content-Lengthなし32KB超過413・データ不変", "R1 R6");
const origin = await fetch(base + "/api/create", {
  method: "POST",
  headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
  body: JSON.stringify(b),
});
assert.equal(origin.status, 403);
ok("異なるOrigin403", "R2");
const unauth = await fetch(base + "/mcp", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(unauth.status, 401);
ok("MCP未認証401", "C4 R7");

const client = new Client({ name: "awaseru-smoke", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
  requestInit: { headers: { "Cf-Access-Jwt-Assertion": mcpAssertion } },
});
await client.connect(transport);
const getRequest = await fetch(base + "/mcp", {
  headers: { "Cf-Access-Jwt-Assertion": mcpAssertion, Accept: "text/event-stream" },
});
assert.equal(getRequest.status, 405);
ok("MCP stateless GETは405で有限応答", "R7");
const subscription = await fetch(base + "/mcp", {
  method: "POST",
  headers: {
    "Cf-Access-Jwt-Assertion": mcpAssertion,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-11-25",
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 77, method: "subscriptions/listen", params: {} }),
  signal: AbortSignal.timeout(5000),
});
assert((await subscription.text()).includes('"error"'));
ok("MCP未対応購読は有限エラー応答", "R7");
const tools = await client.listTools();
assert.equal(tools.tools.length, 5);
ok("公式SDK Client initialize・tools/list 5件", "C4 R7");
const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args });
  return result;
};
const mb = { ...b, title: "MCP確認", adminKey: key(), idempotencyKey: randomUUID() };
const created = await call("create_poll", mb);
assert(!created.isError);
const mp = JSON.parse(created.content[0].text);
const mr = { ...rb, id: mp.id, editKey: key(), idempotencyKey: randomUUID() };
const submitted = await call("submit_response", mr);
assert(!submitted.isError);
const mv = JSON.parse(submitted.content[0].text);
ok("MCPイベント作成・回答保存", "C1 C2 C4 R7");
const mine = await api("/api/create/polls");
for (const id of [p.id, mp.id]) assert(mine.items.some((v) => v.id === id));
for (const v of mine.items)
  assert.deepEqual(Object.keys(v).sort(), [
    "createdAt",
    "id",
    "responseCount",
    "selectedSlot",
    "status",
    "title",
  ]);
await api("/api/create/polls/claim", "POST", { id: p.id, adminKey: b.adminKey });
assert.deepEqual(await api("/api/polls/" + p.id), final);
ok("Web/MCP同一本人の一覧・限定metadata・同本人追加冪等", "C1 C2 C3 R10 R11");
const mBefore = await api(`/api/polls/${mp.id}`);
const bad = await call("set_poll_state", {
  id: mp.id,
  status: "closed",
  revision: 0,
  adminKey: b.adminKey,
});
assert(bad.isError);
const badEdit = await call("update_response", {
  id: mp.id,
  responseId: mv.responseId,
  ...update,
  editKey: rb.editKey,
});
assert(badEdit.isError);
assert.deepEqual(await api(`/api/polls/${mp.id}`), mBefore);
ok("MCP認証だけでは他イベント管理・他人編集不可かつ不変", "C4 R2 R7");
const finalized = await call("set_poll_state", {
  id: mp.id,
  status: "finalized",
  revision: 0,
  selectedSlot: mb.slots[0],
  adminKey: mb.adminKey,
});
assert(!finalized.isError);
const get = await call("get_poll", { id: mp.id });
assert.equal(JSON.parse(get.content[0].text).status, "finalized");
ok("MCP日程確定・取得", "C3 C4 R7");
await client.close();
mkdirSync("notes", { recursive: true });
writeFileSync("notes/persistence.json", JSON.stringify(await api(path), null, 2));
writeFileSync(
  "notes/owned-persistence.json",
  JSON.stringify(await api("/api/create/polls"), null, 2),
);
console.log(`smoke completed: ${checks} checks; persistence snapshot ready`);
