// The properties that have to hold for a permission system to be safe to grow into.
//
// Two of these tests are about TODAY (nothing is locked yet, and that is deliberate),
// and the rest are about the shape — the ladder, the resolved feature list, the closed
// default. The shape tests are the ones that must keep passing when a paywall lands.
import { describe, it, expect } from "vitest";
import {
  FEATURES,
  FREE,
  can,
  entitlementFor,
  requiredTier,
  type Feature,
  type Tier,
} from "./entitlement";

const TIERS: Tier[] = ["free", "pro"];

describe("policy today", () => {
  it("leaves AI coaching free — this seam is architecture, not a price rise", () => {
    expect(can("free", "coach")).toBe(true);
    expect(requiredTier("coach")).toBe("free");
  });

  it("locks nothing at all yet", () => {
    const locked = FEATURES.filter((f) => !can("free", f));
    expect(locked).toEqual([]);
  });
});

describe("the tier ladder", () => {
  it("gives pro everything free has, for every feature", () => {
    for (const f of FEATURES) {
      if (can("free", f)) expect(can("pro", f)).toBe(true);
    }
  });

  it("never denies a tier the feature it is the required tier for", () => {
    for (const f of FEATURES) {
      expect(can(requiredTier(f), f)).toBe(true);
    }
  });
});

describe("entitlementFor", () => {
  it("resolves the feature list rather than leaving the client to infer it", () => {
    for (const tier of TIERS) {
      const ent = entitlementFor(tier);
      expect(ent.tier).toBe(tier);
      expect(ent.features).toEqual(FEATURES.filter((f) => can(tier, f)));
    }
  });

  it("agrees with can() in both directions — no feature is listed that is denied", () => {
    for (const tier of TIERS) {
      const listed = new Set<Feature>(entitlementFor(tier).features);
      for (const f of FEATURES) {
        expect(listed.has(f)).toBe(can(tier, f));
      }
    }
  });

  it("is what FREE is, so the browser's pre-answer default is never a guess", () => {
    expect(FREE).toEqual(entitlementFor("free"));
  });
});
