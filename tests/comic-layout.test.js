import { describe, expect, it } from "vitest";
import { computeComicLayout } from "../scripts/ui/comic-layout.js";

const area = { width: 1600, height: 900, gap: 10, margin: 20 };

describe("computeComicLayout", () => {
  it("keeps aspect ratios and stays inside the stage", () => {
    const ratios = [1.5, 0.75, 1, 2];
    const panels = computeComicLayout(ratios, area);
    panels.forEach((panel, index) => {
      expect((panel.width * area.width) / (panel.height * area.height)).toBeCloseTo(ratios[index], 3);
      expect(panel.left).toBeGreaterThanOrEqual(0);
      expect(panel.top).toBeGreaterThanOrEqual(0);
      expect(panel.left + panel.width).toBeLessThanOrEqual(1);
      expect(panel.top + panel.height).toBeLessThanOrEqual(1);
    });
  });

  it("places panels left to right by default", () => {
    const [first, second] = computeComicLayout([1, 1], area);
    expect(first.left).toBeLessThan(second.left);
  });

  it("mirrors the order for right-to-left reading", () => {
    const [first, second] = computeComicLayout([1, 1], { ...area, direction: "rtl" });
    expect(first.left).toBeGreaterThan(second.left);
  });

  it("returns an empty layout without images", () => {
    expect(computeComicLayout([], area)).toEqual([]);
  });
});
