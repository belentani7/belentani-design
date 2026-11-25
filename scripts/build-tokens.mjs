#!/usr/bin/env node
/**
 * Genera tokens página (tokens.html) a partir de tokens.css.
 * Todo lo que se muestra (valores, escalas, ratios de contraste) se calcula
 * aqui: la pagina no repite numeros a mano y no puede mentir.
 *
 * Uso:
 *   node scripts/build-tokens.mjs           # escribe tokens.html
 *   node scripts/build-tokens.mjs --check   # falla si tokens.html esta obsoleto
 *   node scripts/build-tokens.mjs --help
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  loadSystem,
  measureSystem,
  CONTRAST_PAIRS,
  paletteColor,
  measurePair,
} from './lib/tokens.mjs';
import { toHex, formatRatio, contrastRatio } from './lib/color.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'tokens.html');

const esc = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const THEME_LABEL = {
  indigo: 'Indigo',
  navy: 'Navy',
  gold: 'Gold',
  emerald: 'Emerald',
  warm: 'Warm',
  violet: 'Violet',
};

const THEME_USE = {
  indigo: 'Belentani workspace, open-manus',
  navy: 'Open School',
  gold: 'Credenciales y certificados',
  emerald: 'Lingua Abierta',
  warm: 'belentani-portfolio',
  violet: 'Secure T',
};

const COLOR_GROUPS = [
  {
    title: 'Superficies',
    tokens: ['bg', 'bg-elev', 'surface', 'surface-2', 'nav-bg', 'nav-bg-solid'],
  },
  {
    title: 'Texto',
    tokens: ['ink', 'ink-soft', 'muted'],
  },
  {
    title: 'Marca',
    tokens: ['brand', 'brand-strong', 'brand-soft', 'brand-ink', 'brand-line', 'brand-glow', 'on-brand', 'accent'],
  },
  {
    title: 'Estado',
    tokens: ['ok', 'ok-ink', 'ok-soft', 'ok-line', 'warn', 'warn-ink', 'warn-soft', 'warn-line', 'bad', 'bad-ink', 'bad-soft', 'bad-line'],
  },
  {
    title: 'Lineas',
    tokens: ['line', 'line-soft', 'line-strong'],
  },
];

const TYPE_TOKENS = [
  ['--t--1', 'Micro: insignias, hints, kickers'],
  ['--t-0', 'Base: nav, tablas, botones'],
  ['--t-1', 'Cuerpo'],
  ['--t-2', 'Lead y titulo de tarjeta'],
  ['--t-3', 'Subtitulo de prosa'],
  ['--t-4', 'Titulo de seccion'],
  ['--t-5', 'Titulo de pagina'],
  ['--t-6', 'Display del hero'],
];

const SPACE_TOKENS = ['--s-1', '--s-2', '--s-3', '--s-4', '--s-5', '--s-6', '--s-7', '--s-8', '--s-9'];

const RADIUS_TOKENS = [
  ['--r-sm', 'Controles y foco'],
  ['--r', 'Inputs y bloques de codigo'],
  ['--r-lg', 'Tarjetas'],
  ['--r-xl', 'Paneles'],
  ['--r-full', 'Botones e insignias'],
];

const MOTION_TOKENS = [
  ['--ease', 'Curva unica del sistema'],
  ['--dur', 'Transiciones de estado'],
  ['--dur-slow', 'Revelado al hacer scroll'],
];

function swatch(value) {
  return `<span class="b-chip" style="--c:${esc(value)}" aria-hidden="true"></span>`;
}

function colorValue(palette, token) {
  const value = palette.resolved.get(token);
  return value ?? '(no definido)';
}

function colorRow(palette, token, baseToken) {
  const value = colorValue(palette, token);
  let hex = '—';
  let ratio = '—';
  try {
    const color = paletteColor(palette, token);
    hex = color.a === 1 ? toHex(color) : `${toHex(color)} · ${Math.round(color.a * 100)}%`;
    const base = paletteColor(palette, baseToken);
    ratio = formatRatio(contrastRatio(color, base));
  } catch {
    hex = '—';
  }
  return `<tr>
        <td>${swatch(`var(${token})`)}</td>
        <td><code>${esc(token)}</code></td>
        <td class="b-mono">${esc(value)}</td>
        <td class="b-mono">${esc(hex)}</td>
        <td class="b-mono b-right">${esc(ratio)}</td>
      </tr>`;
}

function contrastCell(pair, palette) {
  const measured = measurePair(palette, pair);
  const ok = measured.pass;
  return `<td class="b-mono ${ok ? 'is-pass' : 'is-fail'}">${formatRatio(measured.ratio)}<span class="b-visually-hidden"> ${ok ? 'pasa' : 'falla'} el minimo ${pair.min}:1</span></td>`;
}

function renderContrastTable(system, measure, scheme) {
  const themes = system.themes;
  const rows = CONTRAST_PAIRS.map((pair) => {
    const cells = themes
      .map((theme) => {
        const entry = measure.find((m) => m.theme === theme && m.scheme === scheme);
        return contrastCell(pair, entry.palette);
      })
      .join('');
    return `<tr>
            <th scope="row"><code>${esc(pair.id)}</code><span class="b-hint">${esc(pair.fg)} sobre ${esc(pair.bg)}${pair.bases ? ' (peor caso)' : ''}</span></th>
            <td class="b-mono">${pair.min}:1</td>
            ${cells}
          </tr>`;
  }).join('\n');

  return `<div class="b-table-wrap">
        <table class="b-table b-table--matrix">
          <caption>Contraste medido en esquema ${esc(scheme)}. Un valor en rojo incumple WCAG.</caption>
          <thead>
            <tr>
              <th scope="col">Par</th>
              <th scope="col">Minimo</th>
              ${themes.map((theme) => `<th scope="col">${esc(THEME_LABEL[theme] ?? theme)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
${rows}
          </tbody>
        </table>
      </div>`;
}

function themeSummary(measure, theme) {
  const dark = measure.find((m) => m.theme === theme && m.scheme === 'dark');
  const light = measure.find((m) => m.theme === theme && m.scheme === 'light');
  const worst = (entry) => {
    if (!entry) return null;
    const failing = entry.pairs.filter((p) => !p.pass);
    const min = entry.pairs.reduce((acc, p) => Math.min(acc, p.ratio / p.min), Infinity);
    return { failing: failing.length, min };
  };
  return { dark: worst(dark), light: worst(light) };
}

function renderThemeCards(system, measure) {
  return system.themes.map((theme) => {
    const darkPalette = system.palettes.find((p) => p.env['data-theme'] === theme && p.env['data-scheme'] === 'dark');
    const summary = themeSummary(measure, theme);
    const status = (slot, label) => {
      if (!slot) return `<span class="b-badge">${label}: sin medir</span>`;
      return slot.failing === 0
        ? `<span class="b-badge is-ok"><span class="b-dot"></span>${label}: AA</span>`
        : `<span class="b-badge is-bad"><span class="b-dot"></span>${label}: ${slot.failing} fallo(s)</span>`;
    };
    const hue = darkPalette?.resolved.get('--h') ?? '-';
    const hue2 = darkPalette?.resolved.get('--h2') ?? '-';
    return `<article class="b-card b-reveal" data-theme="${esc(theme)}">
          <div class="b-swatch" aria-hidden="true"></div>
          <h3 class="b-card__title">${esc(THEME_LABEL[theme] ?? theme)}</h3>
          <p class="b-card__text">${esc(THEME_USE[theme] ?? 'Uso libre')} · <span class="b-mono">--h:${esc(hue)} --h2:${esc(hue2)}</span></p>
          <div class="b-cluster b-cluster--sm b-mt">${status(summary.dark, 'oscuro')}${status(summary.light, 'claro')}</div>
        </article>`;
  }).join('\n');
}

function renderColorGroups(system) {
  return ['dark', 'light'].map((scheme) => {
    const palette = system.palettes.find((p) => p.env['data-theme'] === 'indigo' && p.env['data-scheme'] === scheme);
    const groups = COLOR_GROUPS.map((group) => {
      const rows = group.tokens
        .map((token) => colorRow(palette, `--${token}`, token.startsWith('brand') || token === 'on-brand' ? '--bg' : '--bg'))
        .join('\n');
      return `<h3 class="b-scale__title">${esc(group.title)}</h3>
        <div class="b-table-wrap">
          <table class="b-table">
            <caption class="b-visually-hidden">Tokens de ${esc(group.title.toLowerCase())} en esquema ${esc(scheme)}</caption>
            <thead>
              <tr><th scope="col">Muestra</th><th scope="col">Token</th><th scope="col">Valor</th><th scope="col">Hex</th><th scope="col" class="b-right">Sobre fondo</th></tr>
            </thead>
            <tbody>
${rows}
            </tbody>
          </table>
        </div>`;
    }).join('\n');
    return `<div class="b-stack b-stack--md b-reveal" data-scheme="${esc(scheme)}">
        <h2 class="b-section__title">Esquema ${esc(scheme === 'dark' ? 'oscuro' : 'claro')}</h2>
        <p class="b-hint">Tema Indigo, sobre <code>--bg</code>. El resto de temas comparten estructura y solo cambian <code>--h</code> y <code>--h2</code>.</p>
${groups}
      </div>`;
  }).join('\n');
}

function renderTypeScale(system) {
  const palette = system.palettes.find((p) => p.env['data-theme'] === 'indigo' && p.env['data-scheme'] === 'dark');
  return TYPE_TOKENS.map(([token, use]) => {
    const value = palette.resolved.get(token) ?? '';
    return `<div class="b-scale__row">
          <code class="b-scale__token">${esc(token)}</code>
          <span class="b-scale__sample" style="--sample:var(${esc(token)})">Aa</span>
          <span class="b-hint">${esc(use)}</span>
          <code class="b-mono b-scale__value">${esc(value)}</code>
        </div>`;
  }).join('\n');
}

function renderSpaceScale(system) {
  const palette = system.palettes.find((p) => p.env['data-theme'] === 'indigo' && p.env['data-scheme'] === 'dark');
  return SPACE_TOKENS.map((token) => {
    const value = palette.resolved.get(token) ?? '';
    return `<div class="b-scale__row">
          <code class="b-scale__token">${esc(token)}</code>
          <span class="b-scale__bar" style="--w:var(${esc(token)})" aria-hidden="true"></span>
          <code class="b-mono b-scale__value">${esc(value)}</code>
        </div>`;
  }).join('\n');
}

function renderSimpleScale(system, entries, kind) {
  const palette = system.palettes.find((p) => p.env['data-theme'] === 'indigo' && p.env['data-scheme'] === 'dark');
  return entries
    .map(([token, use]) => {
      const value = palette.resolved.get(token) ?? '';
      const preview =
        kind === 'radius'
          ? `<span class="b-scale__radius" style="--r-sample:var(${esc(token)})" aria-hidden="true"></span>`
          : `<span class="b-scale__motion" aria-hidden="true"></span>`;
      return `<div class="b-scale__row">
          <code class="b-scale__token">${esc(token)}</code>
          ${preview}
          <span class="b-hint">${esc(use)}</span>
          <code class="b-mono b-scale__value">${esc(value)}</code>
        </div>`;
    })
    .join('\n');
}

export function renderTokensPage() {
  const system = loadSystem(readFileSync(join(ROOT, 'tokens.css'), 'utf8'));
  const measure = measureSystem(system).map((entry) => ({
    ...entry,
    palette: system.palettes.find(
      (p) => p.env['data-theme'] === entry.theme && p.env['data-scheme'] === entry.scheme,
    ),
  }));
  const failures = measure.flatMap((entry) => entry.pairs.filter((p) => !p.pass));
  const totalPairs = measure.length * CONTRAST_PAIRS.length;
  const tokenCount = system.base.resolved.size;
  const colorTokens = system.base.resolved.size;

  const generated = `<!-- Generado por scripts/build-tokens.mjs desde tokens.css. No editar a mano. -->
<!doctype html>
<html lang='es' data-theme='indigo'>
<head>
<meta charset='utf-8'>
<meta name='viewport' content='width=device-width, initial-scale=1'>
<title>Tokens medidos - Belentani Design</title>
<meta name='description' content='Referencia generada del sistema: ${tokenCount} tokens, ${system.themes.length} temas y ${totalPairs} pares de contraste medidos contra WCAG 2.2.'>
<meta name='color-scheme' content='dark light'>
<meta name='theme-color' content='#0a0a0f' media='(prefers-color-scheme: dark)'>
<meta name='theme-color' content='#fcfcfd' media='(prefers-color-scheme: light)'>
<link rel='icon' href='favicon.svg' type='image/svg+xml'>
<meta property='og:title' content='Tokens medidos - Belentani Design'>
<meta property='og:type' content='website'>
<meta property='og:locale' content='es_ES'>
<link rel='canonical' href='https://www.belentani.es/belentani-design/tokens.html'>
<link rel='stylesheet' href='tokens.css'>
<link rel='stylesheet' href='design.css'>
<script>
  (function () {
    var root = document.documentElement;
    root.classList.add('js');
    try {
      var saved = localStorage.getItem('b-scheme');
      var scheme = saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      root.dataset.scheme = scheme;
    } catch (e) {}
  })();
</script>
</head>
<body>
<div class='b-shell'>
<header class='b-nav'>
  <a class='b-skip' href='#contenido'>Saltar al contenido</a>
  <div class='b-container b-nav__inner'>
    <a class='b-brand' href='index.html'><span class='b-brand__mark' aria-hidden='true'></span>Belentani Design</a>
    <nav class='b-nav__links' id='nav-menu' aria-label='Secciones'>
      <a href='index.html#sistema'>Sistema</a>
      <a href='index.html#temas'>Temas</a>
      <a href='index.html#componentes'>Componentes</a>
      <a href='tokens.html' aria-current='page'>Tokens</a>
    </nav>
    <div class='b-cluster b-cluster--sm'>
      <button class='b-btn is-quiet is-sm b-nav__toggle' type='button' data-nav-toggle aria-expanded='false' aria-controls='nav-menu'>
        <span class='b-burger' aria-hidden='true'></span>
        <span class='b-visually-hidden'>Secciones</span>
      </button>
      <button class='b-btn is-quiet is-sm' type='button' data-toggle-scheme aria-pressed='false'>Claro / oscuro</button>
      <a class='b-btn is-primary is-sm' href='index.html#adoptar'>Adoptar</a>
    </div>
  </div>
</header>

<main class='b-main' id='contenido'>
  <section class='b-hero'>
    <div class='b-hero__bg' aria-hidden='true'></div>
    <div class='b-hero__grid' aria-hidden='true'></div>
    <div class='b-container'>
      <div class='b-stack b-stack--md b-measure'>
        <span class='b-eyebrow'><span class='b-dot'></span>generado desde tokens.css</span>
        <h1 class='b-display'>Tokens medidos,<br>no <em>estimados</em>.</h1>
        <p class='b-lead'>Esta pagina la produce <code>scripts/build-tokens.mjs</code> leyendo el CSS. Los ${totalPairs} ratios de contraste los calcula el mismo codigo que falla el build si baja del minimo.</p>
        <div class='b-cluster'>
          <a class='b-btn is-primary' href='#contraste'>Ver la matriz de contraste</a>
          <a class='b-btn is-ghost' href='#paletas'>Explorar paletas</a>
        </div>
        <div class='b-cluster b-cluster--lg'>
          <div class='b-stat'><b>${tokenCount}</b><span>tokens</span></div>
          <div class='b-stat'><b>${system.themes.length}</b><span>temas</span></div>
          <div class='b-stat'><b>${system.schemes.length}</b><span>esquemas</span></div>
          <div class='b-stat'><b>${failures.length}</b><span>fallos AA</span></div>
        </div>
      </div>
    </div>
  </section>

  <section class='b-section' id='temas'>
    <div class='b-container'>
      <div class='b-section__head b-reveal'>
        <span class='b-kicker'>01 - temas</span>
        <h2 class='b-section__title'>Seis identidades, un esqueleto</h2>
      </div>
      <div class='b-grid b-grid--sm'>
${renderThemeCards(system, measure)}
      </div>
    </div>
  </section>

  <section class='b-section' id='paletas'>
    <div class='b-container'>
      <div class='b-section__head b-reveal'>
        <span class='b-kicker'>02 - paletas</span>
        <h2 class='b-section__title'>Cada color, su valor</h2>
      </div>
      <div class='b-stack b-stack--lg'>
${renderColorGroups(system)}
      </div>
    </div>
  </section>

  <section class='b-section' id='escalas'>
    <div class='b-container'>
      <div class='b-section__head b-reveal'>
        <span class='b-kicker'>03 - escalas</span>
        <h2 class='b-section__title'>Tipografia, espacio, radio y movimiento</h2>
      </div>
      <div class='b-split b-split--start'>
        <div class='b-card b-reveal'>
          <h2 class='b-card__title'>Escala tipografica</h2>
          <div class='b-stack b-stack--xs'>
${renderTypeScale(system)}
          </div>
        </div>
        <div class='b-card b-reveal'>
          <h2 class='b-card__title'>Espacio</h2>
          <div class='b-stack b-stack--xs'>
${renderSpaceScale(system)}
          </div>
          <h2 class='b-card__title b-mt-lg'>Radio</h2>
          <div class='b-stack b-stack--xs'>
${renderSimpleScale(system, RADIUS_TOKENS, 'radius')}
          </div>
          <h2 class='b-card__title b-mt-lg'>Movimiento</h2>
          <div class='b-stack b-stack--xs'>
${renderSimpleScale(system, MOTION_TOKENS, 'motion')}
          </div>
        </div>
      </div>
      <p class='b-hint b-mt-lg'>Los valores fluidos usan <code>clamp()</code>: cambian con el ancho del viewport, no con media queries por tamano de texto.</p>
    </div>
  </section>

  <section class='b-section' id='contraste'>
    <div class='b-container'>
      <div class='b-section__head b-reveal'>
        <span class='b-kicker'>04 - contraste</span>
        <h2 class='b-section__title'>${totalPairs} pares medidos, ${failures.length} por debajo del minimo</h2>
        <p class='b-lead'>Minimos de WCAG 2.2: 4,5:1 para texto normal, 3:1 para texto grande y componentes. La tabla mide el peor fondo posible cuando hay capas translucidas.</p>
      </div>
      <div class='b-stack b-stack--lg'>
        ${renderContrastTable(system, measure, 'dark')}
        ${renderContrastTable(system, measure, 'light')}
      </div>
      <p class='b-hint b-mt-lg'><code>node scripts/check-design.mjs</code> devuelve exit 1 si cualquiera de estos pares baja del minimo. Es el gate, no una promesa.</p>
    </div>
  </section>
</main>

<footer class='b-footer'>
  <div class='b-container b-cluster b-cluster--between'>
    <span>Belentani Design - tokens generados desde tokens.css</span>
    <span class='b-mono'>&copy; <span data-year>2026</span> - MIT</span>
  </div>
</footer>
</div>
<script src='design.js' defer></script>
</body>
</html>
`;

  return { html: generated, stats: { tokenCount, colorTokens, totalPairs, failures: failures.length, themes: system.themes.length } };
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Genera tokens.html a partir de tokens.css.

Uso:
  node scripts/build-tokens.mjs           Escribe tokens.html
  node scripts/build-tokens.mjs --check   Solo verifica; exit 1 si esta obsoleto
  node scripts/build-tokens.mjs --json    Salida con estadisticas en JSON

Calcula valores, escalas y los ${CONTRAST_PAIRS.length} pares de contraste por tema y esquema.`);
    return 0;
  }

  const { html, stats } = renderTokensPage();
  const check = argv.includes('--check');

  if (check) {
    if (!existsSync(OUTPUT)) {
      console.error('tokens.html no existe. Ejecuta: npm run tokens');
      return 1;
    }
    const current = readFileSync(OUTPUT, 'utf8');
    if (current !== html) {
      console.error('tokens.html esta obsoleto respecto a tokens.css. Ejecuta: npm run tokens');
      return 1;
    }
    console.log(`tokens.html al dia (${stats.tokenCount} tokens, ${stats.failures} fallos de contraste).`);
    return 0;
  }

  writeFileSync(OUTPUT, html);
  if (argv.includes('--json')) {
    console.log(JSON.stringify(stats, null, 2));
  } else {
    console.log(`tokens.html escrito: ${stats.tokenCount} tokens, ${stats.themes} temas, ${stats.totalPairs} pares medidos, ${stats.failures} fallos.`);
  }
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('build-tokens.mjs')) {
  process.exit(main(process.argv.slice(2)));
}
