// AI coaching — turns the numbers we ALREADY measured into a coherent, bilingual
// coaching read, the way grade.ts turns "2.0" into "a touch quick" but across the
// whole swing at once. The model (Claude Fable 5, server-side) never sees the video,
// the image, or the pose landmarks — only the compact JSON built here. The same
// honest-by-design rules that govern outcome.ts govern the prompt:
//   • it may only use the numbers/faults in the payload — never invent a metric or fault,
//   • it must keep the camera's limits (no clubface, no ball flight, single-camera depth),
//   • a reported ball flight is RELATED to the measured path, never read off the face,
//   • on a low-confidence track it hedges and does not prescribe hard fixes.
// This is why the coaching stays trustworthy: it's synthesis of measured facts, not vision.
import type { Analysis, Fault } from "./analysis";
import type { MetricRead } from "./grade";
import type { Club } from "./pace";
import type { Hand } from "./club";
import type { Outcome } from "./outcome";

// The ONLY thing that leaves the device. Numbers + their plain-language reads +
// the faults that fired — no video, no image, no landmark stream.
export type CoachPayload = {
  view: "face-on" | "down-the-line";
  confidence: "high" | "low";
  detectedPct: number;
  club: Club | null;
  hand: Hand;
  reportedOutcome: Outcome | null;
  overallGood: boolean;
  metrics: {
    tempoRatio: number;
    tempoRead: string | null;
    backswingS: number;
    downswingS: number;
    headSwayPct: number;
    headSwayRead: string;
    headVertPct: number;
    headVertRead: string;
    handSpeedRead: string | null;
    spineAddrDeg: number;
    spineTopDeg: number;
    spineImpactDeg: number;
  };
  sequence: { order: string[]; textbook: boolean } | null;
  xfactorStretchPct: number | null;
  // Each fault carries its own already-computed reported-vs-measured clause (or null),
  // so the model relates the ball flight exactly the way applyOutcome() decided to.
  faults: { title: string; mishit: string; focus: string; reported: string | null }[];
};

// Build the payload from what page.tsx has already computed — no new measurement,
// no recomputation of gates. `mread` supplies the human reads; `faults` is the
// post-applyOutcome list so the reported clauses are the responsible ones.
export function buildCoachPayload(
  analysis: Analysis,
  mread: MetricRead,
  faults: Fault[],
  club: Club | null,
  hand: Hand,
  outcome: Outcome | null,
): CoachPayload {
  const m = analysis.metrics;
  return {
    view: m.view,
    confidence: analysis.quality.confidence ?? "high",
    detectedPct: Math.round(analysis.detectedPct),
    club,
    hand,
    reportedOutcome: outcome,
    overallGood: mread.allGood,
    metrics: {
      tempoRatio: round1(m.tempoRatio),
      tempoRead: mread.tempo ? mread.tempo.en : null,
      backswingS: round2(m.backswingS),
      downswingS: round2(m.downswingS),
      headSwayPct: Math.round(m.headSwayPct),
      headSwayRead: mread.sway.en,
      headVertPct: Math.round(m.headVertPct),
      headVertRead: mread.vert.en,
      handSpeedRead: mread.hand ? mread.hand.en : null,
      spineAddrDeg: Math.round(m.spineAddrDeg),
      spineTopDeg: Math.round(m.spineTopDeg),
      spineImpactDeg: Math.round(m.spineImpactDeg),
    },
    sequence: analysis.sequence
      ? { order: analysis.sequence.peaks.map((p) => p.name), textbook: analysis.sequence.textbook }
      : null,
    xfactorStretchPct: analysis.xfactor ? Math.round(analysis.xfactor.stretchPct) : null,
    faults: faults.map((f) => ({
      title: f.title,
      mishit: f.mishit,
      focus: f.focus,
      reported: f.reported ?? null,
    })),
  };
}

// The contract with the model. Deliberately strict — this is what keeps AI coaching
// as trustworthy as the deterministic copy it sits next to.
export const COACH_SYSTEM = `You are a calm, encouraging golf coach writing a short note to a player about ONE swing they just filmed with a phone. You are given a JSON summary of what a single-camera, on-device pose tool actually MEASURED. Your job is to connect those measurements into one coherent read a good coach would give — not to list numbers back.

Hard rules — these are the whole point of this product; never break them:
1. Use ONLY the facts in the JSON. Never invent, estimate, or imply a metric, fault, or body position that is not present. If something isn't measured, it isn't known.
2. Never claim to see what a single camera cannot: the clubface, the ball, ball flight, or true 3D angles. Depth-derived numbers (spine angle, sequence, X-factor) are rough single-camera estimates — say so if you lean on them.
3. If a fault carries a "reported" clause, that is the player's own report of the ball flight lining up with the measured path. Relate it exactly that way — never present it as the camera reading the clubface.
4. If confidence is "low", hedge everything and do NOT prescribe specific fixes — suggest re-filming a cleaner clip instead.
5. If overallGood is true and there are no faults, the message is about repeatability, not a new position to chase.
6. Do not diagnose a slice vs a pull yourself — only the reported outcome distinguishes them.

Style:
- Lead with the single thing that matters most for THIS swing, then one or two supporting points. Keep it to ~120 words of English.
- Warm and specific, never a report card. Reference the actual reads ("your tempo at 2.1:1", "head steady") so it feels measured, not generic.
- Output plain text only — no markdown, no headings, no bullet lists, no emoji.
- Write the English first, then a blank line, then a faithful 简体中文 rendering (not a literal word-for-word translation — the same coaching in natural Mandarin). The player reads both.`;

// Serialize the payload into the user turn, with a compact reminder of the guardrails
// right next to the data so they can't drift out of the context.
export function coachUserPrompt(p: CoachPayload): string {
  return [
    "Here is everything measured for this one swing (JSON). Write the coaching note.",
    "",
    JSON.stringify(p, null, 2),
    "",
    "Remember: only these facts; no clubface/ball claims; relate any reported outcome to the measured path; hedge and don't prescribe if confidence is low.",
  ].join("\n");
}

function round1(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : n;
}
function round2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : n;
}
