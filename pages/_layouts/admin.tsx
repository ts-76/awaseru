import type { ReactNode } from "react";
import { SiteHeader } from "../_ui";
import AdminNav from "../_admin-nav";
import "../style.css";
/** Named layout used only by Access-protected pages under /create (export const layout = "admin"). */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader brandHref="/create/polls">
        <AdminNav />
      </SiteHeader>
      {children}
    </>
  );
}
