import type { LM } from "./analysis";
import { L_SH, R_SH, L_HIP, R_HIP } from "./analysis";

// 33-landmark skeleton connections (same map as the Python tool).
export const POSE_CONNECTIONS: [number, number][] = [
  [0, 2], [2, 7], [0, 5], [5, 8],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [15, 17], [15, 19], [15, 21], [16, 18], [16, 20], [16, 22],
  [11, 12], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32],
];

export function drawPose(ctx: CanvasRenderingContext2D, lm: LM[], w: number, h: number): void {
  const unit = Math.max(2, Math.round(w / 220));
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0,255,90,0.95)";
  ctx.lineWidth = unit;
  for (const [a, b] of POSE_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,200,0,0.95)";
  for (const p of lm) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, unit * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Spine line (cyan) + shoulder/hip lines (magenta) — the geometry the metrics use.
export function drawGeometry(ctx: CanvasRenderingContext2D, lm: LM[], w: number, h: number): void {
  const unit = Math.max(2, Math.round(w / 200));
  const shMid: [number, number] = [(lm[L_SH].x + lm[R_SH].x) / 2 * w, (lm[L_SH].y + lm[R_SH].y) / 2 * h];
  const hipMid: [number, number] = [(lm[L_HIP].x + lm[R_HIP].x) / 2 * w, (lm[L_HIP].y + lm[R_HIP].y) / 2 * h];
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0,229,255,0.95)";
  ctx.lineWidth = unit * 1.5;
  ctx.beginPath();
  ctx.moveTo(hipMid[0], hipMid[1]);
  ctx.lineTo(shMid[0], shMid[1]);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,0,200,0.9)";
  ctx.lineWidth = unit;
  for (const [i, j] of [[L_SH, R_SH], [L_HIP, R_HIP]] as [number, number][]) {
    ctx.beginPath();
    ctx.moveTo(lm[i].x * w, lm[i].y * h);
    ctx.lineTo(lm[j].x * w, lm[j].y * h);
    ctx.stroke();
  }
}
