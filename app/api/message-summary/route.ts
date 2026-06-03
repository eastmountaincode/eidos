import { NextResponse } from "next/server";
import { isPortalAuthed } from "@/lib/auth";
import { requestConversationSummary } from "@/lib/eidos-api";
import type { SummaryWindow } from "@/types/messages";

export async function POST(request: Request) {
  if (!(await isPortalAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const conversationKey = String(body.conversation_key || "");
  const windowType = String(body.window_type || "week") as SummaryWindow;

  if (!conversationKey) {
    return NextResponse.json({ error: "missing conversation_key" }, { status: 400 });
  }

  try {
    return NextResponse.json(await requestConversationSummary(conversationKey, windowType), { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
