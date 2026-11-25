#!/usr/bin/env node
/**
 * Servidor estatico de previsualizacion y de tests e2e. Sin dependencias.
 * Sirve con tipos MIME correctos, sin cache (para ver cambios al recargar) y
 * con 404 propio.
 *
 * Uso:
 *   node scripts/serve.mjs                 http://0.0.0.0:4173
 *   node scripts/serve.mjs --port 8080
 *   node scripts/serve.mjs --root _site
 *   node scripts/serve.mjs --help
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, resolve, sep } from 'node:path';

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Arranca el servidor. Puerto 0 pide uno libre al sistema (lo usan los tests).
 * @returns {Promise<{server:import('node:http').Server, port:number, close:()=>Promise<void>, url:string}>}
 */
const COMPRESSIBLE = /^(?:text\/|application\/(?:json|xml|javascript)|image\/svg\+xml)/;

export function startServer({ port = 4173, root = DEFAULT_ROOT, host = '0.0.0.0', quiet = false } = {}) {
  const base = resolve(root);

  const server = createServer((req, res) => {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' });
      res.end('Metodo no permitido');
      return;
    }

    let pathname = '/';
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('URL invalida');
      return;
    }

    const relative = normalize(pathname).replace(/^([/\\])+/, '');
    let file = resolve(base, relative);
    if (file !== base && !file.startsWith(base + sep)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Fuera de la raiz');
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');

    const send = (status, target, extraHeaders = {}) => {
      const type = MIME[extname(target).toLowerCase()] ?? 'application/octet-stream';
      // gzip en caliente: el servidor de desarrollo se parece a Pages, y Lighthouse
      // mide lo que se sirve de verdad, no un fichero crudo.
      const wantsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
      let body = readFileSync(target);
      const compress = wantsGzip && COMPRESSIBLE.test(type) && body.length > 256;
      if (compress) body = gzipSync(body, { level: 6 });
      res.writeHead(status, {
        'content-type': type,
        'content-length': String(body.length),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        ...(compress ? { 'content-encoding': 'gzip', vary: 'accept-encoding' } : {}),
        ...extraHeaders,
      });
      res.end(method === 'HEAD' ? undefined : body);
    };

    if (existsSync(file) && statSync(file).isFile()) {
      if (!quiet) console.log(`${method} ${pathname} 200`);
      send(200, file);
      return;
    }

    const notFound = join(base, '404.html');
    if (existsSync(notFound)) {
      if (!quiet) console.log(`${method} ${pathname} 404`);
      send(404, notFound);
      return;
    }
    if (!quiet) console.log(`${method} ${pathname} 404`);
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  });

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const actual = server.address().port;
      resolvePromise({
        server,
        port: actual,
        url: `http://127.0.0.1:${actual}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function parseArgs(argv) {
  const args = { port: Number(process.env.PORT ?? 4173), root: DEFAULT_ROOT, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--port' || arg === '-p') args.port = Number(argv[++i]);
    else if (arg === '--root' || arg === '-r') args.root = resolve(argv[++i]);
    else if (arg === '--quiet' || arg === '-q') args.quiet = true;
  }
  return args;
}

function help() {
  console.log(`Servidor estatico del sistema (sin dependencias).

Uso:
  node scripts/serve.mjs [opciones]

Opciones:
  --port, -p <n>   Puerto (por defecto 4173 o $PORT; 0 = libre)
  --root, -r <dir> Directorio raiz (por defecto la raiz del repo)
  --quiet, -q      Sin log de peticiones
  --help, -h       Esta ayuda

Sirve con cache-control: no-store y 404.html propio. Escucha en 0.0.0.0 para
que la previsualizacion remota pueda alcanzarlo.`);
}

if (process.argv[1] && process.argv[1].endsWith('serve.mjs')) {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    help();
    process.exit(0);
  }
  const args = parseArgs(argv);
  startServer(args).then(({ port, url }) => {
    console.log(`Belentani Design servido en ${url} (puerto ${port}, raiz ${args.root})`);
    console.log('Ctrl+C para parar.');
  }).catch((error) => {
    console.error(`No se pudo arrancar: ${error.message}`);
    process.exit(1);
  });
}
