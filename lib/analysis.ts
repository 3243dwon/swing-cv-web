// Faithful TypeScript port of the Python swing-cv analysis
// (swing_phases.py detect_phases + analyze.py analyze/flag_faults/watch_notes).
// All math runs on normalized MediaPipe Pose landmarks (x,y in 0..1).

export type LM = { x: number; y: number; z?: number; visibility?: number };
export type Frame = LM[] | null;

export const NOSE = 0;
export const L_WRIST = 15, R_WRIST = 16;
export const L_SH = 11, R_SH = 12;
export const L_HIP = 23, R_HIP = 24;
export const L_ANK = 27, R_ANK = 28;

export const PHASES = ["address", "top", "impact", "finish"] as const;
export type PhaseName = (typeof PHASES)[number];
export type Phases = Record<PhaseName, number>;

export type Metrics = {
  view: "face-on" | "down-the-line";
  tempoRatio: number;
  backswingS: number;
  downswingS: number;
  headSwayPct: number;
  headVertPct: number;
  hipSwayBackPct: number;
  hipSlideImpactPct: number;
  spineAddrDeg: number;
  spineTopDeg: number;
  spineImpactDeg: number;
  reverseSpineDeg: number;
  secondaryTiltDeg: number;
};

export type Fault = { title: string; mishit: string; detail: string; focus: string };

export type Analysis = {
  phases: Phases;
  times: Record<PhaseName, number>;
  metrics: Metrics;
  faults: Fault[];
  notes: string[];
  detectedPct: number;
  fps: number;
};

function smooth(x: number[], k = 5): number[] {
  const n = x.length;
  if (n < 3) return x.slice();
  const half = Math.floor(k / 2);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - half); j < Math.min(n, i + half + 1); j++) { s += x[j]; c++; }
    out[i] = s / c;
  }
  return out;
}

function median(a: number[]): number {
  const s = [...a].sort((p, q) => p - q);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function argmin(a: number[]): number { let b = 0; for (let i = 1; i < a.length; i++) if (a[i] < a[b]) b = i; return b; }
function argmax(a: number[]): number { let b = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[b]) b = i; return b; }

function sign(v: number): string { return (v >= 0 ? "+" : "") + v.toFixed(0); }

function mid(lm: LM[], i: number, j: number): [number, number] {
  return [(lm[i].x + lm[j].x) / 2, (lm[i].y + lm[j].y) / 2];
}

function tiltDeg(low: [number, number], high: [number, number]): number {
  const vx = high[0] - low[0], vy = high[1] - low[1];
  return (Math.atan2(vx, -vy) * 180) / Math.PI;
}

function bodyHeight(lm: LM[]): number {
  const ax = (lm[L_ANK].x + lm[R_ANK].x) / 2, ay = (lm[L_ANK].y + lm[R_ANK].y) / 2;
  return Math.hypot(lm[NOSE].x - ax, lm[NOSE].y - ay) || 0.1;
}

function nearest(frames: Frame[], i: number): LM[] {
  if (frames[i]) return frames[i]!;
  for (let d = 1; d < frames.length; d++) {
    if (frames[i - d]) return frames[i - d]!;
    if (frames[i + d]) return frames[i + d]!;
  }
  throw new Error("No pose detected in any frame.");
}

export function detectPhases(frames: Frame[]): Phases {
  const n = frames.length;
  if (n < 8) throw new Error("Clip too short — film a full swing (a couple of seconds).");

  const hy = new Array<number>(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const f = frames[i];
    if (f) hy[i] = (f[L_WRIST].y + f[R_WRIST].y) / 2;
  }
  const good: number[] = [];
  for (let i = 0; i < n; i++) if (!Number.isNaN(hy[i])) good.push(i);
  if (good.length < 6) throw new Error("Couldn't track your body — try a clearer, brighter clip with your full body in frame.");

  // linear interpolation over gaps
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(hy[i])) {
      let lo = -1, hi = -1;
      for (const g of good) { if (g <= i) lo = g; }
      for (const g of good) { if (g >= i) { hi = g; break; } }
      if (lo === -1) hy[i] = hy[hi];
      else if (hi === -1) hy[i] = hy[lo];
      else if (lo === hi) hy[i] = hy[lo];
      else hy[i] = hy[lo] + ((hy[hi] - hy[lo]) * (i - lo)) / (hi - lo);
    }
  }

  const s = smooth(hy, 5);
  const base = median(s.slice(0, Math.max(3, Math.floor(n / 5))));
  const amp = base - Math.min(...s);
  const thr = base - 0.25 * amp;

  const localMin: number[] = [];
  for (let i = 1; i < n - 1; i++) if (s[i] <= s[i - 1] && s[i] < s[i + 1]) localMin.push(i);

  let top = localMin.find((i) => s[i] < thr);
  if (top === undefined) top = argmin(s);
  const finish = top + 1 + argmin(s.slice(top + 1));
  const impact = top + argmax(s.slice(top, finish + 1));
  const address = argmax(s.slice(0, top + 1));
  return { address, top, impact, finish };
}

