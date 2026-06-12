import { NextResponse } from "next/server";
import { isPortalAuthed } from "@/lib/auth";
import { deleteMemoryNote } from "@/lib/eidos-api";

export async function DELETE(request: Request) {
  if (!(await isPortalAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const id = url.searchParams.get("id");

    if (kind !== "memory" && kind !== "person") {
      return NextResponse.json({ error: "invalid kind" }, { status: 400 });
    }

    if (!id) {
      return NextResponse.json({ error: "missing id" }, { status: 400 });
    }

    return NextResponse.json(await deleteMemoryNote(kind, id));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
