"use client";

import { useEffect } from "react";
import { useInView } from "./useInView";

export default function CountUp({
  value,
  decimals = 0,
  duration = 850,
}: {
  value: number;
  decimals?: number;
  duration?: number;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.4);

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    if (Number.isNaN(value)) {
      el.textContent = "—";
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const e = Math.min(1, (t - t0) / duration);
      el.textContent = (value * (1 - Math.pow(1 - e, 3))).toFixed(decimals);
      if (e < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, decimals, duration]);

  return (
    <span ref={ref} className="num">
      {Number.isNaN(value) ? "—" : (0).toFixed(decimals)}
    </span>
  );
}
