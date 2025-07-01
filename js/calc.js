export const RA = 20.0;

export function computeRA(latDeg, doy) {
  const GSC = 0.0820; // MJ m^-2 min^-1
  const latRad = (latDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI / 365) * doy);
  const solarDec = 0.409 * Math.sin((2 * Math.PI / 365) * doy - 1.39);
  const ws = Math.acos(-Math.tan(latRad) * Math.tan(solarDec));
  return (
    (24 * 60) / Math.PI *
    GSC *
    dr *
    (ws * Math.sin(latRad) * Math.sin(solarDec) +
      Math.cos(latRad) * Math.cos(solarDec) * Math.sin(ws))
  );
}

export function calculateET0(tmin, tmax, ra = RA) {
  const tavg = (tmin + tmax) / 2;
  return 0.0023 * (tavg + 17.8) * Math.sqrt(Math.max(0, tmax - tmin)) * ra;
}

export function computeArea(diameterCm) {
  const r = diameterCm / 2;
  return Math.PI * r * r;
}
