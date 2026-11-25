/**
 * Color: parseo, composicion alfa y contraste WCAG 2.x.
 * Sin dependencias. Toda la matematica vive aqui para que los tests la midan.
 *
 * Formula de contraste (WCAG 2.1 / 2.2, 1.4.3 y 1.4.11):
 *   L = 0.2126 R + 0.7152 G + 0.0722 B   con R,G,B linealizados
 *   ratio = (Lclaro + 0.05) / (Loscuro + 0.05)
 */

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export class ColorError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ColorError';
  }
}

function linearize(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const light = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = light - c / 2;
  let rgb;
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => Math.round((v + m) * 255));
}

function parseNumber(token, { percentScale = 1, name = 'numero' } = {}) {
  const raw = String(token).trim();
  if (!raw) throw new ColorError(`Valor ${name} vacio`);
  if (raw.endsWith('%')) {
    const n = Number.parseFloat(raw.slice(0, -1));
    if (!Number.isFinite(n)) throw new ColorError(`Valor ${name} invalido: ${raw}`);
    return (n / 100) * percentScale;
  }
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) throw new ColorError(`Valor ${name} invalido: ${raw}`);
  return n;
}

function parseAlpha(token) {
  if (token == null || token === '') return 1;
  const raw = String(token).trim();
  if (raw.endsWith('%')) return clamp(Number.parseFloat(raw) / 100, 0, 1);
  return clamp(Number.parseFloat(raw), 0, 1);
}

/** Separa los argumentos de una funcion de color admitiendo coma o espacio y '/ alpha'. */
function splitArgs(body) {
  const normalized = body.replace(/\//g, ' / ');
  const tokens = normalized
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const slash = tokens.indexOf('/');
  if (slash === -1) return { args: tokens, alpha: null };
  return { args: tokens.slice(0, slash), alpha: tokens.slice(slash + 1).join(' ') };
}

/**
 * Acepta #rgb #rgba #rrggbb #rrggbbaa, rgb()/rgba(), hsl()/hsla()
 * en sintaxis moderna (espacios + / alfa) o heredada (comas).
 * @returns {{r:number,g:number,b:number,a:number,hex:string,source:string}}
 */
export function parseColor(input) {
  if (typeof input !== 'string') throw new ColorError(`Color no textual: ${input}`);
  const source = input.trim();
  const text = source.toLowerCase();

  const hexMatch = /^#([0-9a-f]{3,8})$/.exec(text);
  if (hexMatch) {
    const digits = hexMatch[1];
    const expand = (d) => Number.parseInt(d.length === 1 ? d + d : d, 16);
    if (digits.length === 3 || digits.length === 4) {
      return finish(expand(digits[0]), expand(digits[1]), expand(digits[2]), digits.length === 4 ? expand(digits[3]) / 255 : 1, source);
    }
    if (digits.length === 6 || digits.length === 8) {
      return finish(
        Number.parseInt(digits.slice(0, 2), 16),
        Number.parseInt(digits.slice(2, 4), 16),
        Number.parseInt(digits.slice(4, 6), 16),
        digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1,
        source,
      );
    }
    throw new ColorError(`Hex invalido: ${source}`);
  }

  const fnMatch = /^(rgba?|hsla?)\((.*)\)$/s.exec(text);
  if (!fnMatch) throw new ColorError(`Color no reconocido: ${source}`);
  const fn = fnMatch[1];
  const { args, alpha } = splitArgs(fnMatch[2]);
  const a = parseAlpha(alpha);

  if (fn.startsWith('rgb')) {
    if (args.length < 3) throw new ColorError(`rgb() necesita 3 canales: ${source}`);
    const channel = (token) =>
      token.endsWith('%') ? Math.round((Number.parseFloat(token) / 100) * 255) : Math.round(parseNumber(token, { name: 'canal' }));
    return finish(channel(args[0]), channel(args[1]), channel(args[2]), a, source);
  }

  if (args.length < 3) throw new ColorError(`hsl() necesita 3 canales: ${source}`);
  const h = parseNumber(args[0], { name: 'tono' });
  const s = parseNumber(args[1], { percentScale: 1, name: 'saturacion' });
  const l = parseNumber(args[2], { percentScale: 1, name: 'luminosidad' });
  const [r, g, b] = hslToRgb(h, s, l);
  return finish(r, g, b, a, source);
}

function finish(r, g, b, a, source) {
  const color = {
    r: clamp(Math.round(r), 0, 255),
    g: clamp(Math.round(g), 0, 255),
    b: clamp(Math.round(b), 0, 255),
    a: clamp(a, 0, 1),
    source,
  };
  color.hex = toHex(color);
  return color;
}

export function toHex({ r, g, b }) {
  return `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

export function isColor(value) {
  try {
    parseColor(value);
    return true;
  } catch {
    return false;
  }
}

/** Compone `fg` (posiblemente translucido) sobre `bg` opaco. */
export function composite(fg, bg) {
  const top = typeof fg === 'string' ? parseColor(fg) : fg;
  const base = typeof bg === 'string' ? parseColor(bg) : bg;
  if (base.a !== 1) throw new ColorError('El fondo de composicion debe ser opaco');
  const mix = (t, b) => top[t] * top.a + b * (1 - top.a);
  return finish(mix('r', base.r), mix('g', base.g), mix('b', base.b), 1, `composite(${top.source},${base.source})`);
}

/** Luminancia relativa WCAG (0 = negro, 1 = blanco). */
export function relativeLuminance(color) {
  const c = typeof color === 'string' ? parseColor(color) : color;
  if (c.a !== 1) throw new ColorError(`Luminancia necesita color opaco: ${c.source}`);
  return 0.2126 * linearize(c.r) + 0.7152 * linearize(c.g) + 0.0722 * linearize(c.b);
}

/**
 * Ratio de contraste entre dos colores. Si el primero es translucido se compone
 * sobre el segundo, que es lo que ve el ojo cuando hay un fondo detras.
 */
export function contrastRatio(a, b) {
  let fg = typeof a === 'string' ? parseColor(a) : a;
  let bg = typeof b === 'string' ? parseColor(b) : b;
  if (bg.a !== 1) throw new ColorError(`El fondo debe ser opaco: ${bg.source}`);
  if (fg.a !== 1) fg = composite(fg, bg);
  const la = relativeLuminance(fg);
  const lb = relativeLuminance(bg);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/** Redondeo a dos decimales sin perder precision en los tests. */
export function roundRatio(ratio) {
  return Math.round(ratio * 100) / 100;
}

export function formatRatio(ratio) {
  return `${roundRatio(ratio).toFixed(2)}:1`;
}
