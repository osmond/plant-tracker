export function parseLocalDate(date) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(date);
}

export function addDays(date, days) {
  const d = parseLocalDate(date);
  const incr = parseInt(days, 10);
  if (!isNaN(incr)) {
    d.setDate(d.getDate() + incr);
  }
  return d;
}

export function formatDateShort(dateStr) {
  if (!dateStr) return 'never';
  const d = parseLocalDate(dateStr);
  if (isNaN(d)) return dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayToFormat = new Date(d);
  dayToFormat.setHours(0, 0, 0, 0);
  const diff = Math.round((dayToFormat - today) / 86400000);
  const short = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (diff === 0) return `${short} \u2013 today`;
  if (diff === -1) return `${short} \u2013 yesterday`;
  if (diff === 1) return `${short} \u2013 tomorrow`;
  return short;
}
