// Datumslogik: nur Kalendertage (ISO "JJJJ-MM-TT"), nie Uhrzeiten. Dadurch immun gegen Zeitumstellung.
export const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const utc = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const iso = (t) => t.toISOString().slice(0, 10);

export const addDays = (isoDate, n) => iso(new Date(utc(isoDate).getTime() + n * 86400000));
export const diffDays = (a, b) => Math.round((utc(b).getTime() - utc(a).getTime()) / 86400000);
// Montag = 0 ... Sonntag = 6
export const weekdayIndex = (isoDate) => (utc(isoDate).getUTCDay() + 6) % 7;
export const formatDE = (isoDate) => {
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
};

export function weekDays(startIso) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(startIso, i);
    const w = weekdayIndex(d);
    out.push({ datum: d, wochentag: WOCHENTAGE[w], kurz: KURZ[w], anzeige: `${KURZ[w]} ${formatDE(d)}` });
  }
  return out;
}

// "Heute" als Kalendertag in Europe/Berlin. clock.now() liefert ein Date (in Tests eine Fake-Clock).
export const systemClock = { now: () => new Date() };
export function todayIso(clock = systemClock, timeZone = 'Europe/Berlin') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(clock.now());
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
export const fakeClock = (isoDateTime) => ({ now: () => new Date(isoDateTime) });
