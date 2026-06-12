"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Analysis } from "@/lib/analysis";
import { L_WRIST, R_WRIST } from "@/lib/analysis";
import type { Extraction } from "@/lib/pose";
import { drawPose, drawGeometry, drawTrail } from "@/lib/draw";

// Apple-style pinned hero: scrolling scrubs through pre-captured stills of the
// swing with the skeleton + hand tracer drawn on top. No video seeks at scroll
// time, so it stays smooth on phones.
export default function ScrubHero({ extraction, analysis }: { extraction: Extraction; analysis: Analysis }) {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chipRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [off, setOff] = useState(false);

  const trail = useMemo(
    () =>
      extraction.frames.map((f) =>
        f ? ([(f[L_WRIST].x + f[R_WRIST].x) / 2, (f[L_WRIST].y + f[R_WRIST].y) / 2] as [number, number]) : null
      ),
    [extraction]
  );

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setOff(true);
  }, []);

  useEffect(() => {
    if (off) return;
    const scrubs = extraction.scrubs;
    if (scrubs.length < 6) return;

    const imgs: HTMLImageElement[] = scrubs.map((s) => {
      const im = new Image();
      im.src = s.url;
      return im;
    });

    let lastK = -1;
    const label = (i: number) => {
      const p = analysis.phases;
      if (i <= p.address + 1) return "ADDRESS";
      if (i < p.top - 1) return "BACKSWING";
      if (i <= p.top + 1) return "TOP";
      if (i < p.impact - 1) return "DOWNSWING";
      if (i <= p.impact + 1) return "IMPACT";
      if (i < p.finish - 1) return "FOLLOW-THROUGH";
      return "FINISH";
    };

    const draw = (k: number, prog: number) => {
      const c = canvasRef.current;
      const stage = stageRef.current;
      const img = imgs[k];
      if (!c || !stage || !img || !img.complete || !img.naturalWidth) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.min(Math.round(stage.clientWidth * dpr), 1080);
      const chh = Math.round((cw * extraction.height) / Math.max(1, extraction.width));
      if (c.width !== cw || c.height !== chh) {
        c.width = cw;
        c.height = chh;
      }
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const exIdx = scrubs[k].idx;
      drawTrail(ctx, trail, exIdx, c.width, c.height);
      const fr = extraction.frames[exIdx];
      if (fr) {
        drawPose(ctx, fr, c.width, c.height);
        drawGeometry(ctx, fr, c.width, c.height);
      }
      if (chipRef.current) chipRef.current.textContent = label(exIdx);
      if (timeRef.current)
        timeRef.current.textContent = `${(extraction.times[exIdx] - extraction.times[0]).toFixed(2)}s`;
      if (barRef.current) barRef.current.style.width = `${Math.round(prog * 100)}%`;
      if (hintRef.current) hintRef.current.style.opacity = prog > 0.04 ? "0" : "1";
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
        const p = Math.max(0, Math.min(1, -rect.top / span));
        const k = Math.round(p * (scrubs.length - 1));
        if (k !== lastK) {
          lastK = k;
          draw(k, p);
        } else if (barRef.current) {
          barRef.current.style.width = `${Math.round(p * 100)}%`;
          if (hintRef.current) hintRef.current.style.opacity = p > 0.04 ? "0" : "1";
        }
      });
    };

    imgs[0].onload = () => draw(0, 0);
    if (imgs[0].complete) draw(0, 0);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [extraction, analysis, trail, off]);

  if (off || extraction.scrubs.length < 6) return null;

  const ar = extraction.width / Math.max(1, extraction.height);

  return (
    <section ref={sectionRef} className="scrubsec">
      <div className="pin">
        <div
          ref={stageRef}
          className="scrubstage"
          style={{
            aspectRatio: `${extraction.width} / ${extraction.height}`,
            width: `min(100%, calc(74vh * ${ar.toFixed(4)}))`,
          }}
        >
          <canvas ref={canvasRef} />
          <div className="scrubbar">
            <div ref={barRef} />
          </div>
          <div className="scrubcap">
            <span ref={chipRef} className="chiplabel">
              ADDRESS
            </span>
            <span ref={timeRef} className="num t">
              0.00s
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
