#!/usr/bin/env node
/**
 * Metricas medibles del sistema, sin navegador y sin dependencias.
 * Sirve para el ANTES / DESPUES de cada cambio y para detectar regresiones.
 *
 * Uso:
 *   node scripts/audit.mjs                       metricas del repo actual
 *   node scripts/audit.mjs --compare ../antes    deltas contra otro directorio
 *   node scripts/audit.mjs --markdown            tabla lista para pegar
 *   node scripts/audit.mjs --json
 *   node scripts/audit.mjs --help
 *
 * Nota honesta: Lighthouse, axe y Playwright necesitan un navegador real. Aqui
 * no lo hay, asi que este script mide bytes, peticiones, tokens y contraste con
 * matematica propia; la auditoria de Lighthouse corre en CI con Chrome.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { loadSystem, measureSystem, CONTRAST_PAIRS } from './lib/tokens.mjs';
import { parseCss, flattenRules } from './lib/css.mjs';
import { parseTags, documentText } from './lib/html.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = ['index.html', 'tokens.html', '404.html', 'tokens.css', 'design.css', 'design.js', 'favicon.svg'];
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g;

function bytes(file) {
  const buffer = readFileSync(file);
  return {
    raw: buffer.length,
    gzip: gzipSync(buffer, { level: 9 }).length,
    brotli: brotliCompressSync(buffer).length,
  };
}

function componentNames(css) {
  const names = new Set();
  for (const rule of flattenRules(parseCss(css))) {
    for (const match of rule.selector.matchAll(/\.(b-[\w-]+)/g)) names.add(match[1]);
  }
  return names;
}

function hardcodedColors(css) {
  // Mismo criterio que el gate: la impresion fuerza blanco/negro y las mascaras
  // usan un stencil, no un color de marca.
  let count = 0;
  for (const rule of flattenRules(parseCss(css))) {
    if (rule.context.some((ctx) => /@media\s+print/i.test(ctx))) continue;
    for (const declaration of rule.declarations) {
      if (/mask/.test(declaration.prop)) continue;
      const matches = declaration.value.match(COLOR_LITERAL);
      if (matches) count += matches.length;
    }
  }
  return count;
}

export function collectMetrics(root) {
  const files = {};
  for (const name of ASSETS) {
    const path = join(root, name);
    if (existsSync(path)) files[name] = bytes(path);
  }

  const totals = Object.values(files).reduce(
    (acc, file) => ({ raw: acc.raw + file.raw, gzip: acc.gzip + file.gzip, brotli: acc.brotli + file.brotli }),
    { raw: 0, gzip: 0, brotli: 0 },
  );

  const shipping = ['index.html', 'tokens.css', 'design.css', 'design.js'].filter((name) => files[name]);
  const shippingTotals = shipping.reduce(
    (acc, name) => ({ raw: acc.raw + files[name].raw, gzip: acc.gzip + files[name].gzip }),
    { raw: 0, gzip: 0 },
  );

  const metrics = {
    root: resolve(root),
    files,
    totals,
    shipping: { files: shipping.length, ...shippingTotals },
    requests: shipping.length,
  };

  const tokensPath = join(root, 'tokens.css');
  if (existsSync(tokensPath)) {
    const system = loadSystem(readFileSync(tokensPath, 'utf8'));
    const measured = measureSystem(system);
    const pairs = measured.flatMap((entry) => entry.pairs);
    const failures = pairs.filter((pair) => !pair.pass);
    const strictest = pairs.reduce((acc, pair) => (acc == null || pair.ratio < acc.ratio ? pair : acc), null);
    metrics.tokens = {
      defined: system.base.resolved.size,
      colorTokens: [...system.base.resolved.keys()].filter((key) =>
        !/^--(?:t-|s-|r-|shadow|ease|dur|gutter|section|measure|h$|h2|sat|font|sans|mono|display|ring|control|icon|nav-h|hero)/.test(key),
      ).length,
      themes: system.themes,
      schemes: system.schemes,
      pairs: pairs.length,
      failures: failures.length,
      pairDefinitions: CONTRAST_PAIRS.length,
      worst: strictest ? { id: strictest.id, ratio: strictest.ratio, min: strictest.min } : null,
    };
  }

  const designPath = join(root, 'design.css');
  if (existsSync(designPath)) {
    const css = readFileSync(designPath, 'utf8');
    const components = componentNames(css);
    const rules = flattenRules(parseCss(css));
    metrics.css = {
      rules: rules.length,
      components: components.size,
      componentList: [...components].sort(),
      hardcodedColors: hardcodedColors(css),
      declarations: rules.reduce((acc, rule) => acc + rule.declarations.length, 0),
      mediaQueries: rules.filter((rule) => rule.context.some((ctx) => /@media|@supports|@container/.test(ctx))).length,
    };
  }

  const indexPath = join(root, 'index.html');
  if (existsSync(indexPath)) {
    const html = readFileSync(indexPath, 'utf8');
    const tags = parseTags(html).filter((tag) => !tag.closing);
    const count = (predicate) => tags.filter(predicate).length;
    const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    const inlineStyles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
    metrics.page = {
      requests: 1 + count((t) => t.tag === 'link' && t.attrs.rel === 'stylesheet') + count((t) => t.tag === 'script' && t.attrs.src),
      stylesheets: count((t) => t.tag === 'link' && t.attrs.rel === 'stylesheet'),
      scripts: count((t) => t.tag === 'script' && t.attrs.src),
      images: count((t) => t.tag === 'img'),
      externalOrigins: count((t) => /^https?:/.test(t.attrs.src ?? '') || (/^https?:/.test(t.attrs.href ?? '') && t.tag !== 'a')),
      inlineScriptBytes: inlineScripts.reduce((acc, code) => acc + Buffer.byteLength(code), 0),
      inlineStyleBytes: inlineStyles.reduce((acc, code) => acc + Buffer.byteLength(code), 0),
      inlineStyleAttributes: count((t) => t.attrs.style != null),
      ariaAttributes: (html.match(/\saria-[a-z]+=/g) ?? []).length,
      roles: (html.match(/\srole=/g) ?? []).length,
      words: documentText(html).split(/\s+/).filter(Boolean).length,
      elements: tags.length,
    };
  }

  return metrics;
}

const fmt = (value) => `${(value / 1024).toFixed(1)} KB`;
const pct = (before, after) => {
  if (before === 0) return after === 0 ? '=' : '+∞';
  const delta = ((after - before) / before) * 100;
  if (Math.abs(delta) < 0.05) return '=';
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
};

/** Filas comparables entre dos arboles de metricas. */
const ROW_SPECS = [
  { label: 'index.html (crudo)', pick: (m) => m.files['index.html']?.raw, format: fmt },
  { label: 'tokens.css (crudo)', pick: (m) => m.files['tokens.css']?.raw, format: fmt },
  { label: 'design.css (crudo)', pick: (m) => m.files['design.css']?.raw, format: fmt },
  { label: 'design.js (crudo)', pick: (m) => m.files['design.js']?.raw, format: fmt },
  { label: 'Portada completa (gzip)', pick: (m) => m.shipping?.gzip, format: fmt },
  { label: 'Peticiones de la portada', pick: (m) => m.page?.requests },
  { label: 'Tokens definidos', pick: (m) => m.tokens?.defined },
  { label: 'Temas', pick: (m) => m.tokens?.themes?.length },
  { label: 'Clases .b-*', pick: (m) => m.css?.components },
  { label: 'Colores a mano en design.css', pick: (m) => m.css?.hardcodedColors },
  { label: 'Pares de contraste medidos', pick: (m) => m.tokens?.pairs },
  { label: 'Pares de contraste que fallan', pick: (m) => m.tokens?.failures },
  { label: 'Atributos aria', pick: (m) => m.page?.ariaAttributes },
  { label: 'Roles explicitos', pick: (m) => m.page?.roles },
  { label: 'Estilos en linea', pick: (m) => m.page?.inlineStyleAttributes },
];

