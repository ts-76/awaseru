import type { ReactNode } from "react";
import { PublicHeader } from "./_public-header";
import "./style.css";
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <PublicHeader />
      {children}
    </>
  );
}
