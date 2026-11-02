import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Notice } from "./_ui";
import { MAX_SLOTS } from "../server/limits";
export type Candidate = { start: string; end: string };
/** Today's date in Japan (UTC+9, no DST) as YYYY-MM-DD. */
export function jstToday(now = Date.now()) {
  return new Date(now + 9 * 3600000).toISOString().slice(0, 10);
}
export function monthDays(month: string) {
  const [year, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const offset = new Date(Date.UTC(year, m - 1, 1)).getUTCDay();
  return [
    ...Array(offset).fill(null),
    ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ] as (string | null)[];
}
export function addCandidates(value: Candidate[], dates: string[], start: string, end: string) {
  if (
    !dates.length ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start) ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(end) ||
    end <= start
  )
    throw new Error("日付と開始・終了時刻を確認してください。");
  if (
    dates.some((date) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return true;
      const parsed = new Date(date + "T00:00:00Z");
      return !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date;
    })
  )
    throw new Error("日付を確認してください。");
  const added = [...new Set(dates)]
    .sort()
    .map((date) => ({ start: `${date}T${start}`, end: `${date}T${end}` }))
    .filter((v) => !value.some((p) => p.start === v.start));
  if (value.length + added.length > MAX_SLOTS)
    throw new Error(`候補は${MAX_SLOTS}件までです。選択する日付を減らしてください。`);
  return { items: [...value, ...added], count: added.length };
}
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
/** "2026-11-03" → "11月3日(火)" */
export function dayLabel(date: string) {
  const weekday = new Date(date + "T00:00:00Z").getUTCDay();
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日(${WEEKDAYS[weekday]})`;
}
/** Change one candidate's times on its own date; keeps every candidate's start unique. */
export function updateCandidate(value: Candidate[], index: number, start: string, end: string) {
  const current = value[index];
  if (!current) throw new Error("候補が見つかりません。");
  if (!TIME.test(start) || !TIME.test(end)) throw new Error("開始・終了の時刻を入力してください。");
  if (end <= start) throw new Error("終了は開始より後の時刻にしてください。");
  const date = current.start.slice(0, 10);
  const next = { start: `${date}T${start}`, end: `${date}T${end}` };
  if (value.some((p, j) => j !== index && p.start === next.start))
    throw new Error("同じ開始日時の候補がすでにあります。");
  return value.map((p, j) => (j === index ? next : p));
}
/** Candidates grouped by date, each list in start order, with their index in `value`. */
export function candidatesByDate(value: Candidate[]) {
  const days = new Map<string, { index: number; start: string; end: string }[]>();
  value.forEach((v, index) => {
    const date = v.start.slice(0, 10);
    const list = days.get(date) ?? [];
    list.push({ index, start: v.start.slice(11, 16), end: v.end.slice(11, 16) });
    days.set(date, list);
  });
  for (const list of days.values()) list.sort((a, b) => a.start.localeCompare(b.start));
  return days;
}
/** Months other than the shown one that hold candidates, in calendar order. */
export function otherMonths(value: Candidate[], month: string) {
  const counts = new Map<string, number>();
  for (const v of value) {
    const m = v.start.slice(0, 7);
    if (m !== month) counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, count]) => ({ month: m, count }));
}
export function CandidatePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Candidate[];
  onChange: (v: Candidate[]) => void;
  disabled?: boolean;
}) {
  const today = jstToday();
  const [month, setMonth] = useState(today.slice(0, 7)),
    [dates, setDates] = useState<string[]>([]),
    [start, setStart] = useState("19:00"),
    [end, setEnd] = useState("21:00"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [editing, setEditing] = useState<number | null>(null),
    [editStart, setEditStart] = useState(""),
    [editEnd, setEditEnd] = useState(""),
    [editError, setEditError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  // The dialog renders into <body>: the picker sits inside the create <form>, and a nested form
  // would let Enter in the time fields submit the whole event.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const returnFocus = useRef<HTMLElement | null>(null);
  const byDate = candidatesByDate(value);
  const elsewhere = otherMonths(value, month);
  useEffect(() => {
    if (editing === null) return;
    if (!dialog.current?.open) dialog.current?.showModal();
  }, [editing]);
  function openEditor(index: number, trigger: HTMLElement) {
    const v = value[index];
    returnFocus.current = trigger;
    setEditStart(v.start.slice(11, 16));
    setEditEnd(v.end.slice(11, 16));
    setEditError("");
    setEditing(index);
  }
  function closeEditor(removedFrom?: string) {
    if (dialog.current?.open) dialog.current.close();
    setEditing(null);
    const target = returnFocus.current;
    // Safari never focuses a clicked button, so focus is put back explicitly. A deleted chip is
    // gone after the re-render, so focus lands on that day's date instead.
    if (!removedFrom && target?.isConnected) target.focus();
    else
      setTimeout(() => {
        const day = removedFrom
          ? document.querySelector<HTMLElement>(
              `.candidate-picker .calendar-date[aria-label="${dayLabel(removedFrom)}"]`,
            )
          : null;
        (
          day ?? document.querySelector<HTMLElement>(".candidate-picker .calendar-heading h2")
        )?.focus();
      });
  }
  function move(delta: number) {
    const [y, m] = month.split("-").map(Number);
    setMonth(new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7));
  }
  return (
    <fieldset className="candidate-picker" disabled={disabled}>
      <legend>
        候補日時 <span className="field-unit">日本時間</span>
        <span className="field-count">
          {value.length} / {MAX_SLOTS}
        </span>
      </legend>
      <div className="calendar-heading">
        <button
          type="button"
          aria-label="前の月"
          className="calendar-move"
          onClick={() => move(-1)}
        >
          <Chevron back />
        </button>
        <h2 tabIndex={-1}>
          {Number(month.slice(0, 4))}年{Number(month.slice(5))}月
        </h2>
        <button type="button" aria-label="次の月" className="calendar-move" onClick={() => move(1)}>
          <Chevron />
        </button>
      </div>
      <div className="calendar-grid">
        <div className="calendar-week">
          {["日", "月", "火", "水", "木", "金", "土"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="calendar-days">
          {monthDays(month).map((date, i) =>
            date ? (
              <div className="calendar-day" key={date}>
                <button
                  type="button"
                  className={dates.includes(date) ? "calendar-date selected" : "calendar-date"}
                  aria-label={dayLabel(date)}
                  aria-pressed={dates.includes(date)}
                  aria-current={date === today ? "date" : undefined}
                  onClick={() => {
                    setDates(
                      dates.includes(date) ? dates.filter((d) => d !== date) : [...dates, date],
                    );
                    setMessage("");
                  }}
                >
                  {Number(date.slice(-2))}
                </button>
                {byDate.get(date)?.map((c) => (
                  <button
                    type="button"
                    className="time-chip"
                    key={c.start}
                    aria-label={`${dayLabel(date)} ${c.start}〜${c.end} の候補を変更`}
                    onClick={(e) => openEditor(c.index, e.currentTarget)}
                  >
                    {c.start}
                    <span className="time-chip-end">–{c.end}</span>
                  </button>
                ))}
              </div>
            ) : (
              <span key={`blank-${i}`} />
            ),
          )}
        </div>
      </div>
      {!!elsewhere.length && (
        <div className="calendar-elsewhere">
          <span>ほかの月の候補</span>
          {elsewhere.map((m) => (
            <button
              type="button"
              className="text-button"
              key={m.month}
              onClick={() => setMonth(m.month)}
            >
              {Number(m.month.slice(5))}月 {m.count}件
            </button>
          ))}
        </div>
      )}
      <div className="calendar-times">
        <label>
          開始
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <span aria-hidden="true">〜</span>
        <label>
          終了
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <button
        type="button"
        className="secondary full"
        disabled={!dates.length || disabled}
        onClick={() => {
          setError("");
          setMessage("");
          try {
            const result = addCandidates(value, dates, start, end);
            onChange(result.items);
            setMessage(
              `${result.count}件追加しました。${dates.length > result.count ? `重複${dates.length - result.count}件を除きました。` : ""}`,
            );
            setDates([]);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {dates.length ? `選択した${dates.length}日に候補を追加` : "日付を選択"}
      </button>
      <Notice error={error} />
      <div className="candidate-feedback" role="status">
        {message}
      </div>
      {mounted &&
        createPortal(
          <dialog
            ref={dialog}
            className="time-dialog"
            aria-labelledby="time-dialog-heading"
            onCancel={(e) => {
              e.preventDefault();
              closeEditor();
            }}
          >
            {editing !== null && value[editing] && (
              <form
                method="dialog"
                onSubmit={(e) => {
                  e.preventDefault();
                  // React bubbles portal events through the component tree; keep it from the create form.
                  e.stopPropagation();
                  try {
                    onChange(updateCandidate(value, editing, editStart, editEnd));
                    setMessage("候補の時刻を変更しました。");
                    closeEditor();
                  } catch (err) {
                    setEditError((err as Error).message);
                  }
                }}
              >
                <h2 id="time-dialog-heading">
                  {dayLabel(value[editing].start.slice(0, 10))}の候補
                </h2>
                <div className="calendar-times">
                  <label>
                    開始
                    <input
                      type="time"
                      required
                      value={editStart}
                      onChange={(e) => {
                        setEditStart(e.target.value);
                        setEditError("");
                      }}
                    />
                  </label>
                  <span aria-hidden="true">〜</span>
                  <label>
                    終了
                    <input
                      type="time"
                      required
                      value={editEnd}
                      onChange={(e) => {
                        setEditEnd(e.target.value);
                        setEditError("");
                      }}
                    />
                  </label>
                </div>
                <Notice error={editError} />
                <div className="dialog-actions time-dialog-actions">
                  <button
                    type="button"
                    className="text-button danger-text"
                    onClick={() => {
                      const date = value[editing].start.slice(0, 10);
                      onChange(value.filter((_, j) => j !== editing));
                      setMessage("候補を削除しました。");
                      closeEditor(date);
                    }}
                  >
                    この候補を削除
                  </button>
                  <button type="button" className="secondary" onClick={() => closeEditor()}>
                    キャンセル
                  </button>
                  <button type="submit" className="primary">
                    保存
                  </button>
                </div>
              </form>
            )}
          </dialog>,
          document.body,
        )}
    </fieldset>
  );
}
function Chevron({ back = false }: { back?: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={back ? { transform: "rotate(180deg)" } : undefined}
    >
      <path
        d="m9 5 7 7-7 7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
