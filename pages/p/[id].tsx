import { useEffect, useRef, useState } from "react";
import type { calendarLinks } from "../../server/calendar-links";
import type { PublicPoll } from "../../server/service";
import type { Props } from "./[id].server";
import {
  api,
  secret,
  marks,
  answerNames,
  AnswerMark,
  dateLabel,
  Copy,
  Notice,
  saveKey,
  readKey,
  Visibility,
} from "../_ui";
export default function PollPage({ id }: Props) {
  const [poll, setPoll] = useState<PublicPoll | null>(null),
    [error, setError] = useState(""),
    [admin, setAdmin] = useState(""),
    [origin, setOrigin] = useState(""),
    [name, setName] = useState(""),
    [comment, setComment] = useState(""),
    [answers, setAnswers] = useState<string[]>([]),
    [editing, setEditing] = useState<{ id: string; key: string; revision: number } | null>(null),
    [pending, setPending] = useState(false),
    [success, setSuccess] = useState(""),
    [selected, setSelected] = useState(""),
    [adminMessage, setAdminMessage] = useState(""),
    [adminError, setAdminError] = useState(""),
    [armed, setArmed] = useState<"finalized" | "closed" | null>(null);
  const [calendarAccess, setCalendarAccess] = useState<{
    revision: number;
    id: string;
    requestedAdmin: string;
    links: NonNullable<ReturnType<typeof calendarLinks>>;
    adminKey: string;
  } | null>(null);
  const [calendarPending, setCalendarPending] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setCalendarAccess(null);
    if (poll?.status !== "finalized") return;
    const revision = poll.revision;
    async function load() {
      const paths = [
        ...(admin ? [{ path: `/api/polls/${id}/calendar-links`, key: admin }] : []),
        { path: `/api/create/polls/${id}/calendar-links`, key: "" },
      ];
      for (const { path, key } of paths) {
        try {
          const response = await fetch(path, {
            headers: key ? { Authorization: `Bearer ${key}` } : {},
            redirect: "error",
          });
          if (!response.ok) continue;
          const links = (await response.json()) as NonNullable<ReturnType<typeof calendarLinks>>;
          if (!cancelled)
            setCalendarAccess({ revision, id, requestedAdmin: admin, links, adminKey: key });
          return;
        } catch {
          /* Public participants never receive a login prompt. */
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, admin, poll?.revision, poll?.status]);
  async function downloadCalendar() {
    if (!calendarAccess) return;
    setCalendarPending(true);
    setError("");
    try {
      const response = await fetch(calendarAccess.links.ics, {
        headers: calendarAccess.adminKey
          ? { Authorization: `Bearer ${calendarAccess.adminKey}` }
          : {},
        redirect: "error",
      });
      if (!response.ok)
        throw new Error("カレンダーを取得できませんでした。管理者として再読み込みしてください。");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `awaseru-${id}.ics`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCalendarPending(false);
    }
  }
  const request = useRef<{ editKey: string; idempotencyKey: string } | null>(null);
  const snapshot = useRef<unknown>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(armTimer.current), []);
  // Bring the answer confirmation (and the edit link under it) into view where the submit was pressed.
  useEffect(() => {
    if (success)
      successRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
  }, [success]);
  useEffect(() => {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const a = fragment.get("admin") || readKey(`awaseru-admin-${id}`) || "";
    if (a) saveKey(`awaseru-admin-${id}`, a);
    setAdmin(a);
    const edit = fragment.get("edit"),
      rid = fragment.get("response");
    if (edit && rid) saveKey(`awaseru-edit-${id}-${rid}`, edit);
    setOrigin(location.origin);
    api<PublicPoll>(`/api/polls/${id}`)
      .then((p) => {
        setPoll(p);
        setAnswers(p.slots.map(() => ""));
        if (edit && rid) {
          const r = p.responses.find((v) => v.id === rid);
          if (r) {
            setEditing({ id: rid, key: edit, revision: r.revision });
            setName(r.name);
            setComment(r.comment);
            setAnswers(r.answers);
          }
        }
      })
      .catch((e) => setError(e.message));
  }, [id]);
  async function reload() {
    try {
      setPoll(await api<PublicPoll>(`/api/polls/${id}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function submit(e: React.SubmitEvent) {
    e.preventDefault();
    if (!poll) return;
    setError("");
    setSuccess("");
    if (answers.some((v) => !v)) {
      setError("すべての候補で、○・△・×を選んでください。");
      return;
    }
    setPending(true);
    try {
      const body = { name, comment, answers, pollRevision: poll.revision };
      if (editing) {
        setPoll(
          await api<PublicPoll>(
            `/api/polls/${id}/responses/${editing.id}`,
            "PATCH",
            { ...body, revision: editing.revision },
            editing.key,
          ),
        );
        setEditing({ ...editing, revision: editing.revision + 1 });
        setSuccess("回答を更新しました。");
      } else {
        if (!request.current)
          request.current = { editKey: secret(), idempotencyKey: crypto.randomUUID() };
        if (!snapshot.current) snapshot.current = { ...body, ...request.current };
        const r = await api<{ poll: PublicPoll; responseId: string }>(
          `/api/polls/${id}/responses`,
          "POST",
          snapshot.current,
        );
        setPoll(r.poll);
        saveKey(`awaseru-edit-${id}-${r.responseId}`, request.current.editKey);
        const saved = r.poll.responses.find((v) => v.id === r.responseId)!;
        setName(saved.name);
        setComment(saved.comment);
        setAnswers(saved.answers);
        snapshot.current = null;
        setEditing({ id: r.responseId, key: request.current.editKey, revision: saved.revision });
        location.hash = `response=${r.responseId}&edit=${request.current.editKey}`;
        setSuccess("回答しました。");
      }
    } catch (e) {
      if (
        (e as { status?: number; code?: string }).status === 422 ||
        (e as { code?: string }).code === "state_changed"
      ) {
        snapshot.current = null;
        request.current = null;
      }
      setError(
        (e as Error).message +
          (snapshot.current ? " 再度押すと、前回の送信内容で保存結果を確認します。" : ""),
      );
    } finally {
      setPending(false);
    }
  }
  async function state(status: string) {
    if (!poll) return;
    setPending(true);
    setAdminError("");
    setAdminMessage("");
    try {
      setPoll(
        await api<PublicPoll>(
          `/api/polls/${id}/state`,
          "PATCH",
          {
            status,
            revision: poll.revision,
            ...(status === "finalized" ? { selectedSlot: selected } : {}),
          },
          admin,
        ),
      );
      setAdminMessage(
        status === "open"
          ? "回答の受付を再開しました。"
          : status === "closed"
            ? "回答の受付を締め切りました。"
            : "日程を確定しました。",
      );
    } catch (e) {
      setAdminError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  /** Irreversible-feeling actions run on a second press within 4 seconds; otherwise they disarm. */
  function confirmThen(action: "finalized" | "closed") {
    clearTimeout(armTimer.current);
    if (armed === action) {
      setArmed(null);
      void state(action);
      return;
    }
    setArmed(action);
    armTimer.current = setTimeout(() => setArmed(null), 4000);
  }
  if (!poll)
    return (
      <main className="poll-page">
        <h1>{error ? "日程調整を開けませんでした" : "読み込んでいます…"}</h1>
        <Notice error={error} />
        {error && (
          <button type="button" className="secondary" onClick={() => location.reload()}>
            再読み込み
          </button>
        )}
      </main>
    );
  const calendar =
    calendarAccess?.revision === poll.revision &&
    calendarAccess.id === id &&
    calendarAccess.requestedAdmin === admin
      ? calendarAccess.links
      : null;
  const share = `${origin}/p/${id}`,
    best = Math.max(
      0,
      ...poll.slots.map((_, i) => poll.responses.filter((r) => r.answers[i] === "yes").length),
    );
  return (
    <main className="poll-page">
      <div className="poll-title">
        <div>
          <span className={`status ${poll.status}`}>
            {poll.status === "open"
              ? "回答受付中"
              : poll.status === "closed"
                ? "受付締切"
                : "日程確定"}
          </span>
          <h1>{poll.title}</h1>
          {poll.description && <p className="description">{poll.description}</p>}
        </div>
        <div className="poll-actions">
          {poll.status === "open" && (
            <a className="primary answer-jump" href="#answer-heading">
              回答する
            </a>
          )}
          <button type="button" className="text-button" onClick={reload}>
            最新の回答を確認
          </button>
        </div>
      </div>
      {poll.status === "finalized" && poll.selectedSlot && (
        <div className="final-date">
          <span>日程確定</span>
          <strong>
            {dateLabel(poll.selectedSlot, poll.slotEnds?.[poll.slots.indexOf(poll.selectedSlot)])}
          </strong>
          {calendar && (
            <details className="calendar-add">
              <summary className="secondary">カレンダーに追加</summary>
              <ul className="calendar-providers">
                {calendar.providers.map((provider) => (
                  <li key={provider.label}>
                    <a href={provider.href} target="_blank" rel="noopener noreferrer">
                      {provider.label}
                    </a>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className="text-button"
                    disabled={calendarPending}
                    onClick={downloadCalendar}
                  >
                    {calendarPending ? "取得中…" : "Apple カレンダー・その他（.ics）"}
                  </button>
                </li>
              </ul>
            </details>
          )}
        </div>
      )}
      <section className="share-section">
        <h2>参加リンク</h2>
        <Copy value={share} label="参加URL" />
        {admin && (
          <details>
            <summary>管理リンク（主催者専用）</summary>
            <Copy value={`${share}#admin=${admin}`} label="管理URL" />
          </details>
        )}
      </section>
      <section className="results">
        <div className="section-heading">
          <h2>
            みんなの回答 <span className="count">{poll.responses.length}人</span>
          </h2>
        </div>
        <div
          className="table-scroll"
          role="region"
          aria-label="候補日時ごとの回答一覧"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">参加者</th>
                {poll.slots.map((s) => (
                  <th key={s} scope="col">
                    {dateLabel(s, poll.slotEnds?.[poll.slots.indexOf(s)])}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="totals">
                <th scope="row">参加できる</th>
                {poll.slots.map((s, i) => {
                  const yes = poll.responses.filter((r) => r.answers[i] === "yes").length;
                  return (
                    <td key={s}>
                      <strong>{yes}</strong>
                      <small>人</small>
                      {yes > 0 && yes === best && <span className="best">最多</span>}
                      <div className="sub-count">
                        △ {poll.responses.filter((r) => r.answers[i] === "maybe").length}　×{" "}
                        {poll.responses.filter((r) => r.answers[i] === "no").length}
                      </div>
                    </td>
                  );
                })}
              </tr>
              {poll.responses.map((r) => {
                // Only rows this browser holds an edit key for offer editing.
                const key = readKey(`awaseru-edit-${id}-${r.id}`);
                return (
                  <tr key={r.id}>
                    <th scope="row">
                      <span>{r.name}</span>
                      {r.comment && <small className="comment">{r.comment}</small>}
                      {key && (
                        <button
                          type="button"
                          className="edit-link"
                          onClick={() => {
                            setEditing({ id: r.id, key, revision: r.revision });
                            setName(r.name);
                            setComment(r.comment);
                            setAnswers(r.answers);
                            setSuccess("");
                            document
                              .getElementById("answer-heading")
                              ?.scrollIntoView({ behavior: scrollBehavior() });
                          }}
                        >
                          回答を編集
                        </button>
                      )}
                    </th>
                    {r.answers.map((a, i) => (
                      <td className={`answer ${a}`} key={i}>
                        <AnswerMark value={a} />
                        <span className="visually-hidden">
                          {answerNames[a as keyof typeof answerNames]}
                        </span>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <Notice error={error} />
      <div className={admin ? "bottom-grid" : "bottom-grid solo"}>
        <section className="answer-form" aria-labelledby="answer-heading">
          <h2 id="answer-heading">{editing ? "回答を編集" : "回答する"}</h2>
          {poll.status !== "open" ? (
            <span className={`status ${poll.status}`}>
              {poll.status === "closed" ? "受付締切" : "日程確定"}
            </span>
          ) : (
            <form onSubmit={submit}>
              {editing &&
                poll.responses.find((r) => r.id === editing.id)?.revision !== editing.revision && (
                  <div className="notice">
                    <p>
                      この回答は別の画面で更新されています。入力内容は保持しています。現在の回答を一覧で確認してから、この入力で更新するか選んでください。
                    </p>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        const current = poll.responses.find((r) => r.id === editing.id);
                        if (current) {
                          setEditing({ ...editing, revision: current.revision });
                          setSuccess(
                            "最新の回答を確認しました。次に「回答を更新する」を押すと、保持している入力内容で上書きします。",
                          );
                        }
                      }}
                    >
                      現在の回答を確認し、この入力で更新を続ける
                    </button>
                  </div>
                )}

              <label className="field">
                お名前
                <input
                  required
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <fieldset className="answer-options">
                <legend>
                  候補日時 <span className="field-unit">日本時間</span>
                </legend>
                <div className="answer-columns" aria-hidden="true">
                  <span>参加</span>
                  <span>調整</span>
                  <span>不可</span>
                </div>
                {poll.slots.map((s, i) => (
                  <div className="answer-option-row" key={s}>
                    <span id={`answer-${i}`}>
                      {dateLabel(s, poll.slotEnds?.[poll.slots.indexOf(s)])}
                    </span>
                    <div className="choices" role="group" aria-labelledby={`answer-${i}`}>
                      {Object.keys(marks).map((v) => (
                        <button
                          type="button"
                          key={v}
                          aria-label={`${dateLabel(s, poll.slotEnds?.[poll.slots.indexOf(s)])} ${answerNames[v as keyof typeof answerNames]}`}
                          aria-pressed={answers[i] === v}
                          className={answers[i] === v ? "chosen" : ""}
                          onClick={() => setAnswers(answers.map((old, j) => (i === j ? v : old)))}
                        >
                          <AnswerMark value={v} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </fieldset>
              <details className="optional-field">
                <summary>{comment ? "コメントを編集" : "コメントを追加"}</summary>
                <label className="field">
                  <span className="visually-hidden">コメント</span>
                  <textarea
                    maxLength={200}
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </label>
              </details>
              <Visibility />
              <button className="primary full" disabled={pending}>
                {pending ? "保存しています…" : editing ? "回答を更新する" : "回答を送信する"}
              </button>
              <p
                ref={successRef}
                className={success ? "answer-feedback notice success" : "answer-feedback"}
                role="status"
              >
                {success}
              </p>
              {editing && (
                <section className="edit-share" aria-labelledby="edit-share-heading">
                  <h3 id="edit-share-heading">回答編集リンク（本人用）</h3>
                  <Copy
                    value={`${share}#response=${editing.id}&edit=${editing.key}`}
                    label="回答編集URL"
                  />
                </section>
              )}
            </form>
          )}
        </section>
        {admin && (
          <aside className="admin-panel">
            <h2>主催者の操作</h2>
            <label className="field">
              確定する日時
              <select
                value={selected}
                disabled={pending}
                onChange={(e) => {
                  clearTimeout(armTimer.current);
                  setArmed(null);
                  setSelected(e.target.value);
                }}
              >
                <option value="">候補から選択</option>
                {poll.slots.map((s) => (
                  <option key={s} value={s}>
                    {dateLabel(s, poll.slotEnds?.[poll.slots.indexOf(s)])}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="primary full"
              disabled={pending || !selected}
              onClick={() => confirmThen("finalized")}
            >
              {armed === "finalized" && selected
                ? `${dateLabel(selected, poll.slotEnds?.[poll.slots.indexOf(selected)])}で確定する`
                : "日程を確定"}
            </button>
            {poll.status === "open" ? (
              <button
                type="button"
                className="secondary full"
                disabled={pending}
                onClick={() => confirmThen("closed")}
              >
                {armed === "closed" ? `「${poll.title}」を締め切る` : "締切"}
              </button>
            ) : (
              <button
                type="button"
                className="secondary full"
                disabled={pending}
                onClick={() => state("open")}
              >
                受付再開
              </button>
            )}
            <p className="visually-hidden" role="status">
              {armed ? "4秒以内にもう一度押すと実行します。" : ""}
            </p>
            <p className="admin-feedback notice" role="status">
              {adminMessage}
            </p>
            <Notice error={adminError} />
          </aside>
        )}
      </div>
    </main>
  );
}
function scrollBehavior(): ScrollBehavior {
  return matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
