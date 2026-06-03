import { NextResponse } from "next/server";
import { isPortalAuthed } from "@/lib/auth";
import { requestMessagesIngest } from "@/lib/eidos-api";

export async function POST() {
  if (!(await isPortalAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await requestMessagesIngest(), { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
