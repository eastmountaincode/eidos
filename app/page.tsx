import { redirect } from "next/navigation";
import { isPortalAuthed } from "@/lib/auth";
import { getMessagesOverview } from "@/lib/eidos-api";
import { AppShell } from "@/components/AppShell";
import { MessagesPage } from "@/components/messages/MessagesPage";

export default async function HomePage() {
  if (!(await isPortalAuthed())) {
    redirect("/login");
  }

  const overview = await getMessagesOverview();

  return (
    <AppShell>
      <MessagesPage initialData={overview} />
    </AppShell>
  );
}
