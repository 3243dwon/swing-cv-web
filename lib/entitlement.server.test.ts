// The server half: who identify() says you are, and what requireFeature() does about
// it. No request context exists yet beyond the Request itself, so these run as plain
// function calls.
import { describe, it, expect } from "vitest";
import { ANONYMOUS, entitlementOf, identify, requireFeature } from "./entitlement.server";
import { entitlementFor } from "./entitlement";

const req = () => new Request("https://tracky816.vercel.app/api/coach", { method: "POST" });

describe("identify", () => {
  it("resolves everyone to anonymous/free — today's product, stated once", async () => {
    await expect(identify(req())).resolves.toEqual(ANONYMOUS);
  });

  it("carries no userId while nobody is signed in, rather than inventing one", async () => {
    const id = await identify(req());
    expect(id.userId).toBeNull();
    expect(id.source).toBe("anonymous");
  });
});

describe("entitlementOf", () => {
  it("hands back exactly what the identity's tier resolves to", async () => {
    await expect(entitlementOf(req())).resolves.toEqual(entitlementFor("free"));
  });
});

describe("requireFeature", () => {
  it("lets coaching through — the live app is unchanged by this gate", async () => {
    await expect(requireFeature(req(), "coach")).resolves.toBeNull();
  });

  it("returns null, not a truthy 'ok' object, so `if (denied) return denied` is safe", async () => {
    const denied = await requireFeature(req(), "coach");
    expect(denied).not.toBeInstanceOf(Response);
  });
});
