import { NextResponse } from "next/server";
import { isPortalAuthed } from "@/lib/auth";
import { getMemory } from "@/lib/eidos-api";

export async function GET(request: Request) {
  if (!(await isPortalAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    return NextResponse.json(await getMemory(url.searchParams.get("date") || undefined));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
