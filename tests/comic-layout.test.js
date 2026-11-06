import { describe, expect, it } from "vitest";
import { computeComicLayout } from "../scripts/ui/layout/handout/comic-handout-layout.js";
import { LayoutRegistry } from "../scripts/ui/layout/layout-registry.js";

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

  it("never puts more images in a row than allowed", () => {
    const panels = computeComicLayout([1, 1, 1, 1, 1], { ...area, maxPerRow: 2 });
    const perRow = new Map();
    panels.forEach(panel => perRow.set(panel.top, (perRow.get(panel.top) ?? 0) + 1));
    expect(Math.max(...perRow.values())).toBeLessThanOrEqual(2);
  });

  it("limits a row to the configured width share", () => {
    const panels = computeComicLayout([2, 2], { ...area, height: 4000, maxWidthRatio: 0.5 });
    const right = Math.max(...panels.map(panel => panel.left + panel.width));
    const left = Math.min(...panels.map(panel => panel.left));
    expect(right - left).toBeLessThanOrEqual(0.5 + 1e-6);
  });

  it("returns an empty layout without images", () => {
    expect(computeComicLayout([], area)).toEqual([]);
  });
});

describe("LayoutRegistry", () => {
  it("falls back to the default strategy for unknown ids", () => {
    expect(LayoutRegistry.create("handout", "nope").constructor.id).toBe("free");
    expect(LayoutRegistry.create("actor", "nope").constructor.id).toBe("row");
  });

  it("leaves placement to CSS for the row strategy", () => {
    const row = LayoutRegistry.create("actor", "row");
    expect(row.isManual).toBe(true);
    expect(row.compute([{ id: "a" }], { width: 1, height: 1 })).toBeNull();
  });

  it.each(["speaker-center", "arc", "stacked"])("places every actor with %s", id => {
    const layout = LayoutRegistry.create("actor", id);
    const items = [{ id: "a" }, { id: "b", isSpeaker: true }, { id: "c" }];
    const placements = layout.compute(items, { width: 1000, height: 500 });
    expect(placements).toHaveLength(items.length);
    placements.forEach(placement => {
      expect(placement.x).toBeGreaterThan(0);
      expect(placement.x).toBeLessThan(1);
    });
  });

  it("attaches actors alternately to the right and left in the alternating strategy", () => {
    const layout = LayoutRegistry.create("actor", "alternating");
    const [a, b, c, d] = layout.compute([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], {});
    expect([c.x, a.x, b.x, d.x]).toEqual([...[c.x, a.x, b.x, d.x]].sort((x, y) => x - y));
  });

  it("centers the speaker in the speaker-center strategy", () => {
    const layout = LayoutRegistry.create("actor", "speaker-center");
    const placements = layout.compute([{ id: "a" }, { id: "b", isSpeaker: true }, { id: "c" }], {});
    expect(placements[1].x).toBe(0.5);
    expect(placements[0].x).toBeLessThan(0.5);
    expect(placements[2].x).toBeGreaterThan(0.5);
  });
});
