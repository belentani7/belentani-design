/**
 * Test end-to-end del camino feliz, sin navegador: se levanta el servidor real
 * del repo en un puerto libre y se pide lo mismo que pediria el navegador.
 * Lo que este test no cubre (pintado, foco, contraste percibido) lo cubre
 * Lighthouse + axe en .github/workflows/ci.yml con un Chrome de verdad.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../scripts/serve.mjs';
import { parseTags } from '../scripts/lib/html.mjs';

let server;

before(async () => {
  server = await startServer({ port: 0, quiet: true });
});

after(async () => {
  await server.close();
});

const get = async (path) => {
  const response = await fetch(server.url + path, { redirect: 'manual' });
  return { response, body: await response.text() };
};

test('la portada responde 200 y es HTML con sus enlaces resueltos', async () => {
  const { response, body } = await get('/');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html; charset=utf-8/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.ok(body.includes('Belentani Design'));

  const tags = parseTags(body).filter((tag) => !tag.closing);
  const resources = tags
    .filter((tag) => (tag.tag === 'link' && tag.attrs.rel === 'stylesheet') || (tag.tag === 'script' && tag.attrs.src))
    .map((tag) => tag.attrs.href ?? tag.attrs.src);
  assert.deepEqual(resources.sort(), ['design.css', 'design.js', 'tokens.css']);

  for (const resource of resources) {
    const result = await get(`/${resource}`);
    assert.equal(result.response.status, 200, `${resource} no responde 200`);
  }
});

test('los tipos MIME son los correctos para CSS, JS, SVG y HTML', async () => {
  const expectations = [
    ['/tokens.css', /^text\/css; charset=utf-8/],
    ['/design.css', /^text\/css; charset=utf-8/],
    ['/design.js', /^text\/javascript; charset=utf-8/],
    ['/favicon.svg', /^image\/svg\+xml/],
    ['/404.html', /^text\/html; charset=utf-8/],
    ['/tokens.html', /^text\/html; charset=utf-8/],
  ];
  for (const [path, expected] of expectations) {
    const { response } = await get(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), expected, path);
  }
});

test('el CSS servido define los tokens que la portada usa', async () => {
  const { body } = await get('/tokens.css');
  for (const token of ['--bg', '--ink', '--brand', '--control', '--nav-h', '--hairline']) {
    assert.ok(body.includes(`${token}:`), `falta ${token} en tokens.jss`);
  }
  const design = (await get('/design.css')).body;
  for (const selector of ['.b-btn', '.b-card', '.b-nav__toggle', '.b-visually-hidden']) {
    assert.ok(design.includes(selector), `falta ${selector}`);
  }
});

test('una ruta inexistente devuelve 404 con la pagina del sistema', async () => {
  const { response, body } = await get('/no-existe');
  assert.equal(response.status, 404);
  assert.match(body, /error 404/);
  assert.match(body, /Volver a la demo/);
});

test('HEAD no devuelve cuerpo y sigue informando del tipo', async () => {
  const response = await fetch(server.url + '/tokens.css', { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/css/);
  assert.equal(await response.text(), '');
});

test('no sirve ficheros fuera de la raiz', async () => {
  const response = await fetch(`${server.url}/..%2f..%2fetc%2fpasswd`, { redirect: 'manual' });
  assert.ok([400, 403, 404].includes(response.status), `estado inesperado: ${response.status}`);
  const body = await response.text();
  assert.ok(!body.includes('root:x:'), 'se ha servido /etc/passwd');
});

test('rechaza metodos distintos de GET y HEAD', async () => {
  const response = await fetch(server.url + '/', { method: 'POST' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});

test('la pagina de tokens incluye la matriz de contraste medida', async () => {
  const { body } = await get('/tokens.html');
  assert.match(body, /Contraste medido en esquema dark/);
  assert.match(body, /Contraste medido en esquema light/);
  assert.doesNotMatch(body, /is-fail/, 'hay celdas marcadas como fallo');
  assert.ok((body.match(/is-pass/g) ?? []).length >= 384);
});
