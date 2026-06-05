import { NextResponse } from "next/server";
import { isPortalAuthed } from "@/lib/auth";
import { getMantra, updateMantra } from "@/lib/eidos-api";

export async function GET() {
  if (!(await isPortalAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await getMantra());
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!(await isPortalAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    return NextResponse.json(await updateMantra(String(payload.body ?? "")));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
