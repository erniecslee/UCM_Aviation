// Helpers for normalizing FCOM-derived grid tables (data/processed/performance/*.json)
// into a form src/interp.js can binary-search: strictly ascending numeric axes.
// Source tables are transcribed in whatever order FCOM prints them (often
// descending weight, or string labels like "70C/158F" / "30 & BELOW"), so this
// module parses/reorders without touching the underlying numbers.

function parseAxisValue(v) {
  if (typeof v === "number") return v;
  const m = String(v).match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
}

/** Normalize a 1-axis {row_axis:{values}, data:[...]} leaf to ascending order. */
export function toAscending1D(rowAxis, data) {
  const parsed = rowAxis.values.map(parseAxisValue);
  const order = parsed.map((_, i) => i).sort((a, b) => parsed[a] - parsed[b]);
  return {
    values: order.map((i) => parsed[i]),
    data: order.map((i) => data[i]),
  };
}

/** Normalize a 2-axis {row_axis, col_axis, data} leaf to ascending order on both axes. */
export function toAscending2D(rowAxis, colAxis, data) {
  const rowParsed = rowAxis.values.map(parseAxisValue);
  const rowOrder = rowParsed.map((_, i) => i).sort((a, b) => rowParsed[a] - rowParsed[b]);
  const colParsed = colAxis.values.map(parseAxisValue);
  const colOrder = colParsed.map((_, i) => i).sort((a, b) => colParsed[a] - colParsed[b]);
  const newData = rowOrder.map((ri) => colOrder.map((ci) => data[ri][ci]));
  return {
    row_axis: { values: rowOrder.map((i) => rowParsed[i]) },
    col_axis: { values: colOrder.map((i) => colParsed[i]) },
    data: newData,
  };
}

export { parseAxisValue };
