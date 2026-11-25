import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseColor,
  contrastRatio,
  relativeLuminance,
  composite,
  toHex,
  formatRatio,
  ColorError,
} from '../scripts/lib/color.mjs';

test('parsea hex de 3, 4, 6 y 8 digitos', () => {
  assert.deepEqual([parseColor('#fff').r, parseColor('#fff').g, parseColor('#fff').b], [255, 255, 255]);
  assert.equal(toHex(parseColor('#0a0a0f')), '#0a0a0f');
  assert.ok(Math.abs(parseColor('#fff8').a - 8 / 15) < 1e-9);
  assert.ok(Math.abs(parseColor('#00000080').a - 128 / 255) < 1e-9);
});

test('parsea hsl y rgb en sintaxis moderna y heredada', () => {
  assert.equal(toHex(parseColor('hsl(0 100% 50%)')), '#ff0000');
  assert.equal(toHex(parseColor('hsl(120, 100%, 25%)')), '#008000');
  assert.equal(toHex(parseColor('rgb(10 20 30)')), '#0a141e');
  assert.equal(toHex(parseColor('rgba(10, 20, 30, 0.5)')), '#0a141e');
  assert.equal(parseColor('hsl(200 50% 50% / 25%)').a, 0.25);
});

test('rechaza valores no reconocidos con un error explicito', () => {
  for (const value of ['', 'azul', '#12', 'hsl(1,2)', 'rgb(1,2)']) {
    assert.throws(() => parseColor(value), ColorError);
  }
});

test('luminancia y contraste cumplen los valores de referencia de WCAG', () => {
  assert.equal(relativeLuminance('#fff'), 1);
  assert.equal(relativeLuminance('#000'), 0);
  assert.equal(contrastRatio('#000', '#fff'), 21);
  assert.equal(formatRatio(21), '21.00:1');
  // 4.54:1 es el gris de referencia que pasa AA sobre blanco.
  assert.ok(Math.abs(contrastRatio('#767676', '#fff') - 4.54) < 0.01);
  assert.ok(contrastRatio('#777777', '#fff') < 4.5);
});

test('el contraste es simetrico y no depende del orden', () => {
  const a = contrastRatio('hsl(265 72% 62%)', 'hsl(240 20% 5%)');
  const b = contrastRatio('hsl(240 20% 5%)', 'hsl(265 72% 62%)');
  assert.equal(a, b);
});

test('compone alfa sobre un fondo opaco antes de medir', () => {
  const blended = composite('hsl(0 0% 0% / .5)', '#fff');
  assert.equal(toHex(blended), '#808080');
  const ratio = contrastRatio('hsl(0 0% 100% / .5)', '#000');
  const opaque = contrastRatio(toHex(blended), '#000');
  assert.ok(Math.abs(ratio - opaque) < 0.01);
});

test('exige fondo opaco para medir', () => {
  assert.throws(() => contrastRatio('#fff', 'hsl(0 0% 0% / .5)'), ColorError);
  assert.throws(() => relativeLuminance('hsl(0 0% 0% / .5)'), ColorError);
});

test('los canales quedan acotados aunque la entrada se salga', () => {
  assert.equal(parseColor('rgb(300 300 300)').r, 255);
  assert.equal(parseColor('hsl(0 150% 50%)').r, 255);
  assert.equal(parseColor('hsl(-120 100% 50%)').a, 1);
});
