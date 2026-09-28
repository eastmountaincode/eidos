import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { isPortalAuthed } from "@/lib/auth";
import { EidosShell } from "@/components/v2/EidosShell";
import "./workspace.css";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  if (!(await isPortalAuthed())) redirect("/login");

  return <EidosShell>{children}</EidosShell>;
}
