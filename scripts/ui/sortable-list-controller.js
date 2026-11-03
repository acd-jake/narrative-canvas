const SORT_DRAG_TYPE = "application/x-narrative-canvas-sort-item";

/** Finds the insertion slot between adjacent items using their rendered positions. */
export function getSortableDropTarget(items, { x, y }, axis, listRect) {
  for (let index = 0; index < items.length - 1; index++) {
    const previous = items[index];
    const next = items[index + 1];
    const sameRow = axis === "horizontal"
      || (axis === "grid"
        && Math.abs((previous.rect.top + previous.rect.bottom) / 2
          - (next.rect.top + next.rect.bottom) / 2) <= Math.max(previous.rect.height, next.rect.height) / 2);

    if (sameRow) {
      const startX = previous.rect.right - previous.rect.width / 3;
      const endX = next.rect.left + next.rect.width / 3;
      const top = Math.min(previous.rect.top, next.rect.top);
      const bottom = Math.max(previous.rect.bottom, next.rect.bottom);
      if (x >= startX && x <= endX && y >= top && y <= bottom) {
        return { id: next.id, index: next.index, position: "before" };
      }
      continue;
    }

    const startY = previous.rect.bottom - previous.rect.height / 3;
    const endY = next.rect.top + next.rect.height / 3;
    const startX = axis === "vertical"
      ? Math.min(previous.rect.left, next.rect.left)
      : listRect.left;
    const endX = axis === "vertical"
      ? Math.max(previous.rect.right, next.rect.right)
      : listRect.right;
    if (y >= startY && y <= endY && x >= startX && x <= endX) {
      return { id: next.id, index: next.index, position: "before" };
    }
  }
  return null;
}

/** Handles internal drag sorting for editor lists and animates their new positions. */
export class SortableListController {
  #onReorder;
  #abortController = null;
  #dragPayload = null;

  constructor(onReorder) {
    this.#onReorder = onReorder;
  }

