import {
  AppError,
  createSchema,
  responseSchema,
  updateSchema,
  stateSchema,
  claimSchema,
  cursorSchema,
  listCursorSchema,
  deleteSchema,
  hash,
  parse,
} from "./rules";
type PollRow = {
  id: string;
  owner_id: string | null;
  title: string;
  description: string;
  slots: string;
  slot_ends: string | null;
  status: string;
  selected_slot: string | null;
  revision: number;
  admin_hash: string;
  create_key: string;
  payload_hash: string;
  created_at: string;
};
type ResponseRow = {
  id: string;
  poll_id: string;
  name: string;
  comment: string;
  answers: string;
  edit_hash: string;
  revision: number;
  request_key: string;
  payload_hash: string;
};
export type PublicPoll = {
  id: string;
  title: string;
  description: string;
  slots: string[];
  slotEnds?: string[];
  status: string;
  selectedSlot: string | null;
  revision: number;
  createdAt: string;
  responses: { id: string; name: string; comment: string; answers: string[]; revision: number }[];
};
export type OwnedPoll = {
  id: string;
  title: string;
  status: string;
  selectedSlot: string | null;
  createdAt: string;
  responseCount: number;
  revision: number;
  selectedSlotEnd?: string;
};
export type OwnedPollPage = { items: OwnedPoll[]; nextCursor: string | null };
export class SchedulingService {
  constructor(
    private db: D1Database,
    private ownerId?: string,
  ) {}
  private owner() {
    if (!this.ownerId) throw new AppError(401, "ログインが必要です。", "auth_required");
    return this.ownerId;
  }
  async poll(id: string) {
    const p = await this.db
      .prepare("SELECT * FROM polls WHERE id = ? AND status != 'deleted'")
      .bind(id)
      .first<PollRow>();
    if (!p) throw new AppError(404, "この日程調整は見つかりません。");
    return p;
  }
  async get(id: string): Promise<PublicPoll> {
    const p = await this.poll(id);
    const r = await this.db
      .prepare(
        "SELECT id,name,comment,answers,revision FROM responses WHERE poll_id = ? ORDER BY rowid",
      )
      .bind(id)
      .all<ResponseRow>();
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      slots: JSON.parse(p.slots),
      ...(p.slot_ends ? { slotEnds: JSON.parse(p.slot_ends) } : {}),
      status: p.status,
      selectedSlot: p.selected_slot,
      revision: p.revision,
      createdAt: p.created_at,
      responses: r.results.map((v) => ({
        id: v.id,
        name: v.name,
        comment: v.comment,
        answers: JSON.parse(v.answers),
        revision: v.revision,
      })),
    };
  }
  async create(input: unknown) {
    const owner = this.owner();
    const b = parse(createSchema, input),
      payload = await hash(JSON.stringify(b)),
      id = crypto.randomUUID();
    await this.db
      .prepare(
        "INSERT INTO polls (id,owner_id,title,description,slots,slot_ends,status,revision,admin_hash,create_key,payload_hash,created_at) VALUES (?,?,?,?,?,?,'open',0,?,?,?,?) ON CONFLICT(create_key) DO NOTHING",
      )
      .bind(
        id,
        owner,
        b.title,
        b.description,
        JSON.stringify(b.slots),
        b.slotEnds ? JSON.stringify(b.slotEnds) : null,
        await hash(b.adminKey),
        b.idempotencyKey,
        payload,
        new Date().toISOString(),
      )
      .run();
    const p = await this.db
      .prepare("SELECT * FROM polls WHERE create_key = ?")
      .bind(b.idempotencyKey)
      .first<PollRow>();
    if (!p || p.payload_hash !== payload || (p.owner_id !== null && p.owner_id !== owner))
      throw new AppError(409, "再送キーが別の内容で使われています。");
    return this.get(p.id);
  }
  async list(cursor?: unknown): Promise<OwnedPollPage> {
    const owner = this.owner();
    let after: { createdAt: string; id: string } | undefined;
    if (cursor !== undefined) {
      const encoded = parse(cursorSchema, cursor);
      try {
        after = JSON.parse(atob(encoded));
      } catch {
        throw new AppError(422, "ページの位置が無効です。再読み込みしてください。");
      }
      after = parse(listCursorSchema, after);
    }
    const statement = this.db.prepare(
      after
        ? `SELECT p.id,p.title,p.status,p.selected_slot,p.created_at,p.revision,p.slots,p.slot_ends,
          (SELECT COUNT(*) FROM responses r WHERE r.poll_id = p.id) AS response_count
          FROM polls p WHERE p.owner_id = ? AND p.status != 'deleted'
          AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))
          ORDER BY p.created_at DESC,p.id DESC LIMIT 51`
        : `SELECT p.id,p.title,p.status,p.selected_slot,p.created_at,p.revision,p.slots,p.slot_ends,
          (SELECT COUNT(*) FROM responses r WHERE r.poll_id = p.id) AS response_count
          FROM polls p WHERE p.owner_id = ? AND p.status != 'deleted'
          ORDER BY p.created_at DESC,p.id DESC LIMIT 51`,
    );
    const rows = await statement
      .bind(owner, ...(after ? [after.createdAt, after.createdAt, after.id] : []))
      .all<{
        id: string;
        title: string;
        status: string;
        selected_slot: string | null;
        created_at: string;
        response_count: number;
        revision: number;
        slots: string;
        slot_ends: string | null;
      }>();
    const items = rows.results.slice(0, 50).map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      selectedSlot: p.selected_slot,
      createdAt: p.created_at,
      responseCount: p.response_count,
      revision: p.revision,
      ...(p.slot_ends && p.selected_slot
        ? { selectedSlotEnd: JSON.parse(p.slot_ends)[JSON.parse(p.slots).indexOf(p.selected_slot)] }
        : {}),
    }));
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.results.length > 50 && last
          ? btoa(JSON.stringify({ createdAt: last.createdAt, id: last.id }))
          : null,
    };
  }
  async claim(input: unknown) {
    const owner = this.owner(),
      b = parse(claimSchema, input);
    const changed = await this.db
      .prepare(
        "UPDATE polls SET owner_id = ? WHERE id = ? AND status != 'deleted' AND admin_hash = ? AND (owner_id IS NULL OR owner_id = ?)",
      )
      .bind(owner, b.id, await hash(b.adminKey), owner)
      .run();
    if (!changed.meta.changes)
      throw new AppError(403, "管理リンクを確認してください。この日程調整は追加できません。");
    return { id: b.id };
  }
  async delete(id: string, input: unknown) {
    const owner = this.owner(),
      b = parse(deleteSchema, input);
    const changed = await this.db
      .prepare(
        "UPDATE polls SET status='deleted',revision=revision+1 WHERE id=? AND owner_id=? AND revision=? AND status!='deleted'",
      )
      .bind(id, owner, b.revision)
      .run();
    if (!changed.meta.changes)
      throw new AppError(409, "削除できません。最新の一覧を確認してください。");
    return { id };
  }
  async submit(id: string, input: unknown) {
    const b = parse(responseSchema, input),
      payload = await hash(JSON.stringify({ id, ...b }));
    const old = await this.db
      .prepare("SELECT * FROM responses WHERE request_key = ?")
      .bind(b.idempotencyKey)
      .first<ResponseRow>();
    if (old) {
      if (old.payload_hash !== payload)
        throw new AppError(409, "再送キーが別の内容で使われています。");
      return { poll: await this.get(id), responseId: old.id };
    }
    const p = await this.poll(id);
    this.answers(p, b.answers);
    const rid = crypto.randomUUID();
    await this.db
      .prepare(
        "INSERT INTO responses (id,poll_id,name,comment,answers,edit_hash,revision,request_key,payload_hash) SELECT ?,?,?,?,?,?,0,?,? FROM polls WHERE id = ? AND status = 'open' AND revision = ? ON CONFLICT(request_key) DO NOTHING",
      )
      .bind(
        rid,
        id,
        b.name,
        b.comment,
        JSON.stringify(b.answers),
        await hash(b.editKey),
        b.idempotencyKey,
        payload,
        id,
        b.pollRevision,
      )
      .run();
    const saved = await this.db
      .prepare("SELECT * FROM responses WHERE request_key = ?")
      .bind(b.idempotencyKey)
      .first<ResponseRow>();
    if (!saved)
      throw new AppError(
        409,
        "受付状態が変わりました。最新の回答を確認して、もう一度送信してください。",
        "state_changed",
      );
    if (saved.payload_hash !== payload)
      throw new AppError(409, "再送キーが別の内容で使われています。");
    return { poll: await this.get(id), responseId: saved.id };
  }
  answers(p: PollRow, answers: string[]) {
    if (JSON.parse(p.slots).length !== answers.length)
      throw new AppError(422, "すべての候補に回答してください。");
  }
  async update(id: string, rid: string, input: unknown, secret: string) {
    const b = parse(updateSchema, input),
      p = await this.poll(id);
    this.answers(p, b.answers);
    const r = await this.db
      .prepare("SELECT * FROM responses WHERE id = ? AND poll_id = ?")
      .bind(rid, id)
      .first<ResponseRow>();
    if (!r) throw new AppError(404, "回答が見つかりません。");
    if (r.edit_hash !== (await hash(secret)))
      throw new AppError(403, "回答の編集キーが正しくありません。");
    const changed = await this.db
      .prepare(
        "UPDATE responses SET name=?,comment=?,answers=?,revision=revision+1 WHERE id=? AND poll_id=? AND edit_hash=? AND revision=? AND EXISTS (SELECT 1 FROM polls WHERE id=? AND status='open' AND revision=?)",
      )
      .bind(
        b.name,
        b.comment,
        JSON.stringify(b.answers),
        rid,
        id,
        await hash(secret),
        b.revision,
        id,
        b.pollRevision,
      )
      .run();
    if (!changed.meta.changes)
      throw new AppError(409, "回答または受付状態が変わりました。再読み込みしてください。");
    return this.get(id);
  }
  async state(id: string, input: unknown, secret: string) {
    const b = parse(stateSchema, input),
      p = await this.poll(id);
    if (p.admin_hash !== (await hash(secret)))
      throw new AppError(403, "管理キーが正しくありません。");
    if (
      b.status === "finalized" &&
      (!b.selectedSlot || !JSON.parse(p.slots).includes(b.selectedSlot))
    )
      throw new AppError(422, "このイベントの候補を選んでください。");
    const changed = await this.db
      .prepare(
        "UPDATE polls SET status=?,selected_slot=?,revision=revision+1 WHERE id=? AND admin_hash=? AND revision=? AND status!='deleted' AND (? != 'finalized' OR EXISTS (SELECT 1 FROM json_each(polls.slots) WHERE value = ?))",
      )
      .bind(
        b.status,
        b.status === "finalized" ? b.selectedSlot : null,
        id,
        await hash(secret),
        b.revision,
        b.status,
        b.selectedSlot || "",
      )
      .run();
    if (!changed.meta.changes)
      throw new AppError(409, "受付状態が変わりました。再読み込みしてください。");
    return this.get(id);
  }
}
