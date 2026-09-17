// Generic lookup/interpolation helpers for FCOM/QRH-style grid tables.
// Table shape (see data/processed/performance/_schema.md):
//   { row_axis: {values:[...]}, col_axis: {values:[...]}, data: [[...]] }
// Values are clamped to the table's published envelope (no extrapolation
// beyond the last row/col) since Boeing charts aren't valid outside their
// printed range — callers should treat a clamped result as "at/beyond chart
// limit" for display purposes.

export function findBracket(values, x) {
  const n = values.length;
  if (x <= values[0]) return { lo: 0, hi: 0, frac: 0, clamped: x < values[0] };
  if (x >= values[n - 1]) return { lo: n - 1, hi: n - 1, frac: 0, clamped: x > values[n - 1] };
  for (let i = 0; i < n - 1; i++) {
    if (x >= values[i] && x <= values[i + 1]) {
      const span = values[i + 1] - values[i];
      const frac = span === 0 ? 0 : (x - values[i]) / span;
      return { lo: i, hi: i + 1, frac, clamped: false };
    }
  }
  return { lo: n - 1, hi: n - 1, frac: 0, clamped: false };
}

function lerp(a, b, frac) {
  if (a == null || b == null) return a ?? b ?? null;
  return a + (b - a) * frac;
}

/** 1D lookup: axis = {values:[...]}, data = [...] parallel to values. */
export function lookup1D(axisValues, data, x) {
  const { lo, hi, frac, clamped } = findBracket(axisValues, x);
  const v = lerp(data[lo], data[hi], frac);
  return { value: v, clamped };
}

/** 2D grid lookup on a table object {row_axis, col_axis, data}. */
export function lookup2D(table, rowX, colX) {
  const r = findBracket(table.row_axis.values, rowX);
  const c = findBracket(table.col_axis.values, colX);
  const v00 = table.data[r.lo]?.[c.lo];
  const v01 = table.data[r.lo]?.[c.hi];
  const v10 = table.data[r.hi]?.[c.lo];
  const v11 = table.data[r.hi]?.[c.hi];
  const top = lerp(v00, v01, c.frac);
  const bottom = lerp(v10, v11, c.frac);
  const value = lerp(top, bottom, r.frac);
  return { value, clamped: r.clamped || c.clamped, hasNulls: [v00, v01, v10, v11].some((v) => v == null) };
}

/** Pick the nearest published axis value <= target that isn't beyond range (for tables indexed by discrete bins like pressure altitude blocks). */
export function nearestAtOrBelow(values, x) {
  let best = values[0];
  for (const v of values) {
    if (v <= x) best = v;
  }
  return best;
}

/** Interpolate a value across an array of same-shaped grid tables keyed by a third axis (e.g. pressure altitude blocks). */
export function lookup3D(blocks, thirdAxisKey, thirdX, rowX, colX) {
  const sorted = [...blocks].sort((a, b) => a[thirdAxisKey] - b[thirdAxisKey]);
  const xs = sorted.map((b) => b[thirdAxisKey]);
  const { lo, hi, frac } = findBracket(xs, thirdX);
  const lowRes = lookup2D(sorted[lo], rowX, colX);
  if (lo === hi) return lowRes;
  const highRes = lookup2D(sorted[hi], rowX, colX);
  return {
    value: lerp(lowRes.value, highRes.value, frac),
    clamped: lowRes.clamped || highRes.clamped,
    hasNulls: lowRes.hasNulls || highRes.hasNulls,
  };
}
