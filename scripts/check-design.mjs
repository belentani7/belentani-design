#!/usr/bin/env node
/**
 * Gate del sistema. Comprueba las reglas que el README publica como contrato:
 * tokens definidos, cero colores/tamanos a mano fuera de tokens.css, contraste
 * medido en los 12 pares tema x esquema, accesibilidad estructural, presupuesto
 * de bytes y que tokens.html no este obsoleto.
 *
 * Uso:
 *   node scripts/check-design.mjs                 todas las comprobaciones
 *   node scripts/check-design.mjs --only a11y     un grupo concreto
 *   node scripts/check-design.mjs --json          salida legible por maquina
 *   node scripts/check-design.mjs --help
 *
 * Exit 1 si hay cualquier error.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { gzipSync } from 'node:zlib';
import { parseCss, flattenRules, parseSelectors, findVarRefs } from './lib/css.mjs';
import { loadSystem, contrastFailures, REQUIRED_TOKENS, CONTRAST_PAIRS, measureSystem } from './lib/tokens.mjs';
import { parseTags, elements, parseInlineStyle, textContent, documentText } from './lib/html.mjs';
import { parseColor, formatRatio } from './lib/color.mjs';
import { renderTokensPage } from './build-tokens.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

/** Presupuesto de bytes por fichero servido. Un cambio que lo rompa debe justificarse. */
export const BUDGETS = {
  'tokens.css': 8 * 1024,
  'design.css': 24 * 1024,
  'design.js': 8 * 1024,
  'index.html': 24 * 1024,
  'tokens.html': 160 * 1024,
  '404.html': 8 * 1024,
};

