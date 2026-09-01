import { NextResponse } from "next/server";
import { getSources, saveSource } from "@/lib/eidos-api";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await getSources(new URL(request.url).searchParams.get("type") || undefined));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load sources" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(await saveSource(await request.json()), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save source" }, { status: 500 });
  }
}
