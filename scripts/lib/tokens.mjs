/**
 * Carga tokens.css y resuelve cada paleta (tema x esquema) para poder MEDIR
 * contraste en vez de estimarlo. Cada par de la tabla de abajo corresponde a un
 * uso real en design.css o index.html.
 */

import { parseCss, flattenRules, resolveValue, parseSelectors } from './css.mjs';
import { parseColor, composite, contrastRatio, roundRatio } from './color.mjs';

export const THEME_ATTR = 'data-theme';
export const SCHEME_ATTR = 'data-scheme';

/** Tokens que cualquier paleta debe resolver, o el componente que los usa se rompe. */
export const REQUIRED_TOKENS = [
  'bg', 'bg-elev', 'surface', 'surface-2',
  'ink', 'ink-soft', 'muted', 'line', 'line-soft', 'line-strong',
  'brand', 'brand-strong', 'brand-soft', 'brand-ink', 'brand-line', 'brand-glow',
  'on-brand', 'accent',
  'ok', 'ok-ink', 'ok-soft', 'ok-line',
  'warn', 'warn-ink', 'warn-soft', 'warn-line',
  'bad', 'bad-ink', 'bad-soft', 'bad-line',
  'nav-bg', 'nav-bg-solid',
  'sans', 'mono', 'display',
  't--1', 't-0', 't-1', 't-2', 't-3', 't-4', 't-5', 't-6',
  's-1', 's-2', 's-3', 's-4', 's-5', 's-6', 's-7', 's-8', 's-9',
  'r-sm', 'r', 'r-lg', 'r-xl', 'r-full',
  'shadow-1', 'shadow-2', 'shadow-3',
  'ease', 'dur', 'dur-slow',
  'gutter', 'section', 'measure', 'ring',
  'control-sm', 'control', 'control-lg', 'control-min',
  'icon', 'icon-sm', 'nav-h', 'hairline', 'container', 'grid-size',
].map((name) => `--${name}`);

/**
 * Contrato de contraste. `min` sale de WCAG 2.2: 4.5 texto normal (1.4.3),
 * 3 texto grande (1.4.3) y 3 componentes/indicadores (1.4.11).
 * `bases` permite medir el peor caso cuando el fondo es translucido.
 */
