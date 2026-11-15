// Exakte Bruchrechnung mit BigInt. Verhindert Gleitkomma-Fehler bei Mengen, Summen und Rundung.
const gcd = (a, b) => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};

export class Fr {
  constructor(n, d = 1n) {
    if (d === 0n) throw new RangeError('Nenner 0');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d) || 1n;
    this.n = n / g;
    this.d = d / g;
  }
  static of(n, d = 1) { return new Fr(BigInt(n), BigInt(d)); }
  // Dezimalzahl als Text ("1.5", "250", "1e-7") exakt einlesen
  static parseDecimal(str) {
    const m = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(String(str).trim());
    if (!m) throw new SyntaxError('keine Zahl: ' + str);
    const frac = m[3] || '';
    let n = BigInt(m[2] + frac);
    let d = 10n ** BigInt(frac.length);
    const e = m[4] ? parseInt(m[4], 10) : 0;
    if (e > 0) n *= 10n ** BigInt(e); else if (e < 0) d *= 10n ** BigInt(-e);
    if (m[1] === '-') n = -n;
    return new Fr(n, d);
  }
  add(o) { return new Fr(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { return new Fr(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { return new Fr(this.n * o.n, this.d * o.d); }
  div(o) { return new Fr(this.n * o.d, this.d * o.n); }
  cmp(o) { const a = this.n * o.d, b = o.n * this.d; return a < b ? -1 : a > b ? 1 : 0; }
  eq(o) { return this.cmp(o) === 0; }
  lt(o) { return this.cmp(o) < 0; }
  gt(o) { return this.cmp(o) > 0; }
  lte(o) { return this.cmp(o) <= 0; }
  gte(o) { return this.cmp(o) >= 0; }
  isInt() { return this.d === 1n; }
  floor() { let q = this.n / this.d; if (this.n < 0n && q * this.d !== this.n) q -= 1n; return q; }
  ceil() { let q = this.n / this.d; if (this.n > 0n && q * this.d !== this.n) q += 1n; return q; }
  toNumber() { return Number(this.n) / Number(this.d); }
  toString() { return this.d === 1n ? String(this.n) : `${this.n}/${this.d}`; }
}
Fr.ZERO = new Fr(0n);
Fr.ONE = new Fr(1n);
Fr.HALF = new Fr(1n, 2n);

// kaufmaennisch auf 2 Nachkommastellen: Ergebnis in Hundertsteln (BigInt)
export const round2Hundredths = (x) => x.mul(Fr.of(100)).add(Fr.HALF).floor();
export const round2 = (x) => new Fr(round2Hundredths(x), 100n);

// Dezimalkomma, hoechstens 2 Nachkommastellen, ohne Endnullen
export function fmtNum(x) {
  const n = round2Hundredths(x);
  const neg = n < 0n;
  const a = neg ? -n : n;
  const whole = a / 100n;
  const frac = a % 100n;
  let s = String(whole);
  if (frac !== 0n) s += ',' + String(frac).padStart(2, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + s;
}
