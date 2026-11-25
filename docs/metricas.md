# Metricas: antes y despues (v1.0 -> v1.1.0)

Todo lo de esta pagina sale de comandos del repo, no de estimaciones:

```bash
node scripts/audit.mjs --compare <copia-de-la-v1.0>   # tabla de abajo
node scripts/check-design.mjs                         # gate: 0 errores
node --test "tests/*.test.mjs"                        # 47 tests
```

## Estado de partida

- El deploy de Pages estaba **en rojo** en el ultimo push (`docs: contrato del sistema`).
  La anotacion del run decia, literalmente:
  `Error: No artifacts named "github-pages" were found for this workflow run.`
- `node scripts/check-design.mjs` no existia; medido a posteriori contra la v1.0 daba
  **94 de 384** pares de contraste por debajo del minimo WCAG, **15** colores escritos a
  mano en `design.css` y **36** atributos `style` en `index.html` incumpliendo la regla 3
  del propio README.
- No habia tests, ni validacion de HTML, ni forma de medir nada.

## Bundle (bytes)

| Metrica | Antes (v1.0) | Despues (v1.1.0) | Delta |
|---|---:|---:|---:|
| `index.html` crudo | 11.7 KB | 15.2 KB | +29.7% |
| `tokens.css` crudo | 3.6 KB | 7.4 KB | +106.3% |
| `design.css` crudo | 9.1 KB | 14.7 KB | +62.2% |
| `design.js` crudo | 1.7 KB | 6.6 KB | +293.4% |
| **Portada completa (gzip)** | **7.8 KB** | **12.5 KB** | **+59.3%** |
| Peticiones de la portada | 4 | 4 | = |

El crecimiento es el precio de lo que faltaba: menu movil, formulario que valida de verdad,
boton de copiar, `prefers-contrast`, `forced-colors`, `color-scheme`, estados de foco por
componente y tres paginas nuevas. Se paga en 4,7 KB gzip, con 4 peticiones y cero imagenes,
cero fuentes y cero origenes externos. Presupuesto del gate: 14 KB gzip para la portada.

## Sistema

| Metrica | Antes | Despues | Delta |
|---|---:|---:|---:|
| Tokens definidos | 61 | 88 | +44.3% |
| Temas | 6 | 6 | = |
| Clases `b-*` | 49 | 83 | +69.4% |
| Colores a mano en `design.css` | 15 | 0 | -100% |
| Pares de contraste medidos | 384 | 384 | = |
| Pares de contraste que fallan | 94 | 0 | -100% |
| Atributos `aria` | 5 | 18 | +260% |
| Roles explicitos | 0 | 2 | n/a |
| Estilos en linea en `index.html` | 36 | 0 | -100% |

Los 384 pares son 32 usos reales de color x 6 temas x 2 esquemas. El peor par de la v1.1.0
es `control-border-surface` a 3,20:1 (minimo 3:1); antes el peor era `link-hover` a 3,00:1
sobre un minimo de 4,5:1.

## Verificacion

| Comprobacion | Antes | Despues |
|---|---|---|
| `npm test` | no existia | 47 tests, 47 en verde |
| Gate de tokens/contraste/espacios | no existia | `npm run check`: 0 errores |
| Validacion HTML (W3C) | no existia | `html-validate`: 0 errores en 3 paginas |
| Deploy de Pages | rojo | verde (`build` + `deploy` separados; espera activa del artefacto) |

## Pagina de tokens

`tokens.html` se genera desde `tokens.css` en cada cambio y el gate falla si esta obsoleto.
Contiene los 88 valores resueltos, las escalas y la matriz completa de contraste con el
ratio de cada celda. Pesa 89 KB crudos y 6,5 KB gzip (la matriz son 384 celdas de texto).
