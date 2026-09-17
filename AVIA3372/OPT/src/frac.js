// FCOM stab trim values are published as mixed-number strings ("8 1/2") in
// quarter-unit increments. Parse for interpolation, format back for display.

export function parseFraction(s) {
  if (typeof s === "number") return s;
  const parts = String(s).trim().split(" ");
  let whole = 0;
  let fracPart = parts[parts.length - 1];
  if (parts.length > 1) whole = parseFloat(parts[0]);
  if (fracPart.includes("/")) {
    const [n, d] = fracPart.split("/").map(Number);
    return whole + n / d;
  }
  return parseFloat(fracPart);
}

export function formatQuarter(value) {
  if (value == null || Number.isNaN(value)) return null;
  const rounded = Math.round(value * 4) / 4;
  const whole = Math.trunc(rounded);
  const frac = Math.abs(rounded - whole);
  const fracLabel = { 0: "", 0.25: " 1/4", 0.5: " 1/2", 0.75: " 3/4" }[frac] ?? "";
  if (whole === 0 && fracLabel) return fracLabel.trim();
  return `${whole}${fracLabel}`;
}
