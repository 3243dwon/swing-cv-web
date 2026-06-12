"use client";

import { useEffect, useRef, useState } from "react";

// Landing showpiece: a pinned section where scrolling scrubs a synthetic
// "ghost" swing drawn in the product's own overlay language (green bones,
// yellow joints, cyan spine, magenta lines, orange hand tracer).
// No video needed — this is what the tool does to YOUR clip, previewed.

type P = [number, number];
type Pose = { shL: P; shR: P; hands: P; tip: P; hipL: P; hipR: P; head: P };

const KEY: Pose[] = [
  { shL: [84, 90], shR: [116, 90], hands: [103, 158], tip: [124, 200], hipL: [88, 144], hipR: [112, 144], head: [100, 64] },
  { shL: [86, 90], shR: [114, 92], hands: [126, 148], tip: [160, 182], hipL: [88, 144], hipR: [112, 144], head: [100, 64] },
  { shL: [90, 88], shR: [110, 95], hands: [146, 110], tip: [176, 68], hipL: [90, 144], hipR: [111, 145], head: [101, 64] },
  { shL: [94, 86], shR: [106, 97], hands: [140, 70], tip: [108, 40], hipL: [92, 143], hipR: [110, 146], head: [102, 64] },
  { shL: [92, 87], shR: [108, 96], hands: [142, 92], tip: [172, 58], hipL: [88, 143], hipR: [108, 145], head: [101, 64] },
  { shL: [82, 88], shR: [115, 93], hands: [97, 162], tip: [110, 203], hipL: [82, 142], hipR: [106, 143], head: [99, 63] },
  { shL: [80, 90], shR: [116, 92], hands: [58, 128], tip: [26, 140], hipL: [80, 141], hipR: [104, 142], head: [97, 63] },
  { shL: [88, 84], shR: [108, 88], hands: [64, 66], tip: [94, 32], hipL: [78, 140], hipR: [100, 140], head: [95, 60] },
];