export const CONTRAST_PAIRS = [
  { id: 'body', fg: '--ink', bg: '--bg', min: 4.5, kind: 'text' },
  { id: 'body-elev', fg: '--ink', bg: '--bg-elev', min: 4.5, kind: 'text' },
  { id: 'body-surface', fg: '--ink', bg: '--surface', min: 4.5, kind: 'text' },
  { id: 'body-surface-2', fg: '--ink', bg: '--surface-2', min: 4.5, kind: 'text' },
  { id: 'soft', fg: '--ink-soft', bg: '--bg', min: 4.5, kind: 'text' },
  { id: 'soft-surface', fg: '--ink-soft', bg: '--surface', min: 4.5, kind: 'text' },
  { id: 'soft-surface-2', fg: '--ink-soft', bg: '--surface-2', min: 4.5, kind: 'text' },
  { id: 'muted', fg: '--muted', bg: '--bg', min: 4.5, kind: 'text' },
  { id: 'muted-elev', fg: '--muted', bg: '--bg-elev', min: 4.5, kind: 'text' },
  { id: 'muted-surface', fg: '--muted', bg: '--surface', min: 4.5, kind: 'text' },
  { id: 'link', fg: '--brand-ink', bg: '--bg', min: 4.5, kind: 'text' },
  { id: 'link-surface', fg: '--brand-ink', bg: '--surface', min: 4.5, kind: 'text' },
  { id: 'link-hover', fg: '--brand', bg: '--bg', min: 4.5, kind: 'text' },
  { id: 'link-hover-surface', fg: '--brand', bg: '--surface', min: 4.5, kind: 'text' },
  { id: 'button', fg: '--on-brand', bg: '--brand-strong', min: 4.5, kind: 'text' },
  { id: 'button-hover', fg: '--on-brand', bg: '--brand', min: 4.5, kind: 'text' },
  { id: 'nav-link', fg: '--ink-soft', bg: '--nav-bg', bases: ['--bg'], min: 4.5, kind: 'text' },
  { id: 'nav-link-solid', fg: '--ink-soft', bg: '--nav-bg-solid', bases: ['--bg'], min: 4.5, kind: 'text' },
  { id: 'eyebrow', fg: '--brand-ink', bg: '--brand-soft', bases: ['--bg', '--surface'], min: 4.5, kind: 'text' },
  { id: 'badge', fg: '--ink-soft', bg: '--surface-2', min: 4.5, kind: 'text' },
  { id: 'badge-ok', fg: '--ok-ink', bg: '--ok-soft', bases: ['--surface', '--surface-2'], min: 4.5, kind: 'text' },
  { id: 'badge-warn', fg: '--warn-ink', bg: '--warn-soft', bases: ['--surface', '--surface-2'], min: 4.5, kind: 'text' },
  { id: 'badge-bad', fg: '--bad-ink', bg: '--bad-soft', bases: ['--surface', '--surface-2'], min: 4.5, kind: 'text' },
  { id: 'code', fg: '--ink-soft', bg: '--bg-elev', min: 4.5, kind: 'text' },
  { id: 'focus-ring', fg: '--brand', bg: '--bg', min: 3, kind: 'ui' },
  { id: 'focus-ring-surface', fg: '--brand', bg: '--surface', min: 3, kind: 'ui' },
  { id: 'control-border', fg: '--line-strong', bg: '--bg-elev', min: 3, kind: 'ui' },
  { id: 'control-border-surface', fg: '--line-strong', bg: '--surface', min: 3, kind: 'ui' },
  { id: 'status-ok', fg: '--ok', bg: '--surface', min: 3, kind: 'ui' },
  { id: 'status-warn', fg: '--warn', bg: '--surface', min: 3, kind: 'ui' },
  { id: 'status-bad', fg: '--bad', bg: '--surface', min: 3, kind: 'ui' },
  { id: 'meter-fill', fg: '--accent', bg: '--surface-2', min: 3, kind: 'ui' },
];

