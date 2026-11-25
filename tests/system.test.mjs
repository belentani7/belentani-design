import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChecks } from '../scripts/check-design.mjs';
import { renderTokensPage } from '../scripts/build-tokens.mjs';
import { parseTags, documentText, parseInlineStyle } from '../scripts/lib/html.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const { errors, findings, stats } = runChecks();

test('el gate del sistema no tiene ni un error', () => {
  assert.deepEqual(errors.map((item) => `${item.id}: ${item.message}`), []);
});

test('no hay avisos de tokens muertos ni de contrato', () => {
  const warnings = findings.filter((item) => item.level === 'warn');
  assert.deepEqual(warnings.map((item) => `${item.id}: ${item.message}`), []);
});

test('la portada se mantiene dentro del presupuesto de bytes', () => {
  assert.ok(stats.files.shippingGzip < 14 * 1024, `portada ${stats.files.shippingGzip} bytes gzip`);
  assert.ok(stats.files.bytes['design.css'] < 24 * 1024);
  assert.ok(stats.files.bytes['design.js'] < 8 * 1024);
  assert.ok(stats.files.bytes['tokens.css'] < 8 * 1024);
});

test('tokens.html esta generado y al dia', () => {
  assert.ok(existsSync(join(ROOT, 'tokens.html')));
  const { html } = renderTokensPage();
  assert.equal(read('tokens.html'), html, 'tokens.html desactualizado: ejecuta npm run tokens');
});

test('index.html adopta el sistema como cualquier otra web', () => {
  const html = read('index.html');
  const htmlTag = parseTags(html).find((tag) => tag.tag === 'html' && !tag.closing);
  assert.equal(htmlTag.attrs['data-theme'], 'indigo');
  assert.match(html, /<link rel='stylesheet' href='tokens\.css'>/);
  assert.match(html, /<link rel='stylesheet' href='design\.css'>/);
  assert.match(html, /<script src='design\.js' defer><\/script>/);
});

test('la pagina no depende de ningun origen externo', () => {
  for (const file of ['index.html', 'tokens.html', '404.html']) {
    const tags = parseTags(read(file)).filter((tag) => !tag.closing);
    for (const tag of tags) {
      if (tag.tag === 'a') continue;
      for (const attr of ['src', 'href']) {
        const value = tag.attrs[attr] ?? '';
        const isDoc = tag.tag === 'link' && ['canonical', 'alternate'].includes(tag.attrs.rel ?? '');
        if (isDoc) continue;
        assert.ok(!/^https?:/.test(value), `${file} carga ${value} de otro origen`);
      }
    }
  }
});

test('cada pagina tiene su estructura accesible minima', () => {
  for (const file of ['index.html', 'tokens.html', '404.html']) {
    const html = read(file);
    const tags = parseTags(html).filter((tag) => !tag.closing);
    assert.equal(tags.filter((tag) => tag.tag === 'h1').length, 1, `${file}: h1`);
    assert.equal(tags.filter((tag) => tag.tag === 'main').length, 1, `${file}: main`);
    assert.ok(tags.some((tag) => /b-skip/.test(tag.attrs.class ?? '')), `${file}: enlace de salto`);
    assert.ok(tags.some((tag) => tag.attrs['data-toggle-scheme'] != null), `${file}: conmutador de esquema`);
    const ids = tags.map((tag) => tag.attrs.id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, `${file}: ids duplicados`);
  }
});

test('los estilos en linea solo transportan datos, no diseno', () => {
  for (const file of ['index.html', 'tokens.html', '404.html']) {
    const tags = parseTags(read(file)).filter((tag) => !tag.closing && tag.attrs.style != null);
    for (const tag of tags) {
      for (const declaration of parseInlineStyle(tag.attrs.style)) {
        assert.ok(declaration.prop.startsWith('--'), `${file}: ${declaration.prop} deberia ser una clase`);
        assert.match(declaration.value, /^(?:var\(--[\w-]+\)|\d+(?:\.\d+)?%)$/, `${file}: ${declaration.prop}:${declaration.value}`);
      }
    }
  }
});

test('la demo no engania: el formulario es real y no envia datos', () => {
  const html = read('index.html');
  assert.match(html, /<form[^>]*data-demo-form/);
  assert.match(html, /type='email'[^>]*required|required[^>]*type='email'/);
  assert.match(html, /role='status'/);
  assert.doesNotMatch(html, /action=['"]https?:/);
});

test('el texto visible no queda vacio y el idioma esta declarado', () => {
  const html = read('index.html');
  assert.ok(documentText(html).length > 1200);
  assert.match(html, /<html lang='es'/);
});
