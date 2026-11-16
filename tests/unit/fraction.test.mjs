import test from 'node:test';
import assert from 'node:assert/strict';
import { Fr, fmtNum, round2 } from '../../app/js/core/fraction.js';

test('Brueche: Grundrechenarten exakt', () => {
  assert.equal(Fr.of(1, 3).add(Fr.of(1, 6)).toString(), '1/2');
  assert.equal(Fr.parseDecimal('0.1').add(Fr.parseDecimal('0.2')).toString(), '3/10'); // Gleitkomma haette 0.30000000000000004
  assert.equal(Fr.parseDecimal('1e-7').toString(), '1/10000000');
  assert.equal(Fr.parseDecimal('2.50').toString(), '5/2');
  assert.equal(Fr.of(7, 2).floor(), 3n);
  assert.equal(Fr.of(7, 2).ceil(), 4n);
  assert.equal(Fr.of(-7, 2).floor(), -4n);
  assert.equal(Fr.of(4, 2).ceil(), 2n);
});

test('Anzeige: Dezimalkomma, kaufmaennisch gerundet, ohne Endnullen', () => {
  const cases = [['5/2', '2,5'], ['2625/1000', '2,63'], ['3', '3'], ['1/3', '0,33'], ['2/3', '0,67'], ['1005/1000', '1,01'],
    ['1/200', '0,01'], ['1/300', '0'], ['12345/100', '123,45'], ['1/10', '0,1']];
  for (const [f, out] of cases) {
    const [n, d = '1'] = f.split('/');
    assert.equal(fmtNum(Fr.of(n, d)), out, f);
  }
  assert.equal(round2(Fr.of(2625, 1000)).toNumber(), 2.63);
});
