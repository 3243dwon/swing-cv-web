// What a given account is allowed to do — the single source of truth, shared by the
// server (which enforces) and the browser (which only decides what to render).
//
// This file is deliberately POLICY ONLY: no request, no cookie, no database, no key.
// It answers "given this tier, is this feature open?" and nothing else. That keeps it
// importable from a client component without dragging server code into the bundle, and
// it means the interesting question — "which tier is this person?" — lives in exactly
// one other place (entitlement.server.ts). Two files, two questions, no third opinion.
//
// Why bother before there is a paywall: the expensive mistake is not "we have no
// billing yet", it is scattering `if (isPro)` across twenty components and then trying
// to add a second client (a WeChat 小程序, an iOS app) that resolves identity a
// different way. With the seam here, a new client changes identify(); the gates never
// move.

/** Ordered, cheapest first. Adding a tier means adding it to RANK below. */
export type Tier = "free" | "pro";

/** Everything that can be locked. A union, so an unhandled feature is a type error. */
export type Feature = "coach";

export const FEATURES: readonly Feature[] = ["coach"] as const;

// Tiers are a ladder, not a set of flags — "pro gets everything free gets" is a
// property we want by construction, not by remembering to copy entries.
const RANK: Record<Tier, number> = { free: 0, pro: 1 };

// The minimum tier each feature requires.
//
// `coach` is FREE today, on purpose: that is exactly what ships right now, and this
// change is architecture, not a price rise. Flipping AI coaching to paid is this one
// word — `coach: "pro"` — and every gate (server route, card UI, any future client)
// follows without another edit. That single-word flip is the whole point of the file.
const POLICY: Record<Feature, Tier> = {
  coach: "free",
};

export function can(tier: Tier, feature: Feature): boolean {
  return RANK[tier] >= RANK[POLICY[feature]];
}

/** The minimum tier a feature needs — for UI that says *what* to upgrade to. */
export function requiredTier(feature: Feature): Tier {
  return POLICY[feature];
}

/**
 * The shape both the server and the browser pass around. `features` is the resolved
 * list rather than something the client recomputes, so a policy change can never be
 * half-deployed: the browser is told what it has, it does not infer it.
 */
export type Entitlement = {
  tier: Tier;
  features: Feature[];
};

export function entitlementFor(tier: Tier): Entitlement {
  return { tier, features: FEATURES.filter((f) => can(tier, f)) };
}

/** What the browser assumes before (or instead of) hearing from the server. */
export const FREE: Entitlement = entitlementFor("free");