  bind(root) {
    this.#abortController?.abort();
    this.#abortController = new AbortController();
    const { signal } = this.#abortController;

    root.querySelectorAll(".sortable-list").forEach(list => {
      list.addEventListener("dragstart", event => this.#onDragStart(event, list), { signal });
      list.addEventListener("dragover", event => this.#onDragOver(event, list), { signal });
      list.addEventListener("dragleave", event => this.#onDragLeave(event, list), { signal });
      list.addEventListener("drop", event => this.#onDrop(event, list), { signal });
      list.addEventListener("dragend", () => {
        this.#dragPayload = null;
        this.#clearDropIndicators(list, true);
      }, { signal });
    });
  }

  destroy() {
    this.#abortController?.abort();
    this.#abortController = null;
  }

  isInternalDrag(event) {
    return Boolean(this.#dragPayload)
      || Array.from(event.dataTransfer?.types ?? []).includes(SORT_DRAG_TYPE);
  }

  capturePositions(root) {
    const positions = new Map();
    root.querySelectorAll(".sortable-list [data-sortable-id]").forEach(item => {
      const list = item.closest(".sortable-list");
      const key = this.#positionKey(list, item);
      positions.set(key, item.getBoundingClientRect());
    });
    return positions;
  }

  animateReorder(root, previousPositions) {
    const animatedItems = [];
    root.querySelectorAll(".sortable-list [data-sortable-id]").forEach(item => {
      const list = item.closest(".sortable-list");
      const previous = previousPositions.get(this.#positionKey(list, item));
      if (!previous) return;

      const current = item.getBoundingClientRect();
      const deltaX = previous.left - current.left;
      const deltaY = previous.top - current.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

      item.style.transition = "none";
      item.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      animatedItems.push(item);
    });

    if (!animatedItems.length) return;
    void root.offsetHeight;
    requestAnimationFrame(() => {
      for (const item of animatedItems) {
        item.style.transition = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        item.style.transform = "";
      }
      window.setTimeout(() => {
        for (const item of animatedItems) item.style.transition = "";
      }, 240);
    });
  }

  #onDragStart(event, list) {
    const item = this.#sortableItem(event.target, list);
    if (!item || !event.dataTransfer) return;

    const payload = {
      list: list.dataset.sortableList,
      sceneId: list.dataset.sortableSceneId ?? "",
      id: item.dataset.sortableId,
      index: item.dataset.sortableIndex ?? null
    };
    this.#dragPayload = payload;
    event.dataTransfer.setData(SORT_DRAG_TYPE, JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
    item.classList.add("is-sorting");
  }

  #onDragOver(event, list) {
    if (this.isInternalDrag(event)) event.stopPropagation();
    const payload = this.#readPayload(event);
    if (!this.#canSortInto(payload, list)) return;

    const target = this.#resolveDropTarget(event, list, payload);
    if (!target || target.id === payload.id) return;

    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    this.#clearDropIndicators(list);
    const targetElement = list.querySelector(`[data-sortable-id="${CSS.escape(target.id)}"]`);
    if (!targetElement) return;
    targetElement.dataset.sortPosition = target.position;
    targetElement.classList.add(`sort-target-${target.position}`);
  }

  #onDragLeave(event, list) {
    if (this.isInternalDrag(event)) event.stopPropagation();
    if (event.relatedTarget instanceof Node && list.contains(event.relatedTarget)) return;
    this.#clearDropIndicators(list);
  }

  async #onDrop(event, list) {
    const payload = this.#readPayload(event);
    if (!this.#canSortInto(payload, list)) return;

    const target = this.#resolveDropTarget(event, list, payload);
    if (!target || target.id === payload.id) return;

    event.preventDefault();
    event.stopPropagation();
    this.#dragPayload = null;
    await this.#onReorder({
      list: payload.list,
      sceneId: payload.sceneId,
      sourceId: payload.id,
      sourceIndex: payload.index,
      targetId: target.id,
      targetIndex: target.index ?? null,
      position: target.position
    });
    this.#clearDropIndicators(list);
  }

  #readPayload(event) {
    if (this.#dragPayload) return this.#dragPayload;
    const raw = event.dataTransfer?.getData(SORT_DRAG_TYPE);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  #canSortInto(payload, list) {
    return Boolean(payload)
      && payload.list === list.dataset.sortableList
      && payload.sceneId === (list.dataset.sortableSceneId ?? "");
  }

  #sortableItem(target, list) {
    if (!(target instanceof Element)) return null;
    const item = target.closest("[data-sortable-id]");
    return item && list.contains(item) ? item : null;
  }

  #resolveDropTarget(event, list, payload) {
    const items = Array.from(list.querySelectorAll("[data-sortable-id]"))
      .filter(item => item.closest(".sortable-list") === list && item.dataset.sortableId !== payload.id)
      .map(item => ({
        id: item.dataset.sortableId,
        index: item.dataset.sortableIndex ?? null,
        rect: item.getBoundingClientRect()
      }));
    const slot = getSortableDropTarget(
      items,
      { x: event.clientX, y: event.clientY },
      list.dataset.sortableAxis,
      list.getBoundingClientRect()
    );
    if (slot) return slot;

    const item = this.#sortableItem(event.target, list);
    if (!item || item.dataset.sortableId === payload.id) return null;
    return {
      id: item.dataset.sortableId,
      index: item.dataset.sortableIndex ?? null,
      position: this.#getPosition(event, item, list.dataset.sortableAxis)
    };
  }

  #getPosition(event, item, axis) {
    const rect = item.getBoundingClientRect();
    const offsetX = event.clientX - rect.left - rect.width / 2;
    const offsetY = event.clientY - rect.top - rect.height / 2;
    const horizontal = axis === "horizontal"
      || (axis === "grid" && Math.abs(offsetX / Math.max(rect.width, 1))
        > Math.abs(offsetY / Math.max(rect.height, 1)));
    return horizontal
      ? offsetX < 0 ? "before" : "after"
      : offsetY < 0 ? "before" : "after";
  }

  #positionKey(list, item) {
    return `${list.dataset.sortableList}:${list.dataset.sortableSceneId ?? ""}:${item.dataset.sortableId}`;
  }

  #clearDropIndicators(list, clearDraggedItem = false) {
    list.querySelectorAll(".sort-target-before, .sort-target-after").forEach(item => {
      item.classList.remove("sort-target-before", "sort-target-after");
      delete item.dataset.sortPosition;
    });
    if (clearDraggedItem) {
      list.querySelectorAll(".is-sorting").forEach(item => item.classList.remove("is-sorting"));
    }
  }
}
