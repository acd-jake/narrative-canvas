import { describe, expect, it } from "vitest";
import { getSortableDropTarget, SortableListController } from "../scripts/ui/sortable-list-controller.js";

const previousItem = {
  id: "previous",
  index: 0,
  rect: { left: 0, right: 90, top: 0, bottom: 90, width: 90, height: 90 }
};
const nextItem = {
  id: "next",
  index: 1,
  rect: { left: 102, right: 192, top: 0, bottom: 90, width: 90, height: 90 }
};
const listRect = { left: 0, right: 192 };

describe("getSortableDropTarget", () => {
  it("identifies internal sort drags so outer asset dropzones can ignore them", () => {
    const controller = new SortableListController(() => {});

    expect(controller.isInternalDrag({
      dataTransfer: { types: ["application/x-narrative-canvas-sort-item"] }
    })).toBe(true);
    expect(controller.isInternalDrag({
      dataTransfer: { types: ["text/plain"] }
    })).toBe(false);
  });

  it.each([65, 96, 125])("maps pointer x=%i to the gap between adjacent grid items", x => {
    expect(getSortableDropTarget(
      [previousItem, nextItem],
      { x, y: 45 },
      "grid",
      listRect
    )).toEqual({ id: "next", index: 1, position: "before" });
  });

  it.each([65, 96, 125])("uses the same insertion zone for horizontal overlays at x=%i", x => {
    expect(getSortableDropTarget(
      [previousItem, nextItem],
      { x, y: 45 },
      "horizontal",
      listRect
    )).toEqual({ id: "next", index: 1, position: "before" });
  });

  it.each([55, 140])("does not extend the insertion zone to pointer x=%i", x => {
    expect(getSortableDropTarget(
      [previousItem, nextItem],
      { x, y: 45 },
      "grid",
      listRect
    )).toBeNull();
  });

  it("maps the vertical space between scene rows to the next scene", () => {
    const previousScene = {
      id: "scene-a",
      index: null,
      rect: { left: 0, right: 240, top: 0, bottom: 30, width: 240, height: 30 }
    };
    const nextScene = {
      id: "scene-b",
      index: null,
      rect: { left: 0, right: 240, top: 36, bottom: 66, width: 240, height: 30 }
    };

    expect(getSortableDropTarget(
      [previousScene, nextScene],
      { x: 120, y: 33 },
      "vertical",
      { left: 0, right: 240 }
    )).toEqual({ id: "scene-b", index: null, position: "before" });
  });
});
