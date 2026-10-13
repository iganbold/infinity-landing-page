/**
 * Lemniscate of Bernoulli as one continuous SVG path, so a stroke can travel
 * the whole figure-eight without a seam. Centered in a w × h box.
 */
export function infinityPath(w: number, h: number, steps = 240): string {
  const a = w / 2;
  const cx = w / 2;
  const cy = h / 2;
  // The raw curve spans y in ±a/(2√2); scale y to fill the box height.
  const sy = h / 2 / (a / (2 * Math.SQRT2));
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const s = Math.sin(t);
    const d = 1 + s * s;
    const x = cx + (a * Math.cos(t)) / d;
    const y = cy + ((a * s * Math.cos(t)) / d) * sy;
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

/** A point on the same curve, for placing labels. t in [0, 1). */
export function infinityPoint(w: number, h: number, t: number): { x: number; y: number } {
  const a = w / 2;
  const sy = h / 2 / (a / (2 * Math.SQRT2));
  const r = t * Math.PI * 2;
  const s = Math.sin(r);
  const d = 1 + s * s;
  return { x: w / 2 + (a * Math.cos(r)) / d, y: h / 2 + ((a * s * Math.cos(r)) / d) * sy };
}
