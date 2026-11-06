import { isPortalAuthed } from "@/lib/auth";
import { saveContactName } from "@/lib/eidos-api";
import { hasSameOrigin } from "@/lib/request-origin";

export async function PATCH(request: Request) {
  if (!(await isPortalAuthed())) return Response.json({ error: "Please sign in again." }, { status: 401 });
  if (!hasSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.conversation_key !== "string" || !body.conversation_key ||
    typeof body.display_name !== "string" || body.display_name.trim().length > 120 || /[\u0000-\u001f\u007f]/.test(body.display_name)) {
    return Response.json({ error: "Enter a name of at most 120 characters." }, { status: 400 });
  }
  try {
    return Response.json(await saveContactName(body.conversation_key, body.display_name));
  } catch {
    return Response.json({ error: "Could not save this name. Please try again." }, { status: 502 });
  }
}