function flatten(before, after) {
  return ROW_SPECS.map((spec) => ({
    label: spec.label,
    before: spec.pick(before) ?? 0,
    after: spec.pick(after) ?? 0,
    format: spec.format ?? ((value) => value),
  }));
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Metricas del sistema sin navegador.

Uso:
  node scripts/audit.mjs                     repo actual
  node scripts/audit.mjs --root <dir>        otro directorio
  node scripts/audit.mjs --compare <dir>     tabla ANTES / DESPUES
  node scripts/audit.mjs --markdown          salida markdown
  node scripts/audit.mjs --json              salida JSON

Mide bytes (crudo, gzip, brotli), peticiones, tokens, componentes, colores a
mano, pares de contraste y atributos de accesibilidad. Lighthouse y axe
necesitan un navegador y corren en CI (workflow ci.yml).`);
    return 0;
  }

  const rootIndex = argv.indexOf('--root');
  const compareIndex = argv.indexOf('--compare');
  const root = rootIndex !== -1 ? resolve(argv[rootIndex + 1]) : ROOT;
  const metrics = collectMetrics(root);

  if (argv.includes('--json')) {
    console.log(JSON.stringify(metrics, null, 2));
    return 0;
  }

  const before = compareIndex !== -1 ? collectMetrics(resolve(argv[compareIndex + 1])) : null;
  const markdown = argv.includes('--markdown');
  const rows = before ? flatten(before, metrics) : null;

  if (markdown && before) {
    console.log('| Metrica | Antes | Despues | Delta |');
    console.log('|---|---:|---:|---:|');
    for (const row of rows) {
      console.log(`| ${row.label} | ${row.format(row.before)} | ${row.format(row.after)} | ${pct(row.before, row.after)} |`);
    }
    return 0;
  }

  if (markdown) {
    console.log('| Fichero | Crudo | gzip | brotli |');
    console.log('|---|---:|---:|---:|');
    for (const [name, file] of Object.entries(metrics.files)) {
      console.log(`| ${name} | ${file.raw} B | ${file.gzip} B | ${file.brotli} B |`);
    }
    console.log(`\n| Metrica | Valor |\n|---|---:|`);
    console.log(`| Tokens | ${metrics.tokens?.defined} |`);
    console.log(`| Temas | ${metrics.tokens?.themes?.length} |`);
    console.log(`| Componentes .b-* | ${metrics.css?.components} |`);
    console.log(`| Colores a mano en design.css | ${metrics.css?.hardcodedColors} |`);
    console.log(`| Contraste medido | ${metrics.tokens?.pairs} pares, ${metrics.tokens?.failures} fallos |`);
    console.log(`| Peticiones de la portada | ${metrics.page?.requests} |`);
    console.log(`| Portada gzip | ${fmt(metrics.shipping.gzip)} |`);
    return 0;
  }

  console.log(`Raiz: ${metrics.root}`);
  console.log('');
  console.log('Fichero          crudo      gzip     brotli');
  for (const [name, file] of Object.entries(metrics.files)) {
    console.log(`${name.padEnd(16)} ${String(file.raw).padStart(7)} B ${String(file.gzip).padStart(7)} B ${String(file.brotli).padStart(7)} B`);
  }
  console.log(`${'TOTAL'.padEnd(16)} ${String(metrics.totals.raw).padStart(7)} B ${String(metrics.totals.gzip).padStart(7)} B ${String(metrics.totals.brotli).padStart(7)} B`);
  console.log('');
  if (metrics.tokens) {
    console.log(`tokens      ${metrics.tokens.defined} definidos, ${metrics.tokens.themes.length} temas, ${metrics.tokens.schemes.length} esquemas`);
    console.log(`contraste   ${metrics.tokens.pairs - metrics.tokens.failures}/${metrics.tokens.pairs} pares pasan` +
      (metrics.tokens.worst ? ` · peor ${metrics.tokens.worst.id} ${metrics.tokens.worst.ratio}:1` : ''));
  }
  if (metrics.css) {
    console.log(`componentes ${metrics.css.components} clases .b-*, ${metrics.css.rules} reglas, ${metrics.css.hardcodedColors} colores a mano`);
  }
  if (metrics.page) {
    console.log(`portada     ${metrics.page.requests} peticiones, ${metrics.page.ariaAttributes} aria, ${metrics.page.inlineStyleAttributes} estilos en linea`);
  }

  if (before) {
    console.log('');
    console.log('Metrica                            antes        despues      delta');
    for (const row of rows) {
      console.log(`${row.label.padEnd(34)} ${String(row.format(row.before)).padStart(11)} ${String(row.format(row.after)).padStart(12)} ${pct(row.before, row.after).padStart(10)}`);
    }
  }
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('audit.mjs')) {
  process.exit(main(process.argv.slice(2)));
}

export { fmt };
