#!/usr/bin/env node
/**
 * Resume los resultados de Lighthouse CI (ficheros lhr-*.json) en una tabla con
 * la MEDIANA de las pasadas de cada URL. No inventa nada: si no hay datos, lo dice.
 *
 * Uso:
 *   node scripts/lighthouse-summary.mjs --dir .lighthouseci
 *   node scripts/lighthouse-summary.mjs --dir .lighthouseci --markdown
 *   node scripts/lighthouse-summary.mjs --dir .lighthouseci --json
 *   node scripts/lighthouse-summary.mjs --help
 *
 * Pensado para el job de CI: escribe la tabla en el step summary y, si hay PR,
 * la publica como comentario para que el numero quede a la vista y auditable.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const METRICS = [
  ['first-contentful-paint', 'FCP', 's'],
  ['largest-contentful-paint', 'LCP', 's'],
  ['total-blocking-time', 'TBT', 'ms'],
  ['cumulative-layout-shift', 'CLS', ''],
  ['speed-index', 'SI', 's'],
];

const CATEGORIES = [
  ['performance', 'Rendimiento'],
  ['accessibility', 'Accesibilidad'],
  ['best-practices', 'Buenas practicas'],
  ['seo', 'SEO'],
];

export function findReports(dir) {
  if (!existsSync(dir)) return [];
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/^lhr-.*\.json$/.test(entry.name)) found.push(path);
    }
  };
  walk(dir);
  return found.sort();
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const formatMetric = (audit, unit) => {
  if (!audit || audit.numericValue == null) return '—';
  const value = audit.numericValue;
  if (unit === 'ms') return `${Math.round(value)} ms`;
  if (unit === 's') return `${(value / 1000).toFixed(2)} s`;
  return value.toFixed(3);
};

/**
 * @param {string[]} reports rutas de lhr-*.json
 * @returns {{urls: Array, runs: number}}
 */
export function summarize(reports) {
  const byUrl = new Map();
  for (const path of reports) {
    const lhr = JSON.parse(readFileSync(path, 'utf8'));
    const url = lhr.finalDisplayedUrl || lhr.finalUrl || lhr.requestedUrl || path;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(lhr);
  }
  const urls = [...byUrl.entries()].map(([url, runs]) => {
    const scores = {};
    for (const [key] of CATEGORIES) {
      scores[key] = median(runs.map((lhr) => lhr.categories?.[key]?.score).filter((v) => typeof v === 'number'));
    }
    const metrics = {};
    for (const [key, label, unit] of METRICS) {
      const values = runs
        .map((lhr) => lhr.audits?.[key])
        .filter((audit) => audit && typeof audit.numericValue === 'number');
      metrics[`${label} (${unit || 'ratio'})`] = median(values.map((audit) => audit.numericValue));
      metrics[`${label}__unit`] = unit;
    }
    return { url, runs: runs.length, scores, metrics, raw: runs };
  });
  return { urls, runs: reports.length };
}

export function toMarkdown(summary) {
  if (summary.urls.length === 0) {
    return 'Sin resultados de Lighthouse: no se ha medido nada, no hay numeros que ensenar.';
  }
  const header = ['Pagina', 'Pasadas', ...CATEGORIES.map(([, label]) => label), 'FCP', 'LCP', 'TBT', 'CLS', 'SI'];
  const lines = [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
  ];
  for (const entry of summary.urls) {
    const path = entry.url.replace(/^https?:\/\/[^/]+/, '') || '/';
    const scores = CATEGORIES.map(([key]) => (entry.scores[key] == null ? '—' : Math.round(entry.scores[key] * 100)));
    const metric = (label, unit) => {
      const value = entry.metrics[`${label} (${unit || 'ratio'})`];
      if (value == null) return '—';
      return formatMetric({ numericValue: value }, unit);
    };
    lines.push(`| \`${path}\` | ${entry.runs} | ${scores.join(' | ')} | ${metric('FCP', 's')} | ${metric('LCP', 's')} | ${metric('TBT', 'ms')} | ${metric('CLS', '')} | ${metric('SI', 's')} |`);
  }
  const allScores = summary.urls.flatMap((entry) => Object.values(entry.scores)).filter((v) => typeof v === 'number');
  const worst = allScores.length ? Math.min(...allScores) : null;
  lines.push('');
  lines.push(`Medianas de ${summary.runs} pasadas. Peor categoria: ${worst == null ? '—' : Math.round(worst * 100)} / 100. Umbral del gate: 95.`);
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { dir: '.lighthouseci', format: 'text' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dir' || argv[i] === '-d') args.dir = argv[++i];
    else if (argv[i] === '--markdown') args.format = 'markdown';
    else if (argv[i] === '--json') args.format = 'json';
  }
  return args;
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Resume los resultados de Lighthouse CI.

Uso:
  node scripts/lighthouse-summary.mjs --dir .lighthouseci [--markdown|--json]

Opciones:
  --dir, -d <ruta>  Carpeta con los lhr-*.json (por defecto .lighthouseci)
  --markdown        Tabla markdown (para GITHUB_STEP_SUMMARY o un PR)
  --json            Salida JSON con medianas por pagina
  --help, -h        Esta ayuda

Calcula la mediana de las pasadas por URL: una sola pasada en un runner compartido
no es una medida, es una anecdota.`);
    return 0;
  }
  const args = parseArgs(argv);
  const summary = summarize(findReports(args.dir));
  if (args.format === 'json') console.log(JSON.stringify(summary, null, 2));
  else if (args.format === 'markdown') console.log(toMarkdown(summary));
  else console.log(toMarkdown(summary));
  return summary.urls.length === 0 ? 1 : 0;
}

if (process.argv[1] && process.argv[1].endsWith('lighthouse-summary.mjs')) {
  process.exit(main(process.argv.slice(2)));
}