function mix(a: P, b: P, t: number): P {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function pose(p: number): Pose {
  const f = Math.max(0, Math.min(0.9999, p)) * (KEY.length - 1);
  const i = Math.floor(f);
  let t = f - i;
  t = t * t * (3 - 2 * t);
  const a = KEY[i];
  const b = KEY[i + 1];
  return {
    shL: mix(a.shL, b.shL, t),
    shR: mix(a.shR, b.shR, t),
    hands: mix(a.hands, b.hands, t),
    tip: mix(a.tip, b.tip, t),
    hipL: mix(a.hipL, b.hipL, t),
    hipR: mix(a.hipR, b.hipR, t),
    head: mix(a.head, b.head, t),
  };
}

function label(p: number): string {
  if (p < 0.07) return "ADDRESS";
  if (p < 0.4) return "BACKSWING";
  if (p < 0.49) return "TOP";
  if (p < 0.6) return "DOWNSWING";
  if (p < 0.67) return "IMPACT";
  if (p < 0.85) return "FOLLOW-THROUGH";
  return "FINISH";
}

export default function GhostHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chipRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [off, setOff] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setOff(true);
  }, []);

  useEffect(() => {
    if (off) return;

    const draw = (p: number) => {
      const c = canvasRef.current;
      const stage = stageRef.current;
      if (!c || !stage) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.min(Math.round(stage.clientWidth * dpr), 980);
      const chh = Math.round((cw * 230) / 200);
      if (c.width !== cw || c.height !== chh) {
        c.width = cw;
        c.height = chh;
      }
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const s = cw / 200;
      const X = (q: P) => q[0] * s;
      const Y = (q: P) => q[1] * s;
      ctx.clearRect(0, 0, c.width, c.height);

      ctx.strokeStyle = "rgba(76,225,126,0.07)";
      ctx.lineWidth = 1.5;
      for (const r of [44, 86, 128]) {
        ctx.beginPath();
        ctx.arc(100 * s, 140 * s, r * s, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(148,190,158,0.18)";
      ctx.beginPath();
      ctx.moveTo(12 * s, 206 * s);
      ctx.lineTo(188 * s, 206 * s);
      ctx.stroke();

      const o = pose(p);
      const neck: P = [(o.shL[0] + o.shR[0]) / 2, (o.shL[1] + o.shR[1]) / 2];
      const hipM: P = [(o.hipL[0] + o.hipR[0]) / 2, (o.hipL[1] + o.hipR[1]) / 2];
      const kL: P = [o.hipL[0] - 2, 174];
      const kR: P = [o.hipR[0] + 4, 174];
      const aL: P = [80, 206];
      const aR: P = [122, 206];

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const n = Math.max(2, Math.round(60 * p));
      ctx.shadowColor = "rgba(255,176,86,0.7)";
      for (let j = 1; j <= n; j++) {
        const q0 = pose(((j - 1) / 60) as number).hands;
        const q1 = pose((j / 60) as number).hands;
        const r = j / n;
        ctx.strokeStyle = `rgba(255,176,86,${(0.06 + 0.7 * Math.pow(r, 1.6)).toFixed(3)})`;
        ctx.lineWidth = (1 + 2.6 * r) * s * 0.55;
        ctx.shadowBlur = n - j < 5 ? 10 : 0;
        ctx.beginPath();
        ctx.moveTo(X(q0), Y(q0));
        ctx.lineTo(X(q1), Y(q1));
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      const bone = (a: P, b: P, color: string, w: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = w * s * 0.55;
        ctx.beginPath();
        ctx.moveTo(X(a), Y(a));
        ctx.lineTo(X(b), Y(b));
        ctx.stroke();
      };

      const G = "rgba(0,255,90,0.92)";
      bone(o.hipL, kL, G, 3.4);
      bone(kL, aL, G, 3.4);
      bone(o.hipR, kR, G, 3.4);
      bone(kR, aR, G, 3.4);
      bone(neck, hipM, "rgba(0,229,255,0.95)", 3.8);
      bone(o.shL, o.shR, "rgba(255,0,200,0.85)", 2.6);
      bone(o.hipL, o.hipR, "rgba(255,0,200,0.85)", 2.6);
      bone(o.shL, o.hands, G, 3.2);
      bone(o.shR, o.hands, G, 3.2);
      bone(o.hands, o.tip, "rgba(223,238,225,0.92)", 2.6);

      ctx.strokeStyle = G;
      ctx.lineWidth = 3.2 * s * 0.55;
      ctx.beginPath();
      ctx.arc(X(o.head), Y(o.head), 8.5 * s, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "rgba(255,200,0,0.95)";
      for (const q of [o.shL, o.shR, o.hipL, o.hipR, o.hands]) {
        ctx.beginPath();
        ctx.arc(X(q), Y(q), 2.6 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ffd9a8";
      ctx.beginPath();
      ctx.arc(X(o.hands), Y(o.hands), 3.4 * s, 0, Math.PI * 2);
      ctx.fill();

      if (chipRef.current) chipRef.current.textContent = label(p);
      if (barRef.current) barRef.current.style.width = `${Math.round(p * 100)}%`;
      if (hintRef.current) hintRef.current.style.opacity = p > 0.03 ? "0" : "1";
    };

    let raf = 0;
    let pending = false;
    const onScroll = () => {
      if (pending) return;
      pending = true;
      raf = requestAnimationFrame(() => {
        pending = false;
        const sec = sectionRef.current;
        if (!sec) return;
        const rect = sec.getBoundingClientRect();
        const span = rect.height - window.innerHeight;
        if (span <= 0) return;
        draw(Math.max(0, Math.min(1, -rect.top / span)));
      });
    };

    draw(0);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [off]);

  if (off) return null;

  return (
    <section ref={sectionRef} className="scrubsec ghost">
      <div className="pin">
        <p className="ghostlead">Scroll — this is what it does to your swing.</p>
        <div ref={stageRef} className="scrubstage" style={{ aspectRatio: "200 / 230", width: "min(100%, calc(66vh * 0.87))" }}>
          <canvas ref={canvasRef} />
          <div className="scrubbar">
            <div ref={barRef} />
          </div>
          <div className="scrubcap">
            <span ref={chipRef} className="chiplabel">
              ADDRESS
            </span>
          </div>
          <div ref={hintRef} className="scrubhint">
            <span>scroll</span>
            <svg viewBox="0 0 16 22" aria-hidden="true">
              <path d="M8 2 v14 M3 11 l5 6 5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
