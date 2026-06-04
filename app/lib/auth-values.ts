export const PORTAL_COOKIE_NAME = "eidos_portal";

export function portalPassword() {
  return process.env.EIDOS_PORTAL_PASSWORD || "eidos555";
}

export function portalSessionSecret() {
  return process.env.EIDOS_PORTAL_SESSION_SECRET || "local-session";
}
