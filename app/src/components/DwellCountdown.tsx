// DwellCountdown — animated ≥3-second countdown bar. PROTOCOL.md §6.3.
//
// Starts when `armed` flips to true. The sign button gates on `elapsed`
// transitioning to true. Disarming (e.g. user unchecking a per-bit row)
// resets the timer and the elapsed flag.

import { useEffect, useRef, useState } from "react";

interface DwellCountdownProps {
  /** When true, the countdown is running. Flipping back to false resets. */
  armed: boolean;
  /** Total dwell time in ms. PROTOCOL.md §6.3 mandates ≥ 3000ms. */
  durationMs?: number;
  /** Fired when the dwell elapses (called once per arm cycle). */
  onElapsed: () => void;
}

const MIN_DWELL_MS = 3000;

export function DwellCountdown(props: DwellCountdownProps): JSX.Element | null {
  const duration = Math.max(
    MIN_DWELL_MS,
    props.durationMs ?? MIN_DWELL_MS,
  );
  const [progress, setProgress] = useState(0);
  const onElapsedRef = useRef(props.onElapsed);
  onElapsedRef.current = props.onElapsed;

  useEffect(() => {
    if (!props.armed) {
      setProgress(0);
      return;
    }
    const startedAt = performance.now();
    let raf = 0;
    let fired = false;
    const tick = (now: number): void => {
      const elapsed = now - startedAt;
      const pct = Math.min(1, elapsed / duration);
      setProgress(pct);
      if (pct >= 1) {
        if (!fired) {
          fired = true;
          onElapsedRef.current();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [props.armed, duration]);

  if (!props.armed) return null;
  const remainingMs = Math.max(0, duration - progress * duration);
  const remainingSec = (remainingMs / 1000).toFixed(1);
  const elapsed = progress >= 1;
  return (
    <div
      data-testid="dwell-countdown"
      data-armed="true"
      data-elapsed={elapsed}
      data-duration-ms={duration}
      className="space-y-1"
      aria-live="polite"
    >
      <div className="h-2 overflow-hidden rounded-full bg-warning-surface">
        <div
          className="h-full bg-warning-border transition-[width] duration-100"
          style={{ width: `${(progress * 100).toFixed(2)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-warning-text">
        <span>Sign button enables in</span>
        <span className="font-mono">
          {elapsed ? "0.0s — ready" : `${remainingSec}s`}
        </span>
      </div>
    </div>
  );
}
