import { describe, expect, it } from "vitest";
import { computeNarrationShiftFrames } from "../scripts/ui/narration-layout.js";

const LINE = 30;
const rows = (count, startEvery = 1000) =>
  Array.from({ length: count }, (_, index) => ({ bottom: (index + 1) * LINE, startMs: index * startEvery }));

describe("computeNarrationShiftFrames", () => {
  it("centers the first line in the box", () => {
    const units = rows(3);
    const frames = computeNarrationShiftFrames(units, 3 * LINE, 3000);

    expect(frames[0]).toEqual({ offset: 0, shift: (3 * LINE - LINE) / 2 });
  });

  it("moves the text up while more lines appear", () => {
    const frames = computeNarrationShiftFrames(rows(4), 4 * LINE, 4000);
    const shifts = frames.map(frame => frame.shift);

    expect(shifts).toEqual([...shifts].sort((a, b) => b - a));
    expect(shifts[0]).toBeGreaterThan(shifts[shifts.length - 1]);
  });

  it("ends a short text that fits completely at the centered position", () => {
    const frames = computeNarrationShiftFrames(rows(3), 3 * LINE, 3000);
    const last = frames[frames.length - 1];

    expect(last).toEqual({ offset: 1, shift: 0 });
  });

  it("stops shifting once the revealed text fills the box so the scroll takes over", () => {
    const boxHeight = 4 * LINE;
    const frames = computeNarrationShiftFrames(rows(10), boxHeight, 10000);
    const filled = frames.filter(frame => frame.offset >= 3000 / 10000);

    expect(filled.every(frame => frame.shift === 0)).toBe(true);
    expect(frames.filter(frame => frame.shift > 0).length).toBeGreaterThan(0);
  });

  it("does not shift a first paragraph that already fills the box", () => {
    const units = [{ bottom: 5 * LINE, startMs: 0 }, { bottom: 8 * LINE, startMs: 2000 }];

    expect(computeNarrationShiftFrames(units, 4 * LINE, 3000)).toEqual([]);
  });

  it("uses offsets within 0..1 in ascending order", () => {
    const frames = computeNarrationShiftFrames(rows(6), 6 * LINE, 6500);
    const offsets = frames.map(frame => frame.offset);

    expect(Math.min(...offsets)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...offsets)).toBeLessThanOrEqual(1);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });

  it("returns no frames without units", () => {
    expect(computeNarrationShiftFrames([], 100, 1000)).toEqual([]);
  });
});
