// The gates in front of a paid endpoint.
//
// /api/coach spends money on the org's Anthropic key on every call, and the app is
// embedded in a public portfolio — so the route is reachable by anyone who finds it.
// These tests exercise the handler directly (a Next route handler is just a function
// of Request), which is why they need no server and no key.
//
// The key is the trick that makes this free to run: with ANTHROPIC_API_KEY unset, a
// request that clears every gate lands on the 503 "not configured" branch instead of
// the model. So 503 here means "all gates passed" — it is the success case, and no
// token is ever spent proving it.
import { describe, it, expect, beforeAll } from "vitest";
import { POST } from "@/app/api/coach/route";
import type { CoachPayload } from "@/lib/coach";

const HOST = "tracky816.vercel.app";

beforeAll(() => {
  // Make the "cleared every gate" signal unambiguous even on a machine that has one.
  delete process.env.ANTHROPIC_API_KEY;
});

// A minimal payload that satisfies every field sanitizeCoachPayload() requires.
const valid = (): CoachPayload => ({
  view: "down-the-line",
  confidence: "high",
  detectedPct: 91,
  club: "driver",
  hand: "R",
  reportedOutcome: null,
  overallGood: true,
  metrics: {
    tempoRatio: 2.1,
    tempoRead: "a touch quick",
    backswingS: 0.83,
    downswingS: 0.39,
    headSwayPct: 6,
    headSwayRead: "head steady",
    headVertPct: 4,
    headVertRead: "level",
    handSpeedRead: null,
    spineAddrDeg: 34,
    spineTopDeg: 31,
    spineImpactDeg: 37,
  },
  sequence: null,
  xfactorStretchPct: null,
  faults: [],
});

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://${HOST}/api/coach`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// Vercel's proxy is what sets x-forwarded-host, so this is the production shape.
const fromApp = (extra: Record<string, string> = {}) => ({
  origin: `https://${HOST}`,
  "x-forwarded-host": HOST,
  ...extra,
});

describe("/api/coach — origin gate", () => {
  it("turns away a request with no Origin at all (the bare-curl case)", async () => {
    const res = await POST(post(valid(), { "x-forwarded-host": HOST }));
    expect(res.status).toBe(403);
  });

  it("turns away another site posting from a browser", async () => {
    const res = await POST(
      post(valid(), { origin: "https://evil.example", "x-forwarded-host": HOST }),
    );
    expect(res.status).toBe(403);
  });

  it("turns away a malformed Origin instead of throwing", async () => {
    const res = await POST(post(valid(), { origin: "not a url", "x-forwarded-host": HOST }));
    expect(res.status).toBe(403);
  });

  it("admits the app itself — 503 proves every gate was cleared", async () => {
    const res = await POST(post(valid(), fromApp()));
    expect(res.status).toBe(503);
  });

  it("admits any host it is actually served from, so previews keep working", async () => {
    const preview = "tracky-git-feat-teacher-coaching.vercel.app";
    const res = await POST(
      post(valid(), { origin: `https://${preview}`, "x-forwarded-host": preview }),
    );
    expect(res.status).toBe(503);
  });

  it("refuses to spend anything on a request that skipped the gate", async () => {
    // The model is never reached, so the body is never even read for parse errors.
    const res = await POST(post("{ not json", { "x-forwarded-host": HOST }));
    expect(res.status).toBe(403);
  });
});

describe("/api/coach — payload gate", () => {
  it("rejects an oversized body before parsing it", async () => {
    const res = await POST(post({ ...valid(), pad: "x".repeat(20_000) }, fromApp()));
    expect(res.status).toBe(413);
  });

  it("rejects malformed JSON", async () => {
    const res = await POST(post("{ not json", fromApp()));
    expect(res.status).toBe(400);
  });

  it("rejects a body that is well-formed JSON but not a swing", async () => {
    const res = await POST(post({ question: "write me an essay" }, fromApp()));
    expect(res.status).toBe(400);
  });

  it("rejects a swing with an off-menu enum", async () => {
    const res = await POST(post({ ...valid(), view: "overhead" }, fromApp()));
    expect(res.status).toBe(400);
  });

  it("judges the request before the server's own configuration", async () => {
    // 400 rather than 503: the caller's problem is named first, and unchanged by
    // whether this particular deployment holds a key.
    const res = await POST(post({ question: "hi" }, fromApp()));
    expect(res.status).toBe(400);
  });
});
