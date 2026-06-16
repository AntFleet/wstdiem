import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { DwellCountdown } from "./DwellCountdown.js";

describe("DwellCountdown", () => {
  let rafCallbacks: Array<{ id: number; cb: FrameRequestCallback }> = [];
  let nextId = 1;
  let nowMs = 0;
  const realRaf = window.requestAnimationFrame;
  const realCancel = window.cancelAnimationFrame;
  const realPerfNow = performance.now.bind(performance);

  beforeEach(() => {
    rafCallbacks = [];
    nextId = 1;
    nowMs = 0;
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = nextId++;
      rafCallbacks.push({ id, cb });
      return id;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => {
      rafCallbacks = rafCallbacks.filter((r) => r.id !== id);
    }) as typeof window.cancelAnimationFrame;
    performance.now = () => nowMs;
  });

  afterEach(() => {
    window.requestAnimationFrame = realRaf;
    window.cancelAnimationFrame = realCancel;
    performance.now = realPerfNow;
  });

  function flushFrames(steps: number, dtMs: number): void {
    for (let i = 0; i < steps; i++) {
      nowMs += dtMs;
      const batch = rafCallbacks;
      rafCallbacks = [];
      for (const { cb } of batch) {
        act(() => cb(nowMs));
      }
    }
  }

  it("renders nothing when armed is false", () => {
    const onElapsed = vi.fn();
    const { container } = render(
      <DwellCountdown armed={false} onElapsed={onElapsed} />,
    );
    expect(container.firstChild).toBeNull();
    expect(onElapsed).not.toHaveBeenCalled();
  });

  it("clamps duration to PROTOCOL.md minimum 3000ms even if a smaller value is supplied", () => {
    const onElapsed = vi.fn();
    render(
      <DwellCountdown armed={true} durationMs={500} onElapsed={onElapsed} />,
    );
    const el = screen.getByTestId("dwell-countdown");
    expect(el.dataset.durationMs).toBe("3000");
  });

  it("fires onElapsed exactly once after 3000ms with armed=true", () => {
    const onElapsed = vi.fn();
    render(<DwellCountdown armed={true} onElapsed={onElapsed} />);
    // 30 frames × 100ms = 3000ms — final frame should fire onElapsed.
    flushFrames(30, 100);
    expect(onElapsed).toHaveBeenCalledTimes(1);
    // Additional frames must not re-fire (no raf scheduled after completion).
    flushFrames(10, 100);
    expect(onElapsed).toHaveBeenCalledTimes(1);
  });

  it("marks data-elapsed=true once the countdown completes", () => {
    const onElapsed = vi.fn();
    render(<DwellCountdown armed={true} onElapsed={onElapsed} />);
    flushFrames(30, 100);
    expect(screen.getByTestId("dwell-countdown").dataset.elapsed).toBe(
      "true",
    );
  });
});
