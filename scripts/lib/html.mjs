/**
 * Lector de etiquetas HTML suficiente para auditar el contrato del sistema:
 * ids, labels, roles, atributos aria, estilos en linea y referencias externas.
 * No sustituye a html-validate (que se usa aparte y con validacion completa).
 */

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '\u00a9' };

export function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const key = entity.toLowerCase();
    return key in ENTITIES ? ENTITIES[key] : match;
  });
}

function parseAttributes(source) {
  const attrs = {};
  let i = 0;
  while (i < source.length) {
    while (i < source.length && /\s/.test(source[i])) i += 1;
    if (i >= source.length) break;
    let name = '';
    while (i < source.length && !/[\s=]/.test(source[i])) name += source[i++];
    if (!name) break;
    while (i < source.length && /\s/.test(source[i])) i += 1;
    let value = '';
    if (source[i] === '=') {
      i += 1;
      while (i < source.length && /\s/.test(source[i])) i += 1;
      const quote = source[i] === '"' || source[i] === "'" ? source[i++] : null;
      if (quote) {
        while (i < source.length && source[i] !== quote) value += source[i++];
        i += 1;
      } else {
        while (i < source.length && !/[\s>]/.test(source[i])) value += source[i++];
      }
    }
    attrs[name.toLowerCase()] = decodeEntities(value);
  }
  return attrs;
}

/**
 * @returns {Array<{tag:string, attrs:Record<string,string>, selfClosing:boolean, index:number, closing:boolean}>}
 */
export function parseTags(html) {
  const tags = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const end = html.indexOf('>', lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    const closing = html[lt + 1] === '/';
    const nameMatch = /^[a-zA-Z][\w:-]*/.exec(html.slice(lt + (closing ? 2 : 1)));
    if (!nameMatch) {
      i = lt + 1;
      continue;
    }
    const tag = nameMatch[0].toLowerCase();
    let cursor = lt + (closing ? 2 : 1) + nameMatch[0].length;
    let quote = null;
    let end = -1;
    for (let j = cursor; j < html.length; j += 1) {
      const ch = html[j];
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === '>') {
        end = j;
        break;
      }
    }
    if (end === -1) break;
    const inner = html.slice(cursor, end);
    const selfClosing = inner.trimEnd().endsWith('/');
    tags.push({
      tag,
      attrs: parseAttributes(selfClosing ? inner.trimEnd().slice(0, -1) : inner),
      selfClosing,
      closing,
      index: lt,
    });
    i = end + 1;
    if (!closing && RAW_TEXT_ELEMENTS.has(tag) && !selfClosing) {
      const closeTag = `</${tag}`;
      const close = html.toLowerCase().indexOf(closeTag, i);
      i = close === -1 ? html.length : close;
    }
  }
  return tags;
}

export function elements(tags, tagName) {
  const name = tagName.toLowerCase();
  return tags.filter((t) => !t.closing && t.tag === name);
}

export function textContent(html, tagName) {
  const open = new RegExp(`<${tagName}\\b[^>]*>`, 'i').exec(html);
  if (!open) return '';
  const start = open.index + open[0].length;
  const end = html.toLowerCase().indexOf(`</${tagName.toLowerCase()}>`, start);
  const raw = end === -1 ? '' : html.slice(start, end);
  return decodeEntities(raw.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Texto visible aproximado: sin script/style, sin etiquetas. */
export function documentText(html) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Valores de style="..." como pares propiedad/valor. */
export function parseInlineStyle(value) {
  return value
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const colon = chunk.indexOf(':');
      return colon === -1 ? null : { prop: chunk.slice(0, colon).trim(), value: chunk.slice(colon + 1).trim() };
    })
    .filter(Boolean);
}
