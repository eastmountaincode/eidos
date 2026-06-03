import { cookies } from "next/headers";
import { PORTAL_COOKIE_NAME, portalSessionSecret } from "./auth-values";

export { PORTAL_COOKIE_NAME, portalPassword, portalSessionSecret } from "./auth-values";

export async function isPortalAuthed() {
  const cookieStore = await cookies();
  return cookieStore.get(PORTAL_COOKIE_NAME)?.value === portalSessionSecret();
}