const SITE_PAGES = ['index.html', 'tokens.html', '404.html'];
const CSS_FILES = ['tokens.css', 'design.css'];

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;
const SIZE_IN_SPACING = /(?:^|[\s(])(-?\d*\.?\d+)(rem|px)\b/;
const SPACING_PROPS = /^(?:margin|padding|gap|row-gap|column-gap|inset|top|right|bottom|left|min-height|height|width)(?:-|$)/;

const COLOR_PROPS = /(?:^background|color|border|outline|box-shadow|text-shadow|fill|stroke|caret-color|accent-color|text-decoration)/;

function finding(list, group, id, level, message, extra = {}) {
  list.push({ group, id, level, message, ...extra });
}

function innerHtml(html, openTag) {
  const start = openTag.index + 1;
  const close = html.toLowerCase().indexOf(`</${openTag.tag}>`, start);
  return close === -1 ? html.slice(start) : html.slice(start, close);
}

// ---------------------------------------------------------------------------
// Tokens y CSS
// ---------------------------------------------------------------------------

export function checkTokens(state, report) {
  const { system } = state;
  if (system.themes.length !== 6) {
    finding(report, 'tokens', 'tokens/themes', 'error', `Se esperan 6 temas, hay ${system.themes.length}: ${system.themes.join(', ')}`);
  }
  const missingRequired = REQUIRED_TOKENS.filter((token) => !system.base.resolved.has(token));
  if (missingRequired.length) {
    finding(report, 'tokens', 'tokens/required', 'error', `Tokens obligatorios sin definir: ${missingRequired.join(', ')}`);
  }
  for (const palette of system.palettes) {
    if (palette.broken.length) {
      const detail = palette.broken.map((b) => `${b.name} (${b.missing.join(',') || b.cycle.join(',')})`).join('; ');
      finding(report, 'tokens', 'tokens/broken', 'error', `[${palette.env['data-theme']}/${palette.env['data-scheme']}] tokens sin resolver: ${detail}`);
    }
    for (const token of REQUIRED_TOKENS) {
      if (!palette.resolved.has(token)) {
        finding(report, 'tokens', 'tokens/missing-in-palette', 'error', `[${palette.env['data-theme']}/${palette.env['data-scheme']}] falta ${token}`);
      }
    }
  }

  // Un var() solo es un error si no lo define nadie y no trae fallback:
  // los componentes exponen custom properties (--gap, --v, --min, --btn-*)
  // que el consumidor asigna por clase o por style.
  const localDefinitions = new Set();
  const refs = new Map();
  const pages = SITE_PAGES.filter((file) => existsSync(join(ROOT, file)));

  for (const file of CSS_FILES) {
    const text = read(file);
    for (const match of text.matchAll(/(--[\w-]+)\s*:/g)) localDefinitions.add(match[1]);
    collectVarRefs(text, `css:${file}`, refs);
  }
  for (const file of pages) {
    const html = read(file);
    for (const match of html.matchAll(/style=['"][^'"]*?(--[\w-]+)\s*:/g)) localDefinitions.add(match[1]);
    collectVarRefs(html, file, refs);
  }

  for (const [ref, info] of refs) {
    if (system.defined.has(ref) || localDefinitions.has(ref) || info.hasFallback) continue;
    finding(report, 'tokens', 'tokens/undefined', 'error', `var(${ref}) no lo define nadie y no tiene fallback (${[...info.files].join(', ')})`);
  }

  // Las escalas (--t-*, --s-*, --r-*, --control-*, --icon*) son API publica para
  // quien adopta el sistema: no se avisa de que "no se usen" internamente.
  const SCALE = /^--(?:t-|s-|r-|control|icon|shadow|blur|dur|ease|gutter|section|measure|nav-|ring|h$|h2$|sat$|sans|mono|display|on-brand)/;
  const unused = [...system.defined].filter((token) => !refs.has(token) && !SCALE.test(token));
  if (unused.length) {
    finding(report, 'tokens', 'tokens/unused', 'warn', `Tokens definidos y nunca usados: ${unused.join(', ')}`);
  }
}

function collectVarRefs(text, source, refs) {
  for (const match of text.matchAll(/var\(\s*(--[\w-]+)\s*(,?)/g)) {
    const name = match[1];
    if (!refs.has(name)) refs.set(name, { hasFallback: false, files: new Set() });
    const entry = refs.get(name);
    if (match[2] === ',') entry.hasFallback = true;
    entry.files.add(source.replace(/^css:/, ''));
  }
}

export function checkCss(state, report) {
  for (const file of CSS_FILES) {
    const source = read(file);
    const open = (source.match(/{/g) ?? []).length;
    const close = (source.match(/}/g) ?? []).length;
    if (open !== close) {
      finding(report, 'css', 'css/braces', 'error', `${file}: ${open} '{' y ${close} '}' (llaves descompensadas)`);
    }
    const rules = flattenRules(parseCss(source));
    if (rules.length === 0) finding(report, 'css', 'css/empty', 'error', `${file}: no se ha podido leer ninguna regla`);
    for (const rule of rules) {
      const isPrint = rule.context.some((ctx) => /@media\s+print/i.test(ctx));
      for (const declaration of rule.declarations) {
        const { prop, value } = declaration;
        const isMask = /mask/.test(prop);
        if (COLOR_LITERAL.test(value) && !isPrint && !isMask && COLOR_PROPS.test(prop)) {
          finding(report, 'css', 'css/hardcoded-color', 'error',
            `${file} · ${rule.selector} · ${prop}: "${value}" escribe un color a mano; debe salir de un token`);
        }
        if (file === 'design.css' && /^font-size$/.test(prop) && SIZE_IN_SPACING.test(value)) {
          finding(report, 'css', 'css/hardcoded-font-size', 'error',
            `${rule.selector} · font-size: "${value}" no usa la escala --t-*`);
        }
        if (file === 'design.css' && SPACING_PROPS.test(prop) && SIZE_IN_SPACING.test(value)) {
          const usesVar = /var\(--/.test(value);
          if (!usesVar) {
            finding(report, 'css', 'css/hardcoded-space', 'error',
              `${rule.selector} · ${prop}: "${value}" usa medidas literales en vez de --s-* o --control-*`);
          }
        }
      }
    }
    if (/@import\b/.test(read(file))) {
      finding(report, 'css', 'css/import', 'error', `${file} usa @import (bloquea el render en cascada)`);
    }
    if (/url\(\s*(['"]?)(https?:)?\/\//.test(read(file))) {
      finding(report, 'css', 'css/external-url', 'error', `${file} carga un recurso externo; el sistema no depende de red ajena`);
    }
  }
}

// ---------------------------------------------------------------------------
// Contraste
// ---------------------------------------------------------------------------

export function checkContrast(state, report) {
  const failures = contrastFailures(state.system);
  for (const failure of failures) {
    finding(report, 'contrast', 'contrast/fail', 'error',
      `[${failure.theme}/${failure.scheme}] ${failure.id}: ${formatRatio(failure.ratio)} < ${failure.min}:1 (${failure.fg} sobre ${failure.bg})`);
  }
  state.stats.contrastPairs = state.system.palettes.length * CONTRAST_PAIRS.length;
  state.stats.contrastFailures = failures.length;
  const measured = measureSystem(state.system);
  const worst = measured
    .flatMap((entry) => entry.pairs.map((pair) => ({ ...pair, theme: entry.theme, scheme: entry.scheme })))
    .reduce((acc, pair) => (acc == null || pair.ratio / pair.min < acc.ratio / acc.min ? pair : acc), null);
  if (worst) {
    state.stats.worstContrast = { ratio: worst.ratio, min: worst.min, pair: worst.id, theme: worst.theme, scheme: worst.scheme };
  }
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

export function checkHtml(state, report) {
  for (const file of SITE_PAGES) {
    if (!existsSync(join(ROOT, file))) continue;
    const html = read(file);
    const tags = parseTags(html);
    const open = tags.filter((t) => !t.closing);
    const htmlTag = open.find((t) => t.tag === 'html');
    const ids = new Map();

    if (!htmlTag) {
      finding(report, 'a11y', 'html/missing-html', 'error', `${file}: falta <html>`);
      continue;
    }
    if (!htmlTag.attrs.lang) finding(report, 'a11y', 'html/lang', 'error', `${file}: <html> sin lang`);
    if (!htmlTag.attrs['data-theme']) finding(report, 'a11y', 'html/theme', 'error', `${file}: <html> sin data-theme (gate de adopcion)`);

    for (const tag of open) {
      const id = tag.attrs.id;
      if (id) {
        if (ids.has(id)) finding(report, 'a11y', 'html/duplicate-id', 'error', `${file}: id duplicado "${id}"`);
        ids.set(id, tag);
      }
    }

    const headings = open.filter((t) => /^h[1-6]$/.test(t.tag)).map((t) => Number(t.tag[1]));
    const h1 = headings.filter((level) => level === 1).length;
    if (h1 !== 1) finding(report, 'a11y', 'html/h1', 'error', `${file}: ${h1} <h1> (debe haber exactamente 1)`);
    let previous = 0;
    headings.forEach((level) => {
      if (previous && level > previous + 1) {
        finding(report, 'a11y', 'html/heading-order', 'warn', `${file}: salto de h${previous} a h${level}`);
      }
      previous = level;
    });

    const landmarks = { main: open.filter((t) => t.tag === 'main').length };
    if (landmarks.main !== 1) finding(report, 'a11y', 'html/main', 'error', `${file}: ${landmarks.main} <main> (debe haber 1)`);

    for (const nav of open.filter((t) => t.tag === 'nav')) {
      if (!nav.attrs['aria-label'] && !nav.attrs['aria-labelledby']) {
        finding(report, 'a11y', 'aria/nav-label', 'error', `${file}: <nav> sin aria-label; con varias navs es ambiguo`);
      }
    }

    for (const button of open.filter((t) => t.tag === 'button')) {
      if (!button.attrs.type) finding(report, 'a11y', 'html/button-type', 'error', `${file}: <button> sin type`);
      if (button.attrs['data-toggle-scheme'] != null && button.attrs['aria-pressed'] == null) {
        finding(report, 'a11y', 'aria/pressed', 'error', `${file}: el conmutador de esquema necesita aria-pressed`);
      }
      if (button.attrs['data-nav-toggle'] != null) {
        if (button.attrs['aria-expanded'] == null) finding(report, 'a11y', 'aria/expanded', 'error', `${file}: el boton de menu necesita aria-expanded`);
        const controls = button.attrs['aria-controls'];
        if (!controls || !ids.has(controls)) finding(report, 'a11y', 'aria/controls', 'error', `${file}: aria-controls="${controls ?? ''}" no apunta a ningun id`);
        const label = innerHtml(html, button).replace(/<[^>]+>/g, '').trim();
        if (!label && !button.attrs['aria-label']) finding(report, 'a11y', 'aria/button-name', 'error', `${file}: boton de menu sin nombre accesible`);
      }
      if (button.attrs['aria-label'] != null && !button.attrs['aria-label'].trim()) {
        finding(report, 'a11y', 'aria/empty-label', 'error', `${file}: aria-label vacio`);
      }
    }

    const labelFor = new Set(open.filter((t) => t.tag === 'label' && t.attrs.for).map((t) => t.attrs.for));
    for (const field of open.filter((t) => ['input', 'select', 'textarea'].includes(t.tag))) {
      if (field.attrs.type === 'hidden') continue;
      const id = field.attrs.id;
      const labelled = (id && labelFor.has(id)) || field.attrs['aria-label'] || field.attrs['aria-labelledby'];
      if (!labelled) finding(report, 'a11y', 'form/label', 'error', `${file}: <${field.tag}> sin label asociado`);
    }

    for (const table of open.filter((t) => t.tag === 'table')) {
      const block = html.slice(table.index, html.toLowerCase().indexOf('</table>', table.index));
      if (!/<caption[\s>]/.test(block)) finding(report, 'a11y', 'table/caption', 'error', `${file}: tabla sin <caption>`);
      if (!/scope=/.test(block)) finding(report, 'a11y', 'table/scope', 'error', `${file}: celdas <th> sin scope`);
    }

    for (const progress of open.filter((t) => t.tag === 'progress')) {
      if (progress.attrs.max == null || progress.attrs.value == null) {
        finding(report, 'a11y', 'html/progress', 'error', `${file}: <progress> sin max o value`);
      }
      if (!progress.attrs['aria-label'] && !progress.attrs['aria-labelledby']) {
        finding(report, 'a11y', 'html/progress-name', 'error', `${file}: <progress> sin nombre accesible`);
      }
    }

    for (const meter of open.filter((t) => t.attrs['role'] === 'progressbar')) {
      for (const attr of ['aria-valuenow', 'aria-valuemin', 'aria-valuemax']) {
        if (meter.attrs[attr] == null) finding(report, 'a11y', 'aria/progressbar', 'error', `${file}: progressbar sin ${attr}`);
      }
      if (!meter.attrs['aria-label'] && !meter.attrs['aria-labelledby']) {
        finding(report, 'a11y', 'aria/progressbar-name', 'error', `${file}: progressbar sin nombre accesible`);
      }
    }

    for (const anchor of open.filter((t) => t.tag === 'a')) {
      const href = anchor.attrs.href ?? '';
      const text = innerHtml(html, anchor).replace(/<[^>]+>/g, '').trim();
      if (!text && !anchor.attrs['aria-label']) finding(report, 'a11y', 'link/name', 'error', `${file}: enlace sin texto ni aria-label (${href || 'sin href'})`);
      if (!href) finding(report, 'a11y', 'link/href', 'error', `${file}: enlace sin href`);
      if (href.startsWith('#')) {
        const target = href.slice(1);
        if (target && !ids.has(target)) finding(report, 'a11y', 'link/anchor', 'error', `${file}: ${href} no apunta a ningun id`);
      }
      if (anchor.attrs.target === '_blank' && !/noopener/.test(anchor.attrs.rel ?? '')) {
        finding(report, 'a11y', 'link/blank', 'error', `${file}: target=_blank sin rel=noopener`);
      }
      if (/^https?:\/\//.test(href)) {
        finding(report, 'a11y', 'html/external-link', 'warn', `${file}: enlace externo ${href}`);
      }
    }

    for (const image of open.filter((t) => t.tag === 'img')) {
      if (image.attrs.alt == null) finding(report, 'a11y', 'img/alt', 'error', `${file}: <img> sin alt`);
    }

    const skip = open.find((t) => /b-skip/.test(t.attrs.class ?? ''));
    if (!skip) finding(report, 'a11y', 'html/skip', 'error', `${file}: falta enlace "saltar al contenido"`);
    else if (!skip.attrs.href?.startsWith('#') || !ids.has(skip.attrs.href.slice(1))) {
      finding(report, 'a11y', 'html/skip-target', 'error', `${file}: el enlace de salto no apunta a un id existente`);
    }

    for (const tag of open) {
      if (tag.attrs.style == null) continue;
      const declarations = parseInlineStyle(tag.attrs.style);
      const illegal = declarations.filter((declaration) => {
        if (!declaration.prop.startsWith('--')) return true;
        if (/^var\(--[\w-]+\)$/.test(declaration.value)) return false;
        if (/^\d+(\.\d+)?%$/.test(declaration.value)) return false;
        return true;
      });
      if (illegal.length) {
        finding(report, 'css', 'html/inline-style', 'error',
          `${file}: <${tag.tag}> lleva estilo en linea (${illegal.map((d) => `${d.prop}:${d.value}`).join(', ')}); debe ser una clase del sistema`);
      }
    }

    const head = html.slice(0, html.indexOf('</head>'));
    const requiredMeta = [
      [/<meta charset=/i, 'html/charset'],
      [/<meta name='viewport'|<meta name="viewport"/i, 'html/viewport'],
      [/<meta name='description'|<meta name="description"/i, 'html/description'],
      [/<meta name='color-scheme'|<meta name="color-scheme"/i, 'html/color-scheme'],
      [/<link rel='icon'|<link rel="icon"/i, 'html/favicon'],
    ];
    if (file === '404.html') {
      requiredMeta.push([/<meta name='robots'|<meta name="robots"/i, 'html/404-noindex']);
    } else {
      requiredMeta.push([/rel='canonical'|rel="canonical"/i, 'html/canonical']);
    }
    for (const [regex, id] of requiredMeta) {
      if (!regex.test(head)) finding(report, 'meta', id, 'error', `${file}: falta ${id.split('/')[1]} en el head`);
    }
    if (!/property='og:title'|property="og:title"/i.test(head)) finding(report, 'meta', 'meta/og', 'error', `${file}: falta og:title`);
  }
}

// ---------------------------------------------------------------------------
// Contrato del sistema y presupuesto
// ---------------------------------------------------------------------------

export function checkContract(state, report) {
  const html = read('index.html');
  const head = html.slice(0, html.indexOf('</head>'));
  for (const file of ['tokens.css', 'design.css']) {
    if (!new RegExp(`rel=['"]stylesheet['"][^>]*href=['"]${file.replace('.', '\\.')}`, 'i').test(head)) {
      finding(report, 'contract', 'contract/css-link', 'error', `index.html no enlaza ${file} en el head (gate de adopcion)`);
    }
  }
  if (!/(?:src|href)=['"]design\.js['"]/i.test(html)) {
    finding(report, 'contract', 'contract/js-link', 'error', 'index.html no enlaza design.js');
  }
  const tags = parseTags(html).filter((t) => !t.closing);
  // Subrecursos: si el navegador los descarga, el sistema deja de ser autonomo.
  // Los enlaces (<a>) y la canonical son navegacion, no dependencia.
  for (const tag of tags) {
    const isDocumentLink = tag.tag === 'a'
      || (tag.tag === 'link' && ['canonical', 'alternate', 'me'].includes(tag.attrs.rel ?? ''));
    if (isDocumentLink) continue;
    for (const attr of ['href', 'src']) {
      const value = tag.attrs[attr] ?? '';
      if (/^(?:https?:)?\/\//.test(value)) {
        finding(report, 'contract', 'contract/external', 'error', `index.html carga ${value} desde otro origen`);
      }
    }
  }
  const pkg = JSON.parse(read('package.json'));
  const readme = read('README.md');
  if (!readme.includes(pkg.version)) {
    finding(report, 'contract', 'contract/readme-version', 'warn', `README no menciona la version ${pkg.version} de package.json`);
  }

  const stats = { bytes: {}, gzip: {} };
  for (const [file, budget] of Object.entries(BUDGETS)) {
    if (!existsSync(join(ROOT, file))) {
      finding(report, 'perf', 'perf/missing', 'error', `${file} no existe`);
      continue;
    }
    const raw = readFileSync(join(ROOT, file));
    const gz = gzipSync(raw, { level: 9 }).length;
    stats.bytes[file] = raw.length;
    stats.gzip[file] = gz;
    if (raw.length > budget) {
      finding(report, 'perf', 'perf/budget', 'error', `${file}: ${(raw.length / 1024).toFixed(1)} KB supera el presupuesto de ${(budget / 1024).toFixed(0)} KB`);
    }
  }
  const shipping = ['tokens.css', 'design.css', 'design.js', 'index.html'];
  const shippingGzip = shipping.reduce((acc, file) => acc + (stats.gzip[file] ?? 0), 0);
  stats.shippingGzip = shippingGzip;
  stats.shippingRaw = shipping.reduce((acc, file) => acc + (stats.bytes[file] ?? 0), 0);
  if (shippingGzip > 14 * 1024) {
    finding(report, 'perf', 'perf/shipping', 'error', `La portada envia ${(shippingGzip / 1024).toFixed(1)} KB gzip; presupuesto 14 KB`);
  }
  state.stats.files = stats;

  if (existsSync(join(ROOT, 'tokens.html'))) {
    const { html: expected } = renderTokensPage();
    if (read('tokens.html') !== expected) {
      finding(report, 'contract', 'contract/tokens-stale', 'error', 'tokens.html esta obsoleto respecto a tokens.css (ejecuta npm run tokens)');
    }
  }
}

// ---------------------------------------------------------------------------
// Ejecucion
// ---------------------------------------------------------------------------

const GROUPS = ['tokens', 'css', 'contrast', 'a11y', 'meta', 'contract', 'perf'];

export function runChecks({ only } = {}) {
  const report = [];
  const state = { stats: {} };
  const css = read('tokens.css');
  state.system = loadSystem(css);

  checkTokens(state, report);
  checkCss(state, report);
  checkContrast(state, report);
  checkHtml(state, report);
  checkContract(state, report);

  const filtered = only ? report.filter((item) => item.group === only || item.group === 'tokens') : report;
  const errors = filtered.filter((item) => item.level === 'error');
  const warnings = filtered.filter((item) => item.level === 'warn');
  return { findings: filtered, errors, warnings, stats: state.stats, system: state.system };
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Gate del sistema Belentani Design.

Uso:
  node scripts/check-design.mjs                 todas las comprobaciones
  node scripts/check-design.mjs --only a11y     solo un grupo (${GROUPS.join(', ')})
  node scripts/check-design.mjs --json          salida JSON
  node scripts/check-design.mjs --quiet         solo el resumen

Comprueba: tokens definidos y usados, cero colores y medidas a mano, contraste
WCAG en ${6 * 2} paletas x ${CONTRAST_PAIRS.length} pares, accesibilidad estructural,
meta/SEO, contrato de adopcion, presupuesto de bytes y frescura de tokens.html.

Exit: 0 sin errores, 1 con errores, 2 con uso incorrecto.`);
    return 0;
  }

  const onlyIndex = argv.indexOf('--only');
  const only = onlyIndex !== -1 ? argv[onlyIndex + 1] : null;
  if (only && !GROUPS.includes(only)) {
    console.error(`Grupo desconocido: ${only}. Usa uno de: ${GROUPS.join(', ')}`);
    return 2;
  }

  const { findings, errors, warnings, stats } = runChecks({ only });

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ errors, warnings, findings, stats, budgets: BUDGETS }, null, 2));
    return errors.length ? 1 : 0;
  }

  if (!argv.includes('--quiet')) {
    const grouped = new Map();
    for (const item of findings) {
      if (!grouped.has(item.group)) grouped.set(item.group, []);
      grouped.get(item.group).push(item);
    }
    for (const group of GROUPS) {
      const items = grouped.get(group) ?? [];
      if (items.length === 0) {
        console.log(`  ok   ${group}`);
        continue;
      }
      const failures = items.filter((item) => item.level === 'error');
      console.log(`  ${failures.length ? 'FAIL' : 'warn'} ${group} (${failures.length} errores, ${items.length - failures.length} avisos)`);
      for (const item of items) {
        console.log(`       ${item.level === 'error' ? 'x' : '!'} ${item.id} · ${item.message}`);
      }
    }
  }

  const worst = stats.worstContrast;
  console.log('');
  console.log(`  contraste: ${stats.contrastPairs - stats.contrastFailures}/${stats.contrastPairs} pares pasan` +
    (worst ? ` · peor: ${worst.pair} ${formatRatio(worst.ratio)} (${worst.theme}/${worst.scheme})` : ''));
  if (stats.files) {
    const files = stats.files;
    console.log(`  portada: ${(files.shippingRaw / 1024).toFixed(1)} KB crudo · ${(files.shippingGzip / 1024).toFixed(1)} KB gzip`);
  }
  console.log(`  ${errors.length} errores, ${warnings.length} avisos`);
  return errors.length ? 1 : 0;
}

if (process.argv[1] && process.argv[1].endsWith('check-design.mjs')) {
  process.exit(main(process.argv.slice(2)));
}
