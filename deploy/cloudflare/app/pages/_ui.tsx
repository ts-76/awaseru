import { useEffect, useRef, useState, type ReactNode } from "react";
export const marks = { yes: "○", maybe: "△", no: "×" };
export const answerNames = { yes: "参加できる", maybe: "調整できる", no: "参加できない" };
/** Drawn ○△× so the marks keep one weight and size whatever Japanese face the OS picks. */
export function AnswerMark({ value, size = 22 }: { value: string; size?: number }) {
  return (
    <svg
      className="answer-mark"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {value === "yes" && <circle cx="12" cy="12" r="8" />}
      {value === "maybe" && <path d="M12 4.5 20 18.5H4z" />}
      {value === "no" && <path d="m6 6 12 12M18 6 6 18" />}
    </svg>
  );
}
function BrandMark() {
  return (
    <>
      <span className="brand-icon" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="22" height="22" fill="none">
          <rect x="4" y="6" width="24" height="22" rx="6" stroke="currentColor" strokeWidth="2.4" />
          <path
            d="M10 3v7m12-7v7M4 14h24m-17 7 3 3 7-7"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      awaseru
    </>
  );
}
/**
 * The single site header. Public pages pass nothing (brand as plain text, no navigation);
 * the Access-protected admin layout passes the brand link and its navigation.
 */
export function SiteHeader({ brandHref, children }: { brandHref?: string; children?: ReactNode }) {
  return (
    <header className="site-header">
      {brandHref ? (
        <a href={brandHref} className="brand" aria-label="awaseru 一覧へ">
          <BrandMark />
        </a>
      ) : (
        <span className="brand">
          <BrandMark />
        </span>
      )}
      {children}
    </header>
  );
}
export function secret() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}
export function dateLabel(v: string, end?: string) {
  return (
    new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(v)) + (end ? "〜" + end.slice(11, 16) : "")
  );
}
export function saveKey(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Fragment URL remains the source of access. */
  }
}
export function readKey(key: string) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
): Promise<T> {
  const isCreate = path === "/api/create" || path.startsWith("/api/create/");
  const communicationError = (status?: number) =>
    Object.assign(
      new Error(
        isCreate
          ? "認証または通信を確認できません。別のタブでログインしてから再送してください。"
          : "通信を確認できません。入力を保持して、もう一度お試しください。",
      ),
      { status, code: isCreate ? "auth_or_network" : "network_error" },
    );
  let r: Response;
  try {
    r = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw communicationError();
  }
  let value: T & { error?: string; code?: string };
  try {
    value = await r.json();
  } catch {
    throw communicationError(r.status);
  }
  if (!r.ok)
    throw Object.assign(new Error(value.error || "操作に失敗しました。もう一度お試しください。"), {
      status: r.status,
      code: value.code,
    });
  return value;
}
export function Copy({ value, label }: { value: string; label: string }) {
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="copy-row">
      <input aria-label={label} value={value} readOnly onFocus={(e) => e.target.select()} />
      <button
        type="button"
        className={copied ? "secondary copied" : "secondary"}
        aria-label={`${label}をコピー`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setMessage("コピーしました");
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              setCopied(false);
              setMessage("");
            }, 1800);
          } catch {
            setCopied(false);
            setMessage("URLを選択してコピーしてください");
          }
        }}
      >
        {copied ? (
          <>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
              <path
                d="m3.5 8.5 3 3 6-7"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            コピー済み
          </>
        ) : (
          "コピー"
        )}
      </button>
      <span className={copied ? "hint visually-hidden" : "hint"} role="status">
        {message}
      </span>
    </div>
  );
}
export function Notice({ error }: { error: string }) {
  return error ? (
    <p className="notice error" role="alert">
      {error}
    </p>
  ) : null;
}

export function Visibility() {
  return (
    <dl className="visibility">
      <div>
        <dt>回答の公開範囲</dt>
        <dd>リンクを知っている人</dd>
      </div>
      <div>
        <dt>公開される情報</dt>
        <dd>説明・名前・回答・コメント</dd>
      </div>
    </dl>
  );
}
