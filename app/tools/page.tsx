import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CapabilitiesPage } from "@/components/capabilities/CapabilitiesPage";
import { isPortalAuthed } from "@/lib/auth";
import { getCapabilities } from "@/lib/eidos-api";

export default async function ToolsPage() {
  if (!(await isPortalAuthed())) {
    redirect("/login");
  }

  const data = await getCapabilities();

  return (
    <AppShell>
      <CapabilitiesPage capabilities={data.capabilities} />
    </AppShell>
  );
}
