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
import { COACH_SYSTEM, coachUserPrompt, type CoachPayload } from "@/lib/coach";

export const runtime = "nodejs";
export const maxDuration = 60; // Fable 5 turns can run long; give Vercel headroom.

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response("AI coaching isn't configured on this server.", { status: 503 });
  }

  let payload: CoachPayload;
  try {
    payload = (await req.json()) as CoachPayload;
  } catch {
    return new Response("Bad request.", { status: 400 });
  }
  if (!payload || !payload.metrics) {
    return new Response("Bad request.", { status: 400 });
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
