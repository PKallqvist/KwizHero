import { useEffect, useState } from "react";

export function useCountUp(target: number, durationMs: number, active: boolean): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }
    const start = performance.now();
    let raf: number;
    const tick = (now: number): void => {
      const elapsed = Math.min(now - start, durationMs);
      const progress = elapsed / durationMs;
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (elapsed < durationMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, active]);
  return value;
}
