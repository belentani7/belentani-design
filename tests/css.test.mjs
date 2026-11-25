import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stripComments,
  parseCss,
  flattenRules,
  parseDeclarations,
  findVarRefs,
  resolveValue,
  splitTopLevel,
} from '../scripts/lib/css.mjs';

test('quita comentarios sin tocar el contenido', () => {
  assert.equal(stripComments('a{/* x */color:red}').trim(), 'a{color:red}');
  assert.equal(stripComments('/* multi\nlinea */b{}').trim(), 'b{}');
});

test('parsea declaraciones con importante y valores con dos puntos', () => {
  const declarations = parseDeclarations("color:red!important;background:url(https://x/y.png);--v:72%");
  assert.deepEqual(declarations[0], { prop: 'color', value: 'red', important: true });
  assert.equal(declarations[1].value, 'url(https://x/y.png)');
  assert.deepEqual(declarations[2], { prop: '--v', value: '72%', important: false });
});

test('aplana reglas y conserva el contexto de las at-rules', () => {
  const css = `:root{--a:1}
@supports (display:grid){.x{display:grid}}
@media (min-width:40rem){.y{--b:2}
@media print{.z{display:none}}}`;
  const rules = flattenRules(parseCss(css));
  assert.equal(rules.length, 4);
  assert.deepEqual(rules[0].context, []);
  assert.deepEqual(rules[1].context, ['@supports (display:grid)']);
  assert.deepEqual(rules[3].context, ['@media (min-width:40rem)', '@media print']);
});

test('separa por comas solo en el nivel superior', () => {
  assert.deepEqual(splitTopLevel('hsl(1 2% 3%),hsl(4 5% 6%)', ','), ['hsl(1 2% 3%)', 'hsl(4 5% 6%)']);
  assert.deepEqual(splitTopLevel('a,b', ','), ['a', 'b']);
});

test('encuentra referencias var() incluidas las anidadas con fallback', () => {
  const refs = findVarRefs('0 0 0 3px var(--ring, var(--brand, red))');
  assert.equal(refs.length, 1);
  assert.equal(refs[0].name, '--ring');
  assert.equal(refs[0].fallback, 'var(--brand, red)');
});

test('resuelve cadenas de var() y usa el fallback cuando falta el token', () => {
  const map = new Map([
    ['--h', '265'],
    ['--brand', 'hsl(var(--h) 72% 62%)'],
  ]);
  const lookup = (name) => map.get(name) ?? null;
  assert.equal(resolveValue('hsl(var(--h) 72% 62%)', lookup).value, 'hsl(265 72% 62%)');
  assert.equal(resolveValue('var(--brand)', lookup).value, 'hsl(265 72% 62%)');
  assert.equal(resolveValue('var(--nope, 4px)', lookup).value, '4px');
  const missing = resolveValue('var(--nope)', lookup);
  assert.equal(missing.value, null);
  assert.deepEqual(missing.missing, ['--nope']);
});

test('detecta ciclos en vez de colgarse', () => {
  const map = new Map([
    ['--a', 'var(--b)'],
    ['--b', 'var(--a)'],
  ]);
  const result = resolveValue('var(--a)', (name) => map.get(name) ?? null);
  assert.equal(result.value, null);
  assert.ok(result.cycle.length > 0);
});
