import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadSystem,
  measureSystem,
  contrastFailures,
  measurePair,
  paletteColor,
  backdrop,
  CONTRAST_PAIRS,
  REQUIRED_TOKENS,
} from '../scripts/lib/tokens.mjs';
import { contrastRatio } from '../scripts/lib/color.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const system = loadSystem(readFileSync(join(ROOT, 'tokens.css'), 'utf8'));
const palettes = system.palettes;

test('el sistema declara los seis temas y los dos esquemas', () => {
  assert.deepEqual(system.themes, ['indigo', 'navy', 'gold', 'emerald', 'warm', 'violet']);
  assert.deepEqual(system.schemes, ['dark', 'light']);
  assert.equal(palettes.length, 12);
});

test('cada paleta resuelve todos los tokens obligatorios sin ciclos', () => {
  for (const palette of palettes) {
    const label = `${palette.env['data-theme']}/${palette.env['data-scheme']}`;
    assert.deepEqual(palette.broken, [], `${label} tiene tokens rotos`);
    const missing = REQUIRED_TOKENS.filter((token) => !palette.resolved.has(token));
    assert.deepEqual(missing, [], `${label} no resuelve ${missing.join(',')}`);
  }
});

test('cada tema cambia el tono y nada mas de la base cromatica', () => {
  const hues = system.themes.map((theme) => {
    const palette = palettes.find((p) => p.env['data-theme'] === theme && p.env['data-scheme'] === 'dark');
    return palette.resolved.get('--h');
  });
  assert.equal(new Set(hues).size, system.themes.length);
});

test('ningun par de contraste baja de su minimo WCAG en ninguna paleta', () => {
  const failures = contrastFailures(system);
  assert.deepEqual(
    failures.map((f) => `${f.theme}/${f.scheme} ${f.id} ${f.ratio} < ${f.min}`),
    [],
  );
  assert.equal(measureSystem(system).length * CONTRAST_PAIRS.length, 384);
});

test('el peor par sigue teniendo margen sobre su minimo', () => {
  const measured = measureSystem(system).flatMap((entry) => entry.pairs);
  const worst = measured.reduce((acc, pair) => (pair.ratio / pair.min < acc.ratio / acc.min ? pair : acc));
  assert.ok(worst.ratio >= worst.min, `${worst.id} incumple`);
  assert.ok(measured.every((pair) => pair.ratio >= pair.min));
});

test('los controles miden al menos 44 px de alto', () => {
  const toPx = (value) => {
    const match = /^([\d.]+)rem$/.exec(value.trim());
    assert.ok(match, `token no convertible a px: ${value}`);
    return Number.parseFloat(match[1]) * 16;
  };
  const dark = palettes.find((p) => p.env['data-scheme'] === 'dark');
  for (const token of ['--control-min', '--control-sm', '--control', '--control-lg']) {
    const px = toPx(dark.resolved.get(token));
    assert.ok(px >= 44, `${token} = ${px}px, por debajo de 44px`);
  }
});

test('la escala tipografica crece de forma monotona', () => {
  const palette = palettes[0];
  const parseClampMin = (value) => {
    const match = /^clamp\(([\d.]+)rem/.exec(value.trim());
    return match ? Number.parseFloat(match[1]) : Number.parseFloat(value);
  };
  const scale = ['--t--1', '--t-0', '--t-1', '--t-2', '--t-3', '--t-4', '--t-5', '--t-6'];
  const sizes = scale.map((token) => parseClampMin(palette.resolved.get(token)));
  for (let i = 1; i < sizes.length; i += 1) {
    assert.ok(sizes[i] > sizes[i - 1], `${scale[i]} no es mayor que ${scale[i - 1]}`);
  }
});

test('una paleta incompleta se declara incumplida, no se ignora', () => {
  const incomplete = { resolved: new Map([['--bg', 'hsl(0 0% 0%)']]) };
  const result = measurePair(incomplete, CONTRAST_PAIRS[0]);
  assert.equal(result.pass, false);
  assert.equal(result.ratio, 0);
  assert.ok(result.missing.includes('--ink'));
});

test('el fondo translucido se mide compuesto sobre la base', () => {
  const dark = palettes.find((p) => p.env['data-scheme'] === 'dark');
  const navBg = paletteColor(dark, '--nav-bg');
  assert.ok(navBg.a < 1, '--nav-bg deberia ser translucido');
  const composed = backdrop(dark, '--nav-bg', '--bg');
  assert.equal(composed.a, 1);
  const direct = contrastRatio(paletteColor(dark, '--ink-soft'), composed);
  assert.ok(direct > 4.5);
});
