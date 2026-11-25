# belentani-design

Sistema de diseno unico para **todas** las webs del estate `belentani7`. Un repo con
`index.html` queda dentro con dos lineas; un repo sin web no lo necesita.

- **Demo:** https://belentani7.github.io/belentani-design/
- **Version:** 1.0 (2026-11-25)
- **Licencia:** MIT

## Que es

Dos hojas de estilo y un script, sin build:

| Fichero | Que contiene |
|---|---|
| `tokens.css` | 48 tokens: color, tipografia fluida, espacio, radio, sombra, movimiento. Seis temas y dos esquemas. |
| `design.css` | Componentes y utilidades `b-*`: nav, hero, boton, tarjeta, insignia, medidor, tabla, formulario, prosa, pie. |
| `design.js` | Mejora progresiva: revelado al hacer scroll, sombra de nav, conmutador claro/oscuro, ano del pie. |

## Que no es

- No es un framework: no hay componentes JS, ni estado, ni router.
- No es un tema cerrado: los colores salen de un tono (`--h`) y se derivan.
- No sustituye a shadcn/ui en las apps React. Para esas, el sistema es el mismo pero
  como preset de Tailwind v4 + primitivas Radix; el contrato visual es identico.

## Adopcion

```html
<link rel="stylesheet" href="https://belentani7.github.io/belentani-design/tokens.css">
<link rel="stylesheet" href="https://belentani7.github.io/belentani-design/design.css">
<script src="https://belentani7.github.io/belentani-design/design.js" defer></script>
```

Y en la raiz del documento:

```html
<html lang="es" data-theme="navy">
```

No hace falta tocar el CSS existente: las clases `b-*` y los tokens conviven con lo que ya
hay. La migracion es pagina a pagina, empezando por la portada.

## Temas por plataforma

| Tema | Uso |
|---|---|
| `indigo` | Belentani workspace, open-manus, por defecto |
| `navy` | Open School (azul profundo + oro) |
| `warm` | belentani-portfolio (editorial) |
| `emerald` | Lingua Abierta |
| `violet` | Secure T |
| `gold` | credenciales y certificados |

El esquema se cambia con `data-scheme="light"` en el `html`.

## Reglas (las que hacen que sea un sistema)

1. Ningun color escrito a mano: sale de `--brand`, `--accent`, `--ink`, `--muted` o `--line`.
2. Ningun tamano de texto literal: sale de `--t--1` a `--t-6`.
3. Ningun espacio literal: sale de `--s-1` a `--s-9`.
4. Contraste minimo 4,5:1 en texto normal y 3:1 en texto grande, medido, no estimado.
5. Foco visible siempre: `:focus-visible` con anillo de 2 px.
6. Objetivos tactiles de 44 px minimo (`.b-btn`, `.b-input`).
7. Nunca solo color para indicar estado: insignia con texto y punto.
8. `prefers-reduced-motion` respetado en todo lo que se mueve.
9. Sin fuentes externas ni CDN de terceros: la pagina carga sin red ajena.
10. Un componente nuevo se anade aqui primero, no en una pagina suelta.

## Gates

- **Acceso:** el workflow comprueba que `tokens.css`, `design.css`, `design.js` e `index.html`
  responden 200 en la URL publicada; si uno falla, el deploy se marca en rojo.
- **Adopcion:** un repo se considera dentro del sistema cuando su `index.html` enlaza los dos
  CSS y declara `data-theme`.
- **Regresion visual:** pendiente. Hoy no hay captura ni comparacion automatica.

## Estado

- Publicado y desplegado por workflow (`build_type: workflow`).
- La demo usa el propio sistema: si algo se rompe, se ve ahi antes que en ninguna otra web.
- Pendiente: preset de Tailwind v4 para las apps React y pagina de tokens generada del CSS.
