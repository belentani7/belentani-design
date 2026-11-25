# belentani-design

Sistema de diseno unico para **todas** las webs del estate `belentani7`. Un repo con
`index.html` queda dentro con dos lineas; un repo sin web no lo necesita.

- **Demo:** https://belentani7.github.io/belentani-design/
- **Version:** 1.1.0 (2026-11-25)
- **Licencia:** MIT

## Que es

Dos hojas de estilo y un script, sin build:

| Fichero | Que contiene |
|---|---|
| `tokens.css` | 88 tokens: marca, superficie, texto, linea, estado, tipografia fluida, espacio, radio, control, sombra y movimiento. Seis temas y dos esquemas. |
| `design.css` | 83 clases `b-*`: nav, hero, boton, tarjeta, insignia, medidor, tabla, formulario, prosa, pie, swatches y escalas. |
| `design.js` | Mejora progresiva: revelado al hacer scroll, sombra de nav, menu movil, conmutador claro/oscuro, copiar el ejemplo, validacion de formulario y ano del pie. |
| `index.html` | Demo que usa el propio sistema (perro guardian: si algo se rompe, se ve aqui). |
| `tokens.html` | Referencia **generada** desde `tokens.css`: valores, escalas y la matriz de 384 ratios de contraste. No se edita a mano. |
| `404.html` | Pagina de error con el mismo sistema. |

## Que no es

- No es un framework: no hay componentes JS, ni estado, ni router.
- No es un tema cerrado: los colores salen de un tono (`--h`) y un acento (`--h2`) y se derivan.
- No se compila: lo que hay en el repo es lo que se sirve. La unica herramienta con
  dependencias es el validador de HTML (`html-validate`), y solo en desarrollo.

## Adopcion

```html
<link rel="stylesheet" href="https://www.belentani.es/belentani-design/tokens.css">
<link rel="stylesheet" href="https://www.belentani.es/belentani-design/design.css">
<script src="https://www.belentani.es/belentani-design/design.js" defer></script>
```

Y en la raiz del documento:

```html
<html lang="es" data-theme="navy">
```

No hace falta tocar el CSS existente: las clases `b-*` y los tokens conviven con lo que ya
hay. La migracion es pagina a pagina, empezando por la portada.

Para que no haya destello de esquema, las paginas del sistema ponen esto en el `head`,
antes del primer pintado:

```html
<script>
  (function () {
    var root = document.documentElement;
    root.classList.add('js');
    try {
      var saved = localStorage.getItem('b-scheme');
      root.dataset.scheme = saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    } catch (e) { root.dataset.scheme = 'dark'; }
  })();
</script>
```

## Temas por plataforma

| Tema | Uso |
|---|---|
| `indigo` | Belentani workspace, open-manus, por defecto |
| `navy` | Open School (azul profundo + oro) |
| `warm` | belentani-portfolio (editorial) |
| `emerald` | Lingua Abierta |
| `violet` | Secure T |
| `gold` | credenciales y certificados |

El esquema se cambia con `data-scheme="light"` en el `html`. En claro, la luminosidad de
`--brand` se ajusta por tema (`tokens.css`, final del fichero): el mismo porcentaje no
contrasta igual en verde que en azul.

## Reglas (las que hacen que sea un sistema)

1. Ningun color escrito a mano: sale de `--brand`, `--accent`, `--ink`, `--muted` o `--line`.
2. Ningun tamano de texto literal: sale de `--t--1` a `--t-6`.
3. Ningun espacio literal: sale de `--s-1` a `--s-9`, `--control-*` o `--icon*`.
4. Contraste minimo 4,5:1 en texto normal y 3:1 en texto grande y componentes, **medido**, no estimado.
5. Foco visible siempre: `:focus-visible` con anillo de 2 px.
6. Objetivos tactiles de 44 px minimo (`--control-min`), tambien en botones pequenos.
7. Nunca solo color para indicar estado: insignia con texto y punto, medidor con `role="progressbar"`.
8. `prefers-reduced-motion` y `prefers-contrast` respetados.
9. Sin fuentes externas ni CDN de terceros: la pagina carga sin red ajena.
10. Un componente nuevo se anade aqui primero, no en una pagina suelta.

