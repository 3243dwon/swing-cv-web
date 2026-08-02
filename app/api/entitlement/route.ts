// What the browser is allowed to render as unlocked.
//
// This is the ONLY way the client learns its tier — it never infers it from a cookie
// it can read, or from a build-time flag, because then a policy change would ship to
// the server and the UI at different times. Ask, render what you're told.
//
// Nothing here is a security boundary: the answer is advisory, and lying to it buys
// nothing, because the capability itself is gated again server-side (requireFeature in
// lib/entitlement.server.ts). Treat this endpoint as "what should the page look like",
// never as "what may this person do".
import { entitlementOf } from "@/lib/entitlement.server";

export const runtime = "nodejs";
// Per-caller and about to become session-dependent — never cached, at any layer.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const entitlement = await entitlementOf(req);
  return Response.json(entitlement, {
    headers: { "cache-control": "no-store" },
  });
}
