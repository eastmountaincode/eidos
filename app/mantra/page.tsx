import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { MantraPage } from "@/components/mantra/MantraPage";
import { isPortalAuthed } from "@/lib/auth";
import { getMantra } from "@/lib/eidos-api";

export default async function MantraRoute() {
  if (!(await isPortalAuthed())) {
    redirect("/login");
  }

  const data = await getMantra();

  return (
    <AppShell>
      <MantraPage initialMantra={data.mantra} />
    </AppShell>
  );
}
