// Proof that /api/coach is actually gated — and gated in the right ORDER.
//
// The policy is a constant (coaching is free today), so the only way to exercise the
// denied path is to stand in for the seam itself: requireFeature is mocked here, which
// is exactly the substitution a real paywall makes. What is being tested is the route's
// wiring, not the policy — lib/entitlement.test.ts covers the policy.
//
// Separate file from coach-route.test.ts because vi.mock applies to a whole module
// graph: the origin/payload tests need the real gate to reach their 503.
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// Flipped per-test. Read inside the mock so it can change between cases.
let deny = false;

vi.mock("@/lib/entitlement.server", () => ({
  requireFeature: async () =>
    deny ? new Response("Upgrade required.", { status: 402 }) : null,
}));

const { POST } = await import("@/app/api/coach/route");

const HOST = "tracky816.vercel.app";

beforeAll(() => {
  // As in coach-route.test.ts: with no key, 503 means "cleared every gate" and costs
  // nothing to prove.
  delete process.env.ANTHROPIC_API_KEY;
});

beforeEach(() => {
  deny = false;
});

function post(body: unknown): Request {
  return new Request(`https://${HOST}/api/coach`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: `https://${HOST}`,
      "x-forwarded-host": HOST,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("/api/coach — entitlement gate", () => {
  it("answers 402 when the caller isn't entitled, not 403 or a silent empty stream", async () => {
    deny = true;
    const res = await POST(post({ view: "down-the-line" }));
    expect(res.status).toBe(402);
  });

  it("refuses before reading the body — a denied caller can't even get a parse error", async () => {
    // Well past MAX_BODY_CHARS *and* malformed: an entitled caller would see 413 or
    // 400. Seeing 402 is what proves the gate runs first, which is the whole point of
    // putting it above the body work.
    deny = true;
    const res = await POST(post("{ not json" + "x".repeat(20_000)));
    expect(res.status).toBe(402);
  });

  it("stays out of the way when the caller is entitled", async () => {
    const res = await POST(post({ question: "not a swing" }));
    // 400 from the payload gate — reached only because the entitlement gate passed.
    expect(res.status).toBe(400);
  });
});
