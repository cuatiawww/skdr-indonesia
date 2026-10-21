// PR 111: great-circle arc helper for the Flight Connection route map.
const RAD = Math.PI / 180;

/**
 * Points along the great circle from [lon1, lat1] to [lon2, lat2] (degrees).
 * Longitudes are unwrapped relative to the origin, so a trans-Pacific route stays one
 * continuous line (values may go beyond ±180; OpenLayers draws them on the next world copy).
 */
export function greatCirclePoints(lon1, lat1, lon2, lat2, segments = 64) {
  const n = Math.max(2, Math.floor(segments));
  const φ1 = lat1 * RAD, λ1 = lon1 * RAD, φ2 = lat2 * RAD, λ2 = lon2 * RAD;
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
  ));
  if (!Number.isFinite(d) || d < 1e-9) return [[lon1, lat1], [lon2, lat2]];
  const out = [];
  let prevLon = lon1;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / RAD;
    let lon = Math.atan2(y, x) / RAD;
    while (lon - prevLon > 180) lon -= 360;
    while (lon - prevLon < -180) lon += 360;
    prevLon = lon;
    out.push([lon, lat]);
  }
  return out;
}

/** Pick the legend band for a degree: bands sorted by min_degree desc, first match wins. */
export function bandForDegree(degree, bands) {
  const sorted = [...(bands || [])].sort((a, b) => b.min_degree - a.min_degree);
  return sorted.find((b) => degree >= b.min_degree) || null;
}
