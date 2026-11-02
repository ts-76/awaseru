import { useEffect, useState } from "react";
const links = [
  ["/create/polls", "一覧"],
  ["/create", "新規作成"],
  ["/create/connect", "MCP接続"],
] as const;
export default function AdminNav() {
  const [path, setPath] = useState("");
  useEffect(() => setPath(location.pathname.replace(/\/+$/, "") || "/"), []);
  return (
    <nav aria-label="メイン">
      {links.map(([href, label]) => (
        <a key={href} href={href} aria-current={path === href ? "page" : undefined}>
          {label}
        </a>
      ))}
    </nav>
  );
}
