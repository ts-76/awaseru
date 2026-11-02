import { CandidatePicker, type Candidate } from "./_candidate-picker";
import { useRef, useState } from "react";
import type { PublicPoll } from "../server/service";
import { api, secret, Notice, saveKey, Visibility } from "./_ui";
export const layout = "admin";
export default function Home() {
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [slots, setSlots] = useState<Candidate[]>([]),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const request = useRef<{ adminKey: string; idempotencyKey: string } | null>(null);
  const snapshot = useRef<unknown>(null);
  async function create(e: React.SubmitEvent) {
    e.preventDefault();
    setError("");
    setNeedsLogin(false);
    const values = slots;
    if (!values.length) {
      setError("候補日時を1つ以上入力してください。");
      return;
    }
    if (
      values.some(
        (v) =>
          !v.start || !v.end || v.end <= v.start || v.end.slice(0, 10) !== v.start.slice(0, 10),
      )
    ) {
      setError("終了日時は同じ日の開始日時より後にしてください。");
      return;
    }
    if (!request.current)
      request.current = { adminKey: secret(), idempotencyKey: crypto.randomUUID() };
    setPending(true);
    try {
      if (!snapshot.current)
        snapshot.current = {
          title,
          description,
          slots: values.map((v) => v.start + ":00+09:00"),
          slotEnds: values.map((v) => v.end + ":00+09:00"),
          ...request.current,
        };
      const p = await api<PublicPoll>("/api/create", "POST", snapshot.current);
      saveKey(`awaseru-admin-${p.id}`, request.current.adminKey);
      location.href = `/p/${p.id}#admin=${request.current.adminKey}`;
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401 || status === 403 || (e as { code?: string }).code === "auth_or_network")
        setNeedsLogin(true);
      if ((e as { status?: number }).status === 422) {
        snapshot.current = null;
        request.current = null;
      }
      setError(
        (e instanceof Error ? e.message : "作成に失敗しました。") +
          (snapshot.current ? " 再度押すと、前回と同じ送信内容で作成結果を確認します。" : ""),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="create-page">
      <section className="create-form" aria-labelledby="create-heading">
        <h1 id="create-heading">日程調整をつくる</h1>
        <form onSubmit={create}>
          <label className="field">
            イベント名
            <input
              required
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <details className="optional-field">
            <summary>ひとこと・場所を追加</summary>
            <label className="field">
              <span className="visually-hidden">ひとこと・場所</span>
              <textarea
                maxLength={1000}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </details>
          <CandidatePicker value={slots} onChange={setSlots} disabled={pending} />
          <Visibility />
          <Notice error={error} />
          {needsLogin && (
            <a href="/create" target="_blank" rel="noopener noreferrer">
              別のタブでログイン
            </a>
          )}
          <button className="primary full" disabled={pending}>
            {pending ? "作成しています…" : "日程調整をつくる"}
          </button>
        </form>
      </section>
    </main>
  );
}