export function computeMetrics(frames: Frame[], phases: Phases, fps: number): Metrics {
  const a = nearest(frames, phases.address);
  const t = nearest(frames, phases.top);
  const im = nearest(frames, phases.impact);
  const f = nearest(frames, phases.finish);

  const scale = bodyHeight(a);
  const hipA = mid(a, L_HIP, R_HIP), hipF = mid(f, L_HIP, R_HIP);
  const tgt = hipF[0] - hipA[0] >= 0 ? 1 : -1;
  const swAddr = Math.abs(a[L_SH].x - a[R_SH].x);
  const view: Metrics["view"] = swAddr / scale > 0.15 ? "face-on" : "down-the-line";

  const spine = (fr: LM[]) => tiltDeg(mid(fr, L_HIP, R_HIP), mid(fr, L_SH, R_SH)) * tgt;
  const spineAddr = spine(a), spineTop = spine(t), spineImpact = spine(im);

  const hipx = (fr: LM[]) => mid(fr, L_HIP, R_HIP)[0];
  const hipSwayBack = ((hipx(t) - hipx(a)) * tgt) / scale * 100;
  const hipSlideImpact = ((hipx(im) - hipx(a)) * tgt) / scale * 100;

  const noseA = a[NOSE];
  const dxs: number[] = [], dys: number[] = [];
  for (let i = phases.address; i <= phases.impact; i++) {
    const fr = frames[i];
    if (!fr) continue;
    dxs.push(fr[NOSE].x - noseA.x);
    dys.push(fr[NOSE].y - noseA.y);
  }
  const range = (arr: number[]) => (arr.length ? Math.max(...arr) - Math.min(...arr) : 0);
  const headSway = (range(dxs) / scale) * 100;
  const headVert = (range(dys) / scale) * 100;

  const backS = (phases.top - phases.address) / fps;
  const downS = (phases.impact - phases.top) / fps;

  return {
    view,
    tempoRatio: downS > 0 ? backS / downS : NaN,
    backswingS: backS,
    downswingS: downS,
    headSwayPct: headSway,
    headVertPct: headVert,
    hipSwayBackPct: hipSwayBack,
    hipSlideImpactPct: hipSlideImpact,
    spineAddrDeg: spineAddr,
    spineTopDeg: spineTop,
    spineImpactDeg: spineImpact,
    reverseSpineDeg: spineTop - spineAddr,
    secondaryTiltDeg: spineAddr - spineImpact,
  };
}

export function flagFaults(m: Metrics): Fault[] {
  const f: Fault[] = [];
  if (m.headSwayPct > 15 || Math.abs(m.hipSwayBackPct) > 18)
    f.push({
      title: "Excess lateral sway",
      mishit: "fat & thin shots — the low point wanders, so strike is hit-or-miss",
      detail: `head ${m.headSwayPct.toFixed(0)}% / hip ${sign(m.hipSwayBackPct)}% of body height`,
      focus: "strike consistency",
    });
  if (m.headVertPct > 12)
    f.push({
      title: "Head lifts or dips through the swing",
      mishit: "topped and thin shots — the killers off the tee and fairway",
      detail: `${m.headVertPct.toFixed(0)}% of body height vertically`,
      focus: "strike consistency",
    });
  if (!Number.isNaN(m.tempoRatio) && m.tempoRatio < 1.8)
    f.push({
      title: "Rushed transition",
      mishit: "loss of sequence → inconsistent contact and direction",
      detail: `tempo ${m.tempoRatio.toFixed(1)}:1 (smooth is ~3:1)`,
      focus: "tempo",
    });
  return f;
}

export function watchNotes(m: Metrics): string[] {
  const notes: string[] = [];
  if (Math.abs(m.secondaryTiltDeg) > 15)
    notes.push(
      `Spine angle changes ${sign(m.secondaryTiltDeg)}° from address to impact — if you filmed down-the-line, a big stand-up can mean early extension (thins/shanks). Confirm with a clean DTL clip.`
    );
  if (m.reverseSpineDeg > 10)
    notes.push(
      `Upper body may lean toward the target at the top (~${m.reverseSpineDeg.toFixed(0)}°) — possible reverse pivot; confirm on a DTL clip.`
    );
  return notes;
}

export function analyzeSwing(frames: Frame[], fps: number): Analysis {
  const det = frames.filter(Boolean).length;
  const phases = detectPhases(frames);
  const metrics = computeMetrics(frames, phases, fps);
  return {
    phases,
    times: {
      address: phases.address / fps,
      top: phases.top / fps,
      impact: phases.impact / fps,
      finish: phases.finish / fps,
    },
    metrics,
    faults: flagFaults(metrics),
    notes: watchNotes(metrics),
    detectedPct: (100 * det) / frames.length,
    fps,
  };
}
