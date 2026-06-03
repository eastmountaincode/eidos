import { NextResponse } from "next/server";
import { isPortalAuthed } from "@/lib/auth";
import { getMessagesOverview } from "@/lib/eidos-api";

export async function GET() {
  if (!(await isPortalAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await getMessagesOverview());
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
