import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { MemoryPage } from "@/components/memory/MemoryPage";
import { isPortalAuthed } from "@/lib/auth";
import { getMemory } from "@/lib/eidos-api";

export default async function MemoryRoute() {
  if (!(await isPortalAuthed())) {
    redirect("/login");
  }

  const memory = await getMemory();

  return (
    <AppShell>
      <MemoryPage initialMemory={memory} />
    </AppShell>
  );
}
