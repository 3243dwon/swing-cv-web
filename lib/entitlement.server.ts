// Who is asking — the server half of the seam, and the ONLY file that has to change
// when accounts, payment, or a second client arrive.
//
// Never import this from a component. It is for route handlers only (today:
// app/api/coach/route.ts and app/api/entitlement/route.ts). The policy half —
// lib/entitlement.ts — is the one that is safe on both sides.
//
// ————— the rule this file exists to enforce —————
//
// The browser decides what to SHOW. The server decides what to DO. A locked card that
// only hides a button is not locked; anyone can open devtools and post to the route.
// So every paid capability calls requireFeature() here, server-side, before spending
// anything — and the UI's version of the same question is presentation, not security.
//
// ————— how this grows (the part worth reading before you edit) —————
//
// Right now identify() returns anonymous/free for everyone, which is exactly today's
// product. When billing lands, identify() becomes: read the session cookie → look up
// the account → return its tier. Nothing else in the codebase moves.
//
// The `source` field is there for the multi-client question specifically. If a WeChat
// 小程序 (or an iOS app) is ever added, it authenticates differently — a mini-program
// code exchange rather than a web session — but it must resolve to the SAME userId, so
// that what someone bought on the website is theirs everywhere. Concretely: bind both
// logins to one WeChat Open Platform account and key the user table on `unionid`, then
// identify() maps either credential to the same row. Entitlement is a property of the
// ACCOUNT, never of the client that happens to be asking — which is also why there is
// no per-client tier and no per-client price in this file, and shouldn't be.
//
// (The corollary, learned the hard way from the platform rules: a mini program cannot
// legally sell this on iOS, and an individual-registered one cannot take payment at
// all. So the checkout stays on the web, and every other client only ever READS the
// entitlement it is handed here.)
import { can, entitlementFor, type Entitlement, type Feature, type Tier } from "./entitlement";

export type IdentitySource = "anonymous" | "web" | "wechat";

export type Identity = {
  /** Stable per-account id. Null only while nobody is signed in. */
  userId: string | null;
  /** Which credential answered — for logging and for nothing else. */
  source: IdentitySource;
  tier: Tier;
};

export const ANONYMOUS: Identity = { userId: null, source: "anonymous", tier: "free" };

/**
 * Resolve the caller. THE seam — replace the body, keep the signature.
 *
 * Async today despite doing no I/O, because the real implementation is a session read
 * plus an account lookup, and every call site is already written to await it.
 */
export async function identify(_req: Request): Promise<Identity> {
  return ANONYMOUS;
}

export async function entitlementOf(req: Request): Promise<Entitlement> {
  const identity = await identify(req);
  return entitlementFor(identity.tier);
}

/**
 * The gate. Returns a Response to send back if the caller may NOT use `feature`, or
 * null to continue — so a route reads:
 *
 *     const denied = await requireFeature(req, "coach");
 *     if (denied) return denied;
 *
 * 402 rather than 403 on purpose: 403 says "not for you", 402 says "not yet, and there
 * is a way to fix it". The client tells those apart to decide whether to offer an
 * upgrade or an apology.
 */
export async function requireFeature(req: Request, feature: Feature): Promise<Response | null> {
  const identity = await identify(req);
  if (can(identity.tier, feature)) return null;
  return new Response("Upgrade required. · 该功能需要升级。", {
    status: 402,
    headers: { "cache-control": "no-store" },
  });
}
