import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { SchedulingService } from "../server/service";
import { createSchema, hash, keySchema, responseSchema } from "../server/rules";
import { MAX_SLOTS } from "../server/limits";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
let service: SchedulingService;
let database: DatabaseSync;
const secret = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
const create = (adminKey = secret()) => ({
  title: "集まり",
  description: "テスト",
  slots: ["2026-11-01T12:00:00+09:00", "2026-11-02T12:00:00+09:00"],
  adminKey,
  idempotencyKey: crypto.randomUUID(),
});
const response = (editKey = secret()) => ({
  name: "山田",
  comment: "よろしく",
  answers: ["yes", "maybe"],
  pollRevision: 0,
  editKey,
  idempotencyKey: crypto.randomUUID(),
});
const body = (r: ReturnType<typeof response>) => ({
  name: r.name,
  comment: r.comment,
  answers: r.answers,
  pollRevision: r.pollRevision,
  revision: 0,
});
const snapshot = () =>
  JSON.stringify([
    database.prepare("SELECT * FROM polls").all(),
    database.prepare("SELECT * FROM responses").all(),
  ]);
beforeEach(() => {
  database = new DatabaseSync(":memory:");
  for (const file of readdirSync("db/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    database.exec(readFileSync(`db/migrations/${file}`, "utf8"));
  const adapter = {
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
          const r = database.prepare(sql).run(...(params as []));
          return { meta: { changes: Number(r.changes) } };
        },
      };
      return statement;
    },
  };
  service = new SchedulingService(adapter as unknown as D1Database, "fixture-owner");
});
describe("入力と秘密", () => {
  it("日付の繰り上がり・重複・30件超・短い秘密を拒否", () => {
    const valid = create();
    expect(createSchema.safeParse(valid).success).toBe(true);
    for (const slots of [
      ["2026-02-30T12:00:00+09:00"],
      [valid.slots[0], valid.slots[0]],
      Array(31).fill(valid.slots[0]),
    ])
      expect(createSchema.safeParse({ ...valid, slots }).success).toBe(false);
    expect(keySchema.safeParse("short").success).toBe(false);
  });
  it("候補と回答は30件まで（3日×10時間枠）を受け付け、31件は拒否", () => {
    expect(MAX_SLOTS).toBe(30);
    const hourly = (date: string) =>
      Array.from({ length: 10 }, (_, h) => [
        `${date}T${String(10 + h).padStart(2, "0")}:00:00+09:00`,
        `${date}T${String(11 + h).padStart(2, "0")}:00:00+09:00`,
      ]);
    const pairs = ["2026-11-03", "2026-11-07", "2026-11-08"].flatMap(hourly);
    const thirty = {
      ...create(),
      slots: pairs.map(([s]) => s),
      slotEnds: pairs.map(([, e]) => e),
    };
    expect(createSchema.safeParse(thirty).success).toBe(true);
    const extra = ["2026-11-14T10:00:00+09:00", "2026-11-14T11:00:00+09:00"];
    expect(
      createSchema.safeParse({
        ...thirty,
        slots: [...thirty.slots, extra[0]],
        slotEnds: [...thirty.slotEnds, extra[1]],
      }).success,
    ).toBe(false);
    const answers = (n: number) => Array(n).fill("yes");
    const base = { ...response(), pollRevision: 0 };
    expect(responseSchema.safeParse({ ...base, answers: answers(30) }).success).toBe(true);
    expect(responseSchema.safeParse({ ...base, answers: answers(31) }).success).toBe(false);
  });
  it("hashは元秘密を含まない", async () => {
    const k = secret();
    expect(await hash(k)).toHaveLength(64);
    expect(await hash(k)).not.toContain(k);
  });
});
describe("作成・回答と再送", () => {
  it("作成と同じ内容の再送は同じID、別内容/別秘密は409", async () => {
    const b = create();
    const a = await service.create(b);
    expect((await service.create(b)).id).toBe(a.id);
    await expect(service.create({ ...b, title: "違う" })).rejects.toMatchObject({ status: 409 });
    await expect(service.create({ ...b, adminKey: secret() })).rejects.toMatchObject({
      status: 409,
    });
    expect(database.prepare("SELECT * FROM polls").all()).toHaveLength(1);
  });
  it("全候補必須・同名別人許可・公開projectionには秘密なし", async () => {
    const b = create(),
      p = await service.create(b),
      r = response();
    await expect(service.submit(p.id, { ...r, answers: ["yes"] })).rejects.toMatchObject({
      status: 422,
    });
    await service.submit(p.id, r);
    await service.submit(p.id, response());
    const pub = await service.get(p.id);
    expect(pub.responses).toHaveLength(2);
    const text = JSON.stringify(pub);
    for (const v of [
      b.adminKey,
      r.editKey,
      "admin_hash",
      "edit_hash",
      "request_key",
      "payload_hash",
      "create_key",
    ])
      expect(text).not.toContain(v);
  });
  it("成功後の締切でも同一再送は元の回答、内容/秘密変更は409", async () => {
    const b = create(),
      p = await service.create(b),
      r = response(),
      first = await service.submit(p.id, r);
    await service.state(p.id, { status: "closed", revision: 0 }, b.adminKey);
    expect((await service.submit(p.id, r)).responseId).toBe(first.responseId);
    const before = snapshot();
    await expect(service.submit(p.id, { ...r, name: "違う" })).rejects.toMatchObject({
      status: 409,
    });
    await expect(service.submit(p.id, { ...r, editKey: secret() })).rejects.toMatchObject({
      status: 409,
    });
    expect(snapshot()).toBe(before);
  });
});
describe("認可と原子revision", () => {
  it("他人の回答、別イベント回答ID、他イベント管理キーを拒否し不変", async () => {
    const b = create(),
      other = create(),
      p = await service.create(b),
      q = await service.create(other),
      r = response(),
      v = await service.submit(p.id, r);
    const before = snapshot();
    await expect(service.update(p.id, v.responseId, body(r), secret())).rejects.toMatchObject({
      status: 403,
    });
    await expect(service.update(q.id, v.responseId, body(r), r.editKey)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      service.state(p.id, { status: "closed", revision: 0 }, other.adminKey),
    ).rejects.toMatchObject({ status: 403 });
    expect(snapshot()).toBe(before);
  });
  it("過去・未来のevent revisionとresponse revisionを拒否", async () => {
    const b = create(),
      p = await service.create(b),
      r = response(),
      v = await service.submit(p.id, r);
    await service.update(p.id, v.responseId, body(r), r.editKey);
    for (const revision of [0, 2]) {
      const before = snapshot();
      await expect(
        service.update(p.id, v.responseId, { ...body(r), revision }, r.editKey),
      ).rejects.toMatchObject({ status: 409 });
      expect(snapshot()).toBe(before);
    }
    await service.state(p.id, { status: "closed", revision: 0 }, b.adminKey);
    await service.state(p.id, { status: "open", revision: 1 }, b.adminKey);
    for (const revision of [0, 3]) {
      const before = snapshot();
      await expect(
        service.state(p.id, { status: "closed", revision }, b.adminKey),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        service.submit(p.id, { ...response(), pollRevision: revision }),
      ).rejects.toMatchObject({ status: 409 });
      expect(snapshot()).toBe(before);
    }
  });
  it("締切と回答を競合させても締切後の追加・更新を拒否", async () => {
    const b = create(),
      p = await service.create(b),
      r = response(),
      v = await service.submit(p.id, r);
    await Promise.allSettled([
      service.state(p.id, { status: "closed", revision: 0 }, b.adminKey),
      service.submit(p.id, response()),
    ]);
    const before = snapshot();
    await expect(service.submit(p.id, response())).rejects.toMatchObject({ status: 409 });
    await expect(service.update(p.id, v.responseId, body(r), r.editKey)).rejects.toMatchObject({
      status: 409,
    });
    expect(snapshot()).toBe(before);
  });
  it("確定候補所属・finalized回答拒否・再開で確定解除", async () => {
    const b = create(),
      p = await service.create(b);
    const before = snapshot();
    await expect(
      service.state(
        p.id,
        { status: "finalized", selectedSlot: "2027-01-01T12:00:00+09:00", revision: 0 },
        b.adminKey,
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(snapshot()).toBe(before);
    await service.state(
      p.id,
      { status: "finalized", selectedSlot: p.slots[0], revision: 0 },
      b.adminKey,
    );
    await expect(service.submit(p.id, response())).rejects.toMatchObject({ status: 409 });
    const reopened = await service.state(p.id, { status: "open", revision: 1 }, b.adminKey);
    expect(reopened.selectedSlot).toBe(null);
    expect(reopened.status).toBe("open");
  });
});

describe("所有者migrationの旧データ互換", () => {
  it("追加migrationは旧行をNULLのまま保持し、旧列と回答を変えない", async () => {
    const p = await service.create(create());
    await service.submit(p.id, response());
    const row = database.prepare("SELECT * FROM polls WHERE id=?").get(p.id)!;
    const { owner_id: _owner, slot_ends: _ends, ...legacy } = row;
    const answer = database.prepare("SELECT * FROM responses WHERE poll_id=?").get(p.id)!;
    const previous = new DatabaseSync(":memory:");
    try {
      const files = readdirSync("db/migrations")
        .filter((f) => f.endsWith(".sql"))
        .sort();
      for (const f of files.filter((f) => f < "20261030145234"))
        previous.exec(readFileSync(`db/migrations/${f}`, "utf8"));
      for (const [table, data] of [
        ["polls", legacy],
        ["responses", answer],
      ] as const) {
        const names = Object.keys(data);
        previous
          .prepare(
            `INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`,
          )
          .run(...(Object.values(data) as []));
      }
      previous.exec(readFileSync("db/migrations/20261030145234_overjoyed_magus.sql", "utf8"));
      expect(previous.prepare("SELECT * FROM polls").get()).toEqual({ ...legacy, owner_id: null });
      expect(previous.prepare("SELECT * FROM responses").get()).toEqual(answer);
      expect(
        previous
          .prepare("PRAGMA index_list('polls')")
          .all()
          .some((v) => v.name === "polls_owner_created_id"),
      ).toBe(true);
    } finally {
      previous.close();
    }
  });
});

describe("時間帯と削除", () => {
  it("開始終了を保存し確定日時の終了を一覧に導出、旧候補は省略互換", async () => {
    const old = await service.create(create());
    expect(old.slotEnds).toBeUndefined();
    const b = { ...create(), slotEnds: ["2026-11-01T14:00:00+09:00", "2026-11-02T14:00:00+09:00"] };
    const p = await service.create(b);
    expect(p.slotEnds).toEqual(b.slotEnds);
    expect((await service.create(b)).id).toBe(p.id);
    await service.state(
      p.id,
      { status: "finalized", selectedSlot: p.slots[1], revision: 0 },
      b.adminKey,
    );
    expect((await service.list()).items.find((v) => v.id === p.id)).toMatchObject({
      selectedSlotEnd: b.slotEnds[1],
      revision: 1,
    });
  });
  it("終了逆転/別日/数不一致/不正実日付/重複開始を拒否", () => {
    const b = create();
    for (const slotEnds of [
      [b.slots[0], b.slots[1]],
      ["2026-11-02T14:00:00+09:00", "2026-11-02T14:00:00+09:00"],
      ["2026-11-01T14:00:00+09:00"],
      ["2026-02-30T14:00:00+09:00", b.slots[1]],
    ])
      expect(createSchema.safeParse({ ...b, slotEnds }).success).toBe(false);
    expect(
      createSchema.safeParse({
        ...b,
        slots: [b.slots[0], b.slots[0]],
        slotEnds: ["2026-11-01T13:00:00+09:00", "2026-11-01T14:00:00+09:00"],
      }).success,
    ).toBe(false);
    expect(
      createSchema.safeParse({
        ...b,
        slots: ["2028-02-29T12:00:00+09:00"],
        slotEnds: ["2028-02-29T14:00:00+09:00"],
      }).success,
    ).toBe(true);
  });
  it("削除後の回答再送/更新/管理/claim/create再送は全て拒否し復活しない", async () => {
    const b = create(),
      p = await service.create(b),
      r = response(),
      a = await service.submit(p.id, r);
    await service.delete(p.id, { revision: 0 });
    const deleted = snapshot();
    for (const call of [
      () => service.get(p.id),
      () => service.create(b),
      () => service.submit(p.id, r),
      () => service.submit(p.id, response()),
      () => service.update(p.id, a.responseId, body(r), r.editKey),
      () => service.state(p.id, { status: "open", revision: 1 }, b.adminKey),
      () => service.claim({ id: p.id, adminKey: b.adminKey }),
    ])
      await expect(call()).rejects.toMatchObject({ status: expect.any(Number) });
    expect(snapshot()).toBe(deleted);
    expect((await service.list()).items).toEqual([]);
  });
  it("削除競合は一度のみ成功、状態更新のTOCTOUでも復活を拒否", async () => {
    const b = create(),
      p = await service.create(b);
    const results = await Promise.allSettled([
      service.delete(p.id, { revision: 0 }),
      service.delete(p.id, { revision: 0 }),
    ]);
    expect(results.filter((v) => v.status === "fulfilled")).toHaveLength(1);
    const q = await service.create(create());
    const original = service.poll.bind(service);
    service.poll = async (id: string) => {
      const row = await original(id);
      database.prepare("UPDATE polls SET status='deleted',revision=revision+1 WHERE id=?").run(id);
      return row;
    };
    await expect(
      service.state(q.id, { status: "open", revision: 0 }, b.adminKey),
    ).rejects.toMatchObject({ status: 403 });
    service.poll = original;
    const qb = create(),
      qp = await service.create(qb);
    service.poll = async (id: string) => {
      const row = await original(id);
      database.prepare("UPDATE polls SET status='deleted',revision=revision+1 WHERE id=?").run(id);
      return row;
    };
    await expect(
      service.state(qp.id, { status: "open", revision: 0 }, qb.adminKey),
    ).rejects.toMatchObject({ status: 409 });
    expect(database.prepare("SELECT status FROM polls WHERE id=?").get(qp.id)!.status).toBe(
      "deleted",
    );
  });
  it("旧payload hashを維持しNULL所有者は削除不可", async () => {
    const b = create(),
      p = await service.create(b);
    const payload = await hash(
      JSON.stringify({
        title: b.title,
        description: b.description,
        slots: b.slots,
        adminKey: b.adminKey,
        idempotencyKey: b.idempotencyKey,
      }),
    );
    database
      .prepare("UPDATE polls SET payload_hash=?,slot_ends=NULL WHERE id=?")
      .run(payload, p.id);
    const legacy = snapshot();
    expect((await service.create(b)).id).toBe(p.id);
    expect(snapshot()).toBe(legacy);
    expect(
      database.prepare("SELECT payload_hash FROM polls WHERE id=?").get(p.id)!.payload_hash,
    ).toBe(payload);
    database.prepare("UPDATE polls SET owner_id=NULL WHERE id=?").run(p.id);
    const before = snapshot();
    await expect(service.delete(p.id, { revision: 0 })).rejects.toMatchObject({ status: 409 });
    expect(snapshot()).toBe(before);
  });
});

describe("削除競合と再起動保存", () => {
  it("事前取得直後に削除されても回答追加と編集はSQLで拒否", async () => {
    const b = create(),
      p = await service.create(b),
      r = response(),
      _a = await service.submit(p.id, r),
      original = service.poll.bind(service);
    service.poll = async (id: string) => {
      const row = await original(id);
      database.prepare("UPDATE polls SET status='deleted',revision=revision+1 WHERE id=?").run(id);
      return row;
    };
    const beforeCount = database.prepare("SELECT COUNT(*) AS n FROM responses").get()!.n;
    await expect(service.submit(p.id, response())).rejects.toMatchObject({ status: 409 });
    expect(database.prepare("SELECT COUNT(*) AS n FROM responses").get()!.n).toBe(beforeCount);
    service.poll = original;
    const q = await service.create(create()),
      rr = response(),
      aa = await service.submit(q.id, rr);
    const beforeResponse = JSON.stringify(
      database.prepare("SELECT * FROM responses WHERE id=?").get(aa.responseId),
    );
    service.poll = async (id: string) => {
      const row = await original(id);
      database.prepare("UPDATE polls SET status='deleted',revision=revision+1 WHERE id=?").run(id);
      return row;
    };
    await expect(
      service.update(q.id, aa.responseId, { ...body(rr), name: "changed" }, rr.editKey),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      JSON.stringify(database.prepare("SELECT * FROM responses WHERE id=?").get(aa.responseId)),
    ).toBe(beforeResponse);
  });
  it("SQLiteをclose/reopenして範囲/回答/所有者と削除状態を同値比較", async () => {
    const b = { ...create(), slotEnds: ["2026-11-01T14:00:00+09:00", "2026-11-02T14:00:00+09:00"] },
      p = await service.create(b);
    await service.submit(p.id, response());
    const before = snapshot(),
      dir = mkdtempSync(join(tmpdir(), "awaseru-persistence-")),
      file = join(dir, "fixture.sqlite");
    try {
      database.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
      database.close();
      database = new DatabaseSync(file);
      expect(snapshot()).toBe(before);
      expect((await service.get(p.id)).slotEnds).toEqual(b.slotEnds);
      await service.delete(p.id, { revision: 0 });
      const deleted = snapshot();
      database.close();
      database = new DatabaseSync(file);
      expect(snapshot()).toBe(deleted);
      await expect(service.get(p.id)).rejects.toMatchObject({ status: 404 });
      expect((await service.list()).items).toEqual([]);
    } finally {
      database.close();
      database = new DatabaseSync(":memory:");
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
