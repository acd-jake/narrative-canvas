/**
 * Vertical shift of the narrator text box while it is revealed: the part that is already visible
 * is centered in the box, so the first line starts in the middle and the block grows around it.
 * Once the revealed text fills the box the shift is 0 and the auto scroll takes over, which ends
 * with the last line at the bottom. Text that fits entirely ends up centered.
 *
 * @param {{bottom: number, startMs: number}[]} units revealed units with the bottom edge of their row
 * @param {number} boxHeight height of the text box
 * @param {number} revealMs total reveal duration
 * @returns {{offset: number, shift: number}[]} keyframes (offset 0..1, shift in px); empty if no shift is needed
 */
export function computeNarrationShiftFrames(units, boxHeight, revealMs) {
  const frames = [];
  let lastShift = null;
  for (const unit of units) {
    const shift = Math.max(0, (boxHeight - unit.bottom) / 2);
    if (shift === lastShift) continue;
    const offset = revealMs > 0 ? Math.min(1, Math.max(0, unit.startMs / revealMs)) : 0;
    frames.push({ offset, shift });
    lastShift = shift;
  }
  if (!frames.length || frames.every(frame => frame.shift === 0)) return [];

  const last = frames[frames.length - 1];
  if (last.offset < 1) frames.push({ offset: 1, shift: 0 });
  else last.shift = 0;
  return frames;
}