Las reglas 1, 2, 3 y 4 no son promesas: `npm run check` devuelve exit 1 si se incumplen.

## Herramientas

Sin instalar nada (`node >= 22.22`):

| Comando | Que hace |
|---|---|
| `npm test` | 47 tests con el runner de Node: color/contraste, parser CSS, paletas, contrato, resumen de Lighthouse y e2e HTTP. |
| `npm run check` | Gate del sistema: tokens, colores a mano, contraste, accesibilidad, meta, contrato y presupuesto de bytes. Acepta `--only <grupo>` y `--json`. |
| `npm run audit` | Metricas: bytes crudo/gzip/brotli, peticiones, tokens, componentes, contraste. `--compare <dir>` para ANTES/DESPUES, `--markdown`, `--json`. |
| `npm run tokens` | Regenera `tokens.html` desde `tokens.css`. `npm run tokens:check` falla si esta obsoleto. |
| `npm run serve` | Servidor estatico en `0.0.0.0:4173` con gzip, MIME correcto y 404 propio. |
| `npm run lighthouse` | Resume los `lhr-*.json` de CI (mediana por pagina). `--markdown`, `--json`. |
| `npm run verify` | `tokens:check` + `check` + `test`, en ese orden. |

Todos aceptan `--help`. Con dependencias de desarrollo:

```bash
npm ci           # instala html-validate (solo desarrollo)
npm run html     # valida el HTML contra las reglas del W3C
```

## Tests

- **Unitarios:** contraste WCAG contra valores de referencia (`#767676` sobre blanco = 4,54:1),
  parseo de color/CSS, resolucion de `var()` con fallback y deteccion de ciclos.
- **De sistema:** las 12 paletas resuelven todos los tokens, los 384 pares pasan, los
  controles miden 44 px, la escala tipografica es monotona, `tokens.html` esta al dia y
  la portada cabe en el presupuesto de bytes.
- **End-to-end (HTTP):** se levanta el servidor real y se pide lo que pediria el navegador:
  portada, CSS, JS, SVG, 404, HEAD, tipos MIME, rechazo de `POST` y de rutas fuera de la raiz.
- **Navegador real:** Lighthouse + axe corren en CI (`.github/workflows/ci.yml`) porque
  necesitan Chrome; aqui no hay atajos ni numeros inventados.

## Gates

- **Acceso:** el workflow comprueba que `tokens.css`, `design.css`, `design.js` e `index.html`
  responden 200 en la URL publicada; si uno falla, el deploy se marca en rojo.
- **Adopcion:** un repo se considera dentro del sistema cuando su `index.html` enlaza los dos
  CSS y declara `data-theme`.
- **Regresion visual:** pendiente. Hoy no hay captura ni comparacion automatica (ver Riesgos).

## CI y publicacion

- `.github/workflows/ci.yml`: valida en cada push y en cada PR (gate + tests + HTML +
  Lighthouse con umbrales). No despliega.
- `.github/workflows/pages.yml`: publica **solo** desde la rama por defecto, en dos jobs
  (`build` sube el artefacto, `deploy` lo publica) porque `deploy-pages` consulta el
  artefacto por nombre y la API tarda en verlo (issue abierto
  [actions/deploy-pages#451](https://github.com/actions/deploy-pages/issues/451)).
  Antes de desplegar espera a que el artefacto exista, y despues comprueba las cuatro URLs.

## Estado

- Publicado y desplegado por workflow (`build_type: workflow`).
- La demo usa el propio sistema: si algo se rompe, se ve ahi antes que en ninguna otra web.
- Metricas de la version 1.1.0 en [`docs/metricas.md`](docs/metricas.md).
- Pendiente: preset de Tailwind v4 para las apps React y captura de regresion visual.
