import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findReports, summarize, toMarkdown } from '../scripts/lighthouse-summary.mjs';

const report = (url, { perf, lcp, a11y = 1 }) => ({
  finalDisplayedUrl: url,
  categories: {
    performance: { score: perf },
    accessibility: { score: a11y },
    'best-practices': { score: 1 },
    seo: { score: 1 },
  },
  audits: {
    'first-contentful-paint': { numericValue: 800 },
    'largest-contentful-paint': { numericValue: lcp },
    'total-blocking-time': { numericValue: 0 },
    'cumulative-layout-shift': { numericValue: 0 },
    'speed-index': { numericValue: 900 },
  },
});

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'lh-'));
  for (const [name, data] of Object.entries(files)) {
    mkdirSync(join(dir, 'sub'), { recursive: true });
    writeFileSync(join(dir, name), JSON.stringify(data));
  }
  return dir;
}

test('encuentra los lhr incluso en subcarpetas y sin carpeta no falla', () => {
  const dir = fixture({ 'lhr-1.json': report('http://x/', { perf: 1, lcp: 900 }) });
  assert.equal(findReports(dir).length, 1);
  assert.deepEqual(findReports(join(dir, 'no-existe')), []);
  rmSync(dir, { recursive: true, force: true });
});

test('usa la mediana, no la mejor pasada', () => {
  const dir = fixture({
    'lhr-1.json': report('http://x/', { perf: 1, lcp: 900 }),
    'lhr-2.json': report('http://x/', { perf: 0.95, lcp: 950 }),
    'lhr-3.json': report('http://x/', { perf: 0.9, lcp: 1000 }),
  });
  const summary = summarize(findReports(dir));
  assert.equal(summary.urls.length, 1);
  assert.equal(summary.urls[0].runs, 3);
  assert.equal(summary.urls[0].scores.performance, 0.95);
  assert.equal(summary.urls[0].metrics['LCP (s)'], 950);
  rmSync(dir, { recursive: true, force: true });
});

test('con un numero par de pasadas promedia las dos centrales', () => {
  const dir = fixture({
    'lhr-1.json': report('http://x/', { perf: 1, lcp: 900 }),
    'lhr-2.json': report('http://x/', { perf: 0.9, lcp: 1000 }),
  });
  const summary = summarize(findReports(dir));
  assert.equal(summary.urls[0].scores.performance, 0.95);
  assert.equal(summary.urls[0].metrics['LCP (s)'], 950);
  rmSync(dir, { recursive: true, force: true });
});

test('separa por pagina y marca el peor resultado', () => {
  const dir = fixture({
    'lhr-1.json': report('http://x/', { perf: 1, lcp: 900 }),
    'lhr-2.json': report('http://x/tokens.html', { perf: 0.86, lcp: 1200 }),
  });
  const markdown = toMarkdown(summarize(findReports(dir)));
  assert.match(markdown, /`\/`/);
  assert.match(markdown, /`\/tokens\.html`/);
  assert.match(markdown, /Peor categoria: 86 \/ 100/);
  rmSync(dir, { recursive: true, force: true });
});

test('sin resultados lo dice en vez de inventar una tabla', () => {
  const markdown = toMarkdown({ urls: [], runs: 0 });
  assert.match(markdown, /Sin resultados de Lighthouse/);
});
