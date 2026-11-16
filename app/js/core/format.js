// Anzeige-Hilfen: deutsche Zahlen, Uhrzeiten und Zeitstempel (Europe/Berlin)
export function deNum(n, maxDec = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '';
  const f = 10 ** maxDec;
  const r = Math.round(Number(n) * f) / f;
  const [i, d] = Math.abs(r).toFixed(maxDec).split('.');
  const dec = (d || '').replace(/0+$/, '');
  return (r < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? ',' + dec : '');
}

const parts = (date, tz, opts) => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', ...opts }).formatToParts(date);
  return (t) => p.find((x) => x.type === t)?.value;
};

/** "2026-11-14T09:30:00" in Europe/Berlin */
export function stampBerlin(date, tz = 'Europe/Berlin') {
  const g = parts(date, tz, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}`;
}
/** "14:32" in Europe/Berlin */
export function timeHM(date, tz = 'Europe/Berlin') {
  const g = parts(date, tz, { hour: '2-digit', minute: '2-digit' });
  return `${g('hour')}:${g('minute')}`;
}

export const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
