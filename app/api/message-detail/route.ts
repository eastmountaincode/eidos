import { NextResponse } from "next/server";
import { isPortalAuthed } from "@/lib/auth";
import { getConversationDetail } from "@/lib/eidos-api";

export async function GET(request: Request) {
  if (!(await isPortalAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const conversationKey = url.searchParams.get("conversation_key");
  if (!conversationKey) {
    return NextResponse.json({ error: "missing conversation_key" }, { status: 400 });
  }

  try {
    return NextResponse.json(await getConversationDetail(conversationKey));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
