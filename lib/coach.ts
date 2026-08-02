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

// ————— untrusted input —————
//
// buildCoachPayload() above is the trusted path: our own numbers, our own reads.
// But /api/coach is a public POST that spends money on every call, so the JSON that
// actually arrives there is whatever the caller chose to send. CoachPayload is a
// TypeScript type — erased at runtime, proving nothing about a parsed body — and
// coachUserPrompt() stringifies the whole object straight into the prompt. Without
// this function, any key a stranger invents rides into the model's context.
//
// So the payload is REBUILT here rather than checked in place: only known keys are
// copied across, enums must match exactly, and every free-text read is truncated.
// Anything else the caller sent simply has nowhere to land.

const VIEWS = new Set<CoachPayload["view"]>(["face-on", "down-the-line"]);
const CONFIDENCES = new Set<CoachPayload["confidence"]>(["high", "low"]);
const CLUBS = new Set<Club>(["driver", "iron", "wedge", "putt"]);
const HANDS = new Set<Hand>(["R", "L"]);
const OUTCOMES = new Set<Outcome>([
  "flush", "slice", "hook", "pull", "push", "thin", "fat", "low",
]);

// The reads are prose from grade.ts, so they can't be enumerated the way the fields
// above can. They ARE short by construction though, and the cap is what keeps a
// stranger's text from becoming the bulk of the prompt.
const MAX_READ_CHARS = 120;
const MAX_FAULTS = 8;
const MAX_SEQUENCE_STEPS = 6;

function pick<T extends string>(allowed: ReadonlySet<T>, v: unknown): T | null {
  return typeof v === "string" && allowed.has(v as T) ? (v as T) : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function text(v: unknown): string | null {
  return typeof v === "string" ? v.slice(0, MAX_READ_CHARS) : null;
}

function cleanSequence(v: unknown): CoachPayload["sequence"] {
  if (typeof v !== "object" || v === null) return null;
  const s = v as Record<string, unknown>;
  if (!Array.isArray(s.order)) return null;
  const order = s.order
    .filter((x): x is string => typeof x === "string")
    .slice(0, MAX_SEQUENCE_STEPS)
    .map((x) => x.slice(0, MAX_READ_CHARS));
  return { order, textbook: s.textbook === true };
}

// A malformed fault is dropped rather than failing the whole request: the coaching
// note is still honest without it, and a partial list beats no card at all.
function cleanFaults(v: unknown): CoachPayload["faults"] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, MAX_FAULTS).flatMap((f) => {
    if (typeof f !== "object" || f === null) return [];
    const o = f as Record<string, unknown>;
    const title = text(o.title);
    const mishit = text(o.mishit);
    const focus = text(o.focus);
    if (title === null || mishit === null || focus === null) return [];
    return [{ title, mishit, focus, reported: text(o.reported) }];
  });
}

/**
 * Rebuild a CoachPayload from untrusted JSON, or null if it isn't one.
 *
 * Null means "don't call the model" — the route answers 400. Every field the real
 * client sends survives the trip unchanged, so a valid payload round-trips exactly.
 */
export function sanitizeCoachPayload(raw: unknown): CoachPayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.metrics !== "object" || r.metrics === null) return null;
  const rm = r.metrics as Record<string, unknown>;

  const view = pick(VIEWS, r.view);
  const confidence = pick(CONFIDENCES, r.confidence);
  const hand = pick(HANDS, r.hand);
  const detectedPct = num(r.detectedPct);
  const tempoRatio = num(rm.tempoRatio);
  const backswingS = num(rm.backswingS);
  const downswingS = num(rm.downswingS);
  const headSwayPct = num(rm.headSwayPct);
  const headVertPct = num(rm.headVertPct);
  const spineAddrDeg = num(rm.spineAddrDeg);
  const spineTopDeg = num(rm.spineTopDeg);
  const spineImpactDeg = num(rm.spineImpactDeg);
  const headSwayRead = text(rm.headSwayRead);
  const headVertRead = text(rm.headVertRead);

  // Everything above is required. One miss and there is no swing to talk about.
  if (
    view === null ||
    confidence === null ||
    hand === null ||
    detectedPct === null ||
    tempoRatio === null ||
    backswingS === null ||
    downswingS === null ||
    headSwayPct === null ||
    headVertPct === null ||
    spineAddrDeg === null ||
    spineTopDeg === null ||
    spineImpactDeg === null ||
    headSwayRead === null ||
    headVertRead === null
  ) {
    return null;
  }

  return {
    view,
    confidence,
    detectedPct,
    club: pick(CLUBS, r.club),
    hand,
    reportedOutcome: pick(OUTCOMES, r.reportedOutcome),
    overallGood: r.overallGood === true,
    metrics: {
      tempoRatio,
      tempoRead: text(rm.tempoRead),
      backswingS,
      downswingS,
      headSwayPct,
      headSwayRead,
      headVertPct,
      headVertRead,
      handSpeedRead: text(rm.handSpeedRead),
      spineAddrDeg,
      spineTopDeg,
      spineImpactDeg,
    },
    sequence: cleanSequence(r.sequence),
    xfactorStretchPct: num(r.xfactorStretchPct),
    faults: cleanFaults(r.faults),
  };
}

function round1(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : n;
}
function round2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : n;
}
