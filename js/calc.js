export const RA = 20.0;

export function calculateET0(tmin, tmax, ra = RA) {
  const tavg = (tmin + tmax) / 2;
  return 0.0023 * (tavg + 17.8) * Math.sqrt(Math.max(0, tmax - tmin)) * ra;
}

export function computeArea(diameterCm) {
  const r = diameterCm / 2;
  return Math.PI * r * r;
}
