const FALLBACK_RATIO = 1.5;
const MAX_ENUMERATED_IMAGES = 16;

/** Yields every way to split `count` consecutive items into rows of at most `maxPerRow` items. */
function* enumerateRowSizes(count, maxPerRow, prefix = []) {
  if (count === 0) {
    yield prefix;
    return;
  }
  for (let size = 1; size <= Math.min(maxPerRow, count); size++) {
    yield* enumerateRowSizes(count - size, maxPerRow, [...prefix, size]);
  }
}

function chunkRowSizes(count, maxPerRow) {
  const sizes = [];
  for (let remaining = count; remaining > 0; remaining -= maxPerRow) sizes.push(Math.min(maxPerRow, remaining));
  return sizes;
}

function fitRows(rowSizes, ratios, width, height, gap) {
  let start = 0;
  const rows = rowSizes.map(size => ratios.slice(start, (start += size)));
  const rowHeights = rows.map(row => (width - (row.length - 1) * gap) / row.reduce((sum, ratio) => sum + ratio, 0));
  const heightSum = rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0);
  const scale = Math.min(1, (height - (rows.length - 1) * gap) / heightSum);
  const area = rows.reduce((sum, row, index) => (
    sum + (rowHeights[index] * scale) ** 2 * row.reduce((acc, ratio) => acc + ratio, 0)
  ), 0);
  return { rowSizes, rowHeights, scale, area };
}

/**
 * Packs images into comic-style rows that preserve each aspect ratio.
 * Each row spans at most `maxWidthRatio` of the stage width and holds at most `maxPerRow` images.
 * @param {number[]} ratios - width / height per image, in reading order.
 * @param {{ width: number, height: number, gap?: number, margin?: number, direction?: "ltr"|"rtl", maxWidthRatio?: number, maxPerRow?: number }} options
 * @returns {{ left: number, top: number, width: number, height: number }[]} Stage fractions in input order.
 */
export function computeComicLayout(ratios, {
  width, height, gap = 12, margin = 24, direction = "ltr", maxWidthRatio = 1, maxPerRow = Infinity
}) {
  if (!ratios.length || width <= 0 || height <= 0) return [];
  const safeRatios = ratios.map(ratio => (Number.isFinite(ratio) && ratio > 0 ? ratio : FALLBACK_RATIO));
  const perRow = Math.max(1, Math.min(maxPerRow, safeRatios.length));
  const innerWidth = Math.max(1, Math.min(width - margin * 2, width * maxWidthRatio));
  const innerHeight = Math.max(1, height - margin * 2);
  const originX = (width - innerWidth) / 2;

  const candidates = safeRatios.length <= MAX_ENUMERATED_IMAGES
    ? enumerateRowSizes(safeRatios.length, perRow)
    : [chunkRowSizes(safeRatios.length, perRow)];
  let best = null;
  for (const rowSizes of candidates) {
    const fit = fitRows(rowSizes, safeRatios, innerWidth, innerHeight, gap);
    if (!best || fit.area > best.area + 1e-6) best = fit;
  }

  const rowHeights = best.rowHeights.map(rowHeight => rowHeight * best.scale);
  const contentHeight = rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0) + (rowHeights.length - 1) * gap;
  const result = new Array(safeRatios.length);
  let top = margin + (innerHeight - contentHeight) / 2;
  let index = 0;

  best.rowSizes.forEach((size, rowIndex) => {
    const rowHeight = rowHeights[rowIndex];
    const widths = safeRatios.slice(index, index + size).map(ratio => ratio * rowHeight);
    const rowWidth = widths.reduce((sum, value) => sum + value, 0) + (size - 1) * gap;
    let left = originX + (innerWidth - rowWidth) / 2;
    widths.forEach(panelWidth => {
      const panelLeft = direction === "rtl" ? width - left - panelWidth : left;
      result[index++] = {
        left: panelLeft / width,
        top: top / height,
        width: panelWidth / width,
        height: rowHeight / height
      };
      left += panelWidth + gap;
    });
    top += rowHeight + gap;
  });

  return result;
}
