// Small to-scale runway diagram, inspired by the real OPT's "Rwy Graphic" toggle:
// a bar for the runway, a wind arrow relative to the runway heading, and
// (for landing) a stop-point marker showing where the computed landing
// distance falls against the available runway length.

const VB_W = 600;
const VB_H = 110;
const PAD = 24;
const BAR_Y = 55;
const BAR_H = 22;

function windArrow(windDir, windSpeedKt, runwayHeadingTrue) {
  if (windDir == null || Number.isNaN(windDir) || runwayHeadingTrue == null) return "";
  // Arrow points in the direction the wind is blowing TOWARD, relative to the
  // runway drawn left-to-right along its heading.
  const relDeg = ((windDir - runwayHeadingTrue + 180) % 360 + 360) % 360;
  const rad = (relDeg * Math.PI) / 180;
  const cx = VB_W / 2;
  const cy = 20;
  const len = 14;
  const dx = Math.sin(rad) * len;
  const dy = -Math.cos(rad) * len;
  const label = windSpeedKt != null && !Number.isNaN(windSpeedKt) ? `${Math.round(windSpeedKt)} kt` : "";
  return `
    <g transform="translate(${cx},${cy})">
      <line x1="${-dx}" y1="${-dy}" x2="${dx}" y2="${dy}" stroke="var(--muted)" stroke-width="2" marker-end="url(#arrowhead)" />
      <text x="18" y="4" font-size="9" fill="var(--muted)">${label}</text>
    </g>`;
}

export function buildRunwaySVG({ lengthFt, windDir, windSpeedKt, runwayHeadingTrue, markerFt, markerLabel }) {
  const barW = VB_W - PAD * 2;
  const len = lengthFt || 1;
  const markerX = markerFt != null ? PAD + Math.min(markerFt / len, 1.15) * barW : null;
  const overrun = markerFt != null && markerFt > len;
  const markerColor = overrun ? "var(--amber)" : "var(--green)";

  return `
  <svg viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill="var(--muted)" />
      </marker>
    </defs>
    ${windArrow(windDir, windSpeedKt, runwayHeadingTrue)}
    <rect x="${PAD}" y="${BAR_Y}" width="${barW}" height="${BAR_H}" rx="3" fill="#1a2128" stroke="var(--border)" />
    <line x1="${PAD}" y1="${BAR_Y}" x2="${PAD}" y2="${BAR_Y + BAR_H}" stroke="var(--text)" stroke-width="2" />
    <line x1="${PAD + barW}" y1="${BAR_Y}" x2="${PAD + barW}" y2="${BAR_Y + BAR_H}" stroke="var(--text)" stroke-width="2" />
    <text x="${PAD}" y="${BAR_Y + BAR_H + 14}" font-size="9" fill="var(--muted)">0</text>
    <text x="${PAD + barW}" y="${BAR_Y + BAR_H + 14}" font-size="9" text-anchor="end" fill="var(--muted)">${Math.round(len)} ft</text>
    ${
      markerX != null
        ? `<line x1="${markerX}" y1="${BAR_Y - 6}" x2="${markerX}" y2="${BAR_Y + BAR_H + 6}" stroke="${markerColor}" stroke-width="2.5" />
           <text x="${markerX}" y="${BAR_Y - 10}" font-size="9" text-anchor="middle" fill="${markerColor}">${markerLabel ?? ""}</text>`
        : ""
    }
  </svg>`;
}
