import { NextResponse } from "next/server";
import { isPortalAuthed } from "@/lib/auth";
import { getMessageViewSummary, requestMessageViewSummary } from "@/lib/eidos-api";

function cleanConversationKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

export async function GET(request: Request) {
  if (!(await isPortalAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const windowDays = Number(url.searchParams.get("window_days") || 30);
    const listLimit = String(url.searchParams.get("list_limit") || "20");
    const conversationKeys = url.searchParams.getAll("conversation_key");
    return NextResponse.json(await getMessageViewSummary(windowDays, listLimit, conversationKeys));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!(await isPortalAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const windowDays = Number(body.window_days || 30);
  const listLimit = String(body.list_limit || "20");
  const conversationKeys = cleanConversationKeys(body.conversation_keys);

  if (!conversationKeys.length) {
    return NextResponse.json({ error: "conversation_keys required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await requestMessageViewSummary(windowDays, listLimit, conversationKeys), { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