function selectorEnvironment(selector) {
  const attrs = {};
  const attrRegex = /\[\s*(data-theme|data-scheme)\s*=\s*['"]?([\w-]+)['"]?\s*\]/g;
  let match;
  let found = false;
  while ((match = attrRegex.exec(selector))) {
    attrs[match[1]] = match[2];
    found = true;
  }
  if (!found) {
    // ":root" y "html" son la base; cualquier otro selector no define paletas.
    return /^(\:root|html|body)$/i.test(selector.trim()) ? {} : null;
  }
  return attrs;
}

/**
 * @param {string} cssText contenido de tokens.css
 */
export function loadSystem(cssText) {
  const rules = flattenRules(parseCss(cssText));
  const layers = [];
  const themes = new Set();
  const schemes = new Set();

  for (const rule of rules) {
    if (rule.context.some((ctx) => /^@media/i.test(ctx))) continue;
    const declarations = rule.declarations.filter((d) => d.prop.startsWith('--'));
    if (declarations.length === 0) continue;
    for (const selector of parseSelectors(rule)) {
      const env = selectorEnvironment(selector);
      if (!env) continue;
      if (env['data-theme']) themes.add(env['data-theme']);
      if (env['data-scheme']) schemes.add(env['data-scheme']);
      layers.push({ env, declarations, selector });
    }
  }

  const applies = (layer, env) =>
    (layer.env['data-theme'] ?? null) === (env['data-theme'] ?? null)
    && (layer.env['data-scheme'] ?? null) === (env['data-scheme'] ?? null);

  /**
   * Combina capas con la misma especificidad que el navegador: base, tema,
   * esquema y tema+esquema; en caso de empate gana la ultima del fichero.
   */
  function rawPalette(env) {
    const map = new Map();
    const ordered = layers.filter((layer) => {
      if (Object.keys(layer.env).length === 0) return true;
      const themeOk = !layer.env['data-theme'] || layer.env['data-theme'] === env['data-theme'];
      const schemeOk = !layer.env['data-scheme'] || layer.env['data-scheme'] === env['data-scheme'];
      return themeOk && schemeOk;
    });
    const weight = (layer) => {
      const specific = applies(layer, env);
      return Object.keys(layer.env).length + (specific ? 0.5 : 0);
    };
    ordered
      .map((layer, index) => ({ layer, index, weight: weight(layer) }))
      .sort((a, b) => a.weight - b.weight || a.index - b.index)
      .forEach(({ layer }) => {
        for (const { prop, value } of layer.declarations) map.set(prop, value);
      });
    return map;
  }

  function resolvePalette(env) {
    const raw = rawPalette(env);
    const lookup = (name) => raw.get(name) ?? null;
    const resolved = new Map();
    const broken = [];
    for (const name of raw.keys()) {
      const result = resolveValue(raw.get(name), lookup);
      if (result.value == null) {
        broken.push({ name, missing: result.missing, cycle: result.cycle });
        continue;
      }
      resolved.set(name, result.value);
    }
    return { env, resolved, broken, raw };
  }

  const themeList = [...themes];
  const schemeList = ['dark', ...schemes];

  const all = [];
  for (const theme of themeList) {
    for (const scheme of schemeList) {
      all.push({ theme, scheme, ...resolvePalette({ 'data-theme': theme, 'data-scheme': scheme }) });
    }
  }

  return {
    themes: themeList,
    schemes: schemeList,
    base: resolvePalette({}),
    palettes: all,
    /** Variables definidas en alguna capa (para detectar uso de tokens inexistentes). */
    defined: new Set(layers.flatMap((layer) => layer.declarations.map((d) => d.prop))),
    layers,
  };
}

export function paletteColor(palette, token) {
  const value = palette.resolved.get(token);
  if (value == null) throw new Error(`Token no resuelto: ${token}`);
  return parseColor(value);
}

/** Fondo real: compone las capas translucidas sobre una base opaca. */
export function backdrop(palette, token, baseToken = '--bg') {
  const base = paletteColor(palette, baseToken);
  const color = paletteColor(palette, token);
  return color.a === 1 ? color : composite(color, base);
}

export function measurePair(palette, pair) {
  const bases = pair.bases ?? ['--bg'];
  const needed = [pair.fg, pair.bg, ...bases];
  const missing = needed.filter((token) => !palette.resolved.has(token));
  if (missing.length) {
    // Una paleta incompleta no se puede medir: se declara incumplida, no se ignora.
    return { ...pair, ratio: 0, pass: false, missing };
  }
  let worst = null;
  for (const baseToken of bases) {
    const base = paletteColor(palette, baseToken);
    const bgColor = paletteColor(palette, pair.bg);
    const bg = bgColor.a === 1 ? bgColor : composite(bgColor, base);
    const fg = paletteColor(palette, pair.fg);
    const ratio = roundRatio(contrastRatio(fg, bg));
    if (worst == null || ratio < worst.ratio) worst = { ratio, baseToken, bg, fg };
  }
  return { ...pair, ratio: worst.ratio, baseToken: worst.baseToken, fgColor: worst.fg, bgColor: worst.bg, pass: worst.ratio >= pair.min };
}

/** Todas las combinaciones tema x esquema con sus pares medidos. */
export function measureSystem(system) {
  return system.palettes.map((palette) => ({
    theme: palette.env['data-theme'],
    scheme: palette.env['data-scheme'],
    pairs: CONTRAST_PAIRS.map((pair) => measurePair(palette, pair)),
  }));
}

export function contrastFailures(system) {
  return measureSystem(system).flatMap((entry) =>
    entry.pairs.filter((pair) => !pair.pass).map((pair) => ({
      theme: entry.theme,
      scheme: entry.scheme,
      id: pair.id,
      ratio: pair.ratio,
      min: pair.min,
      fg: pair.fg,
      bg: pair.bg,
    })),
  );
}
