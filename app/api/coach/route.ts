// Server route for AI coaching. This is the ONLY place the Anthropic key lives —
// the browser posts the measured-numbers payload (lib/coach.ts), we call Claude
// Fable 5 here, and stream the coaching text back. No video, image, or landmark
// data is ever received or forwarded; only the derived JSON crosses the network.
//
// Fable 5 specifics honored here: thinking is always on (we omit the param) and
// depth is set with output_config.effort; a server-side fallback to Opus 4.8 keeps
// a false-positive safety refusal from blanking the card. Requires ANTHROPIC_API_KEY
// (and a 30-day-retention org — Fable 5 is not available under zero data retention).
import Anthropic from "@anthropic-ai/sdk";
import { COACH_SYSTEM, coachUserPrompt, sanitizeCoachPayload } from "@/lib/coach";
import { requireFeature } from "@/lib/entitlement.server";

export const runtime = "nodejs";
export const maxDuration = 60; // Fable 5 turns can run long; give Vercel headroom.

// ————— abuse controls —————
//
// Every call to this route spends real money on the org's Anthropic key, and the app
// is embedded in a public portfolio — so this is a metered endpoint on the open
// internet, advertised. Three cheap gates sit in front of the model:
//
//   1. Same-origin only. Browsers attach Origin to every POST, so requiring it to
//      match the host the request arrived on admits the app everywhere it legitimately
//      runs — production, preview deploys, a custom domain later, localhost — without
//      hardcoding any of them, while turning away a bare `curl`, which sends no Origin
//      at all. A forged header defeats it; that is fine. This is the gate that stops
//      drive-by scripted abuse, and it costs nothing.
//   2. A body cap enforced BEFORE JSON.parse, so an oversized payload is never parsed,
//      let alone allowed to inflate the input token bill.
//   3. sanitizeCoachPayload(), which rebuilds the body from known keys only so nothing
//      a stranger invented can reach the prompt.
//
// Those three ask "is this our app, and is this a swing". A fourth gate now asks the
// separate question of "is this caller entitled to the feature at all":
//
//   4. requireFeature(req, "coach") — the server-side half of lib/entitlement.ts. It
//      runs BEFORE the body is even read, because an unentitled caller should not get
//      this route to spend work parsing, judging, or reporting on their payload. Today
//      it admits everyone (coaching is free, unchanged), so this is a seam, not a
//      paywall — but it is the seam that makes coaching paid a one-word edit in
//      lib/entitlement.ts instead of a change to this file.
//
// What is deliberately NOT here: the ceiling on a determined attacker who forges an
// Origin. That is a spend limit on the Anthropic account plus a platform rate limit on
// this path — both configuration, not code, and neither one something this file can
// assert. Treat those as required, not optional.
const MAX_BODY_CHARS = 16 * 1024;

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  // x-forwarded-host is what survives Vercel's proxy; host is the local-dev answer.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  // Ahead of the key check on purpose: a stranger learns nothing about whether this
  // deployment is configured.
  if (!sameOrigin(req)) {
    return new Response("Forbidden.", { status: 403 });
  }

  // "Where from" is settled; now "who". Before any body work — an unentitled caller
  // gets 402 and this route does no reading, parsing, or spending on their behalf.
  const denied = await requireFeature(req, "coach");
  if (denied) return denied;

  // What the caller sent is judged before what this deployment happens to hold, so a
  // malformed request reads the same whether or not a key is configured.
  const body = await req.text();
  if (body.length > MAX_BODY_CHARS) {
    return new Response("Payload too large.", { status: 413 });
  }

  let payload;
  try {
    payload = sanitizeCoachPayload(JSON.parse(body));
  } catch {
    return new Response("Bad request.", { status: 400 });
  }
  if (!payload) {
    return new Response("Bad request.", { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response("AI coaching isn't configured on this server.", { status: 503 });
  }

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const s = client.beta.messages.stream({
          model: "claude-fable-5",
          max_tokens: 1200,
          betas: ["server-side-fallback-2026-06-01"],
          fallbacks: [{ model: "claude-opus-4-8" }],
          output_config: { effort: "medium" },
          system: COACH_SYSTEM,
          messages: [{ role: "user", content: coachUserPrompt(payload) }],
        });

        let sawText = false;
        s.on("text", (delta) => {
          sawText = true;
          controller.enqueue(encoder.encode(delta));
        });

        const final = await s.finalMessage();
        // A refusal that survived the fallback (both models declined) leaves no usable
        // text — say so plainly rather than showing an empty card.
        if (final.stop_reason === "refusal" && !sawText) {
          controller.enqueue(
            encoder.encode(
              "Coaching couldn't be generated for this swing. · 这一杆暂时无法生成教练建议。",
            ),
          );
        }
        controller.close();
      } catch {
        controller.enqueue(
          encoder.encode(
            "Sorry — coaching couldn't be generated right now. · 抱歉，暂时无法生成教练建议。",
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
