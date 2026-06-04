import { NextResponse } from "next/server";
import { isPortalAuthed } from "@/lib/auth";
import { getMessagesOverview } from "@/lib/eidos-api";

export async function GET(request: Request) {
  if (!(await isPortalAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const windowDays = Number(url.searchParams.get("window_days") || 30);
    return NextResponse.json(await getMessagesOverview(windowDays));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
