import { NextResponse } from "next/server";
import { isPortalAuthed } from "@/lib/auth";
import { getStyles, saveStyle } from "@/lib/eidos-api";

export async function GET(request: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getStyles(new URL(request.url).searchParams.get("kind") || undefined));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await saveStyle(await request.json()), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
