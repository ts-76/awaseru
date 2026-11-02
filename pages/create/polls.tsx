import { useEffect, useRef, useState } from "react";
import type { OwnedPoll, OwnedPollPage } from "../../server/service";
import { api, dateLabel, Notice } from "../_ui";
export const layout = "admin";
const labels: Record<string, string> = {
  open: "回答受付中",
  closed: "締切",
  finalized: "日程確定",
};
export default function MyPolls() {
  const [items, setItems] = useState<OwnedPoll[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const [link, setLink] = useState(""),
    [claiming, setClaiming] = useState(false),
    [claimError, setClaimError] = useState(""),
    [success, setSuccess] = useState("");
  const [deleting, setDeleting] = useState<OwnedPoll | null>(null),
    [deletePending, setDeletePending] = useState(false),
    [deleteError, setDeleteError] = useState("");
  const deleteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (deleting) deleteDialog.current?.showModal();
  }, [deleting]);
  async function remove() {
    if (!deleting || deletePending) return;
    setDeletePending(true);
    setDeleteError("");
    try {
      await api(`/api/create/polls/${deleting.id}`, "DELETE", { revision: deleting.revision });
      setItems((previous) => previous.filter((p) => p.id !== deleting.id));
      deleteDialog.current?.close();
      setDeleting(null);
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeletePending(false);
    }
  }
  const busy = useRef(false);
  const retryCursor = useRef<string | undefined>(undefined);
  async function load(after?: string) {
    if (busy.current) return;
    busy.current = true;
    retryCursor.current = after;
    setLoading(true);
    setError("");
    try {
      const page = await api<OwnedPollPage>(
        `/api/create/polls${after ? `?cursor=${encodeURIComponent(after)}` : ""}`,
      );
      setItems((previous) =>
        after
          ? [...previous, ...page.items.filter((v) => !previous.some((p) => p.id === v.id))]
          : page.items,
      );
      setCursor(page.nextCursor);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "一覧を取得できません。もう一度お試しください。");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function claim(e: React.SubmitEvent) {
    e.preventDefault();
    if (busy.current || claiming) return;
    setClaimError("");
    setSuccess("");
    let body: { id: string; adminKey: string };
    try {
      const url = new URL(link.trim());
      const match = /^\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
        url.pathname,
      );
      const fragment = new URLSearchParams(url.hash.slice(1));
      const adminKey = fragment.get("admin") || "";
      if (
        url.origin !== location.origin ||
        url.username ||
        url.password ||
        url.search ||
        !match ||
        fragment.size !== 1 ||
        !/^[A-Za-z0-9_-]{43}$/.test(adminKey)
      )
        throw new Error();
      body = { id: match[1], adminKey };
    } catch {
      setClaimError("このサイトの管理リンクを入力してください。");
      return;
    }
    setClaiming(true);
    try {
      await api("/api/create/polls/claim", "POST", body);
      setLink("");
      setSuccess("一覧に追加しました。");
      await load();
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : "追加できません。もう一度お試しください。");
    } finally {
      setClaiming(false);
    }
  }
  return (
    <main className="my-polls-page">
      <div className="my-polls-heading">
        <h1>作成した日程調整</h1>
        <a className="primary" href="/create">
          新規作成
        </a>
      </div>
      <Notice error={error} />
      {error && (
        <div className="list-recovery">
          <button
            className="secondary"
            disabled={loading || claiming}
            onClick={() => void load(retryCursor.current)}
          >
            再読込
          </button>
          <a href="/create/polls" target="_blank" rel="noreferrer">
            ログイン
          </a>
        </div>
      )}
      {loaded && !items.length && <div className="list-empty">日程調整はまだありません</div>}
      {!!items.length && (
        <ul className="owned-polls">
          {items.map((p) => (
            <li key={p.id} className="owned-poll-row">
              <a className="owned-poll" href={`/p/${p.id}`}>
                <div className="owned-poll-main">
                  <h2>{p.title}</h2>
                  <span className={`status ${p.status}`}>{labels[p.status] || p.status}</span>
                </div>
                <dl>
                  <div>
                    <dt>回答</dt>
                    <dd>
                      {p.responseCount}
                      <span>人</span>
                    </dd>
                  </div>
                  <div>
                    <dt>確定日時</dt>
                    <dd>{p.selectedSlot ? dateLabel(p.selectedSlot, p.selectedSlotEnd) : "—"}</dd>
                  </div>
                </dl>
                <svg
                  className="owned-poll-arrow"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="m9 5 7 7-7 7"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
              <button
                type="button"
                className="delete-poll"
                aria-label={`${p.title}を削除`}
                disabled={loading || claiming}
                onClick={() => {
                  setDeleteError("");
                  setDeleting(p);
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      {loading && (
        <div className="list-loading" role="status">
          読み込み中…
        </div>
      )}
      {cursor && !error && (
        <button
          className="secondary list-more"
          disabled={loading || claiming}
          onClick={() => void load(cursor)}
        >
          さらに表示
        </button>
      )}
      <dialog
        ref={deleteDialog}
        className="delete-dialog"
        aria-labelledby="delete-dialog-heading"
        onCancel={(e) => {
          if (deletePending) e.preventDefault();
          else setDeleting(null);
        }}
      >
        <h2 id="delete-dialog-heading">日程調整を削除</h2>
        <p className="delete-title">{deleting?.title}</p>
        <p>共有URLからの閲覧・回答もできなくなります。</p>
        <Notice error={deleteError} />
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary"
            disabled={deletePending}
            onClick={() => {
              deleteDialog.current?.close();
              setDeleting(null);
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={deletePending}
            onClick={() => void remove()}
          >
            {deletePending ? "削除中…" : "削除する"}
          </button>
        </div>
        {deleteError && (
          <button
            type="button"
            className="text-button"
            disabled={deletePending}
            onClick={() => {
              deleteDialog.current?.close();
              setDeleting(null);
              void load();
            }}
          >
            最新の一覧を確認
          </button>
        )}
      </dialog>
      <details className="claim-poll">
        <summary>管理リンクから追加</summary>
        <form onSubmit={claim}>
          <label className="field">
            管理リンク
            <input
              type="url"
              required
              maxLength={2048}
              autoComplete="off"
              spellCheck={false}
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </label>
          <Notice error={claimError} />
          <button className="secondary" disabled={claiming || loading}>
            {claiming ? "追加中…" : "一覧に追加"}
          </button>
          {success && (
            <div className="notice success" role="status">
              {success}
            </div>
          )}
        </form>
      </details>
    </main>
  );
}
