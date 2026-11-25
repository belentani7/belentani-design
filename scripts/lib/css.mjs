/**
 * Lector de CSS minimo pero correcto para el sistema: comentarios, reglas,
 * at-rules anidadas y resolucion de var() con fallback y deteccion de ciclos.
 * No pretende ser un parser completo de CSS: solo lo que este repo necesita,
 * cubierto por tests.
 */

export function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

const GROUP_AT_RULES = /^@(media|supports|layer|container|scope|starting-style)\b/i;

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      current += ch;
      if (ch === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth -= 1;
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

export function parseDeclarations(body) {
  return splitTopLevel(body, ';').map((chunk) => {
    const colon = (() => {
      let depth = 0;
      for (let i = 0; i < chunk.length; i += 1) {
        const ch = chunk[i];
        if (ch === '(') depth += 1;
        else if (ch === ')') depth -= 1;
        else if (ch === ':' && depth === 0) return i;
      }
      return -1;
    })();
    if (colon === -1) return null;
    const prop = chunk.slice(0, colon).trim();
    let value = chunk.slice(colon + 1).trim();
    const important = /!\s*important$/i.test(value);
    if (important) value = value.replace(/!\s*important$/i, '').trim();
    return { prop, value, important };
  }).filter(Boolean);
}

/**
 * Arbol de nodos CSS: { type:'rule', selector, declarations } |
 * { type:'at', name, prelude, children }.
 */
export function parseCss(css) {
  const text = stripComments(css);
  const root = { type: 'root', children: [] };
  const stack = [root];
  let buffer = '';

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') {
      const parent = stack[stack.length - 1];
      const prelude = buffer.trim();
      buffer = '';
      if (prelude.startsWith('@') && GROUP_AT_RULES.test(prelude)) {
        const node = { type: 'at', prelude, name: prelude.split(/[\s(]/)[0].slice(1), children: [] };
        parent.children.push(node);
        stack.push(node);
      } else if (prelude.startsWith('@')) {
        // @keyframes, @font-face...: se guardan como at-rules opacas.
        const node = { type: 'at', prelude, name: prelude.split(/[\s(]/)[0].slice(1), children: [] };
        parent.children.push(node);
        stack.push(node);
      } else {
        const node = { type: 'rule', selector: prelude, declarations: [] };
        parent.children.push(node);
        stack.push(node);
      }
      continue;
    }
    if (ch === '}') {
      const node = stack[stack.length - 1];
      if (node && node.type === 'rule') node.declarations = parseDeclarations(buffer);
      else if (buffer.trim()) node.raw = buffer.trim();
      buffer = '';
      if (stack.length > 1) stack.pop();
      continue;
    }
    buffer += ch;
  }
  return root;
}

/** Aplana el arbol a reglas con su contexto de at-rules. */
export function flattenRules(root, context = []) {
  const out = [];
  for (const node of root.children ?? []) {
    if (node.type === 'rule') {
      out.push({ selector: node.selector, declarations: node.declarations, context });
    } else if (node.type === 'at') {
      out.push(...flattenRules(node, [...context, node.prelude]));
    }
  }
  return out;
}

export function parseSelectors(rule) {
  return splitTopLevel(rule.selector, ',');
}

const VAR_CALL = /var\(/i;

/**
 * Devuelve las referencias var(--x[, fallback]) de un valor, con su fallback.
 * Recorre parentesis a mano para soportar fallbacks anidados.
 */
export function findVarRefs(value) {
  const refs = [];
  let index = 0;
  while (index < value.length) {
    const start = value.toLowerCase().indexOf('var(', index);
    if (start === -1) break;
    let depth = 0;
    let end = -1;
    for (let i = start + 3; i < value.length; i += 1) {
      if (value[i] === '(') depth += 1;
      else if (value[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break;
    const inner = value.slice(start + 4, end);
    const parts = splitTopLevel(inner, ',');
    const name = (parts[0] ?? '').trim();
    const fallback = parts.slice(1).join(',').trim() || null;
    if (!name.startsWith('--')) throw new Error(`var() sin custom property: ${value.slice(start, end + 1)}`);
    refs.push({ name, fallback, raw: value.slice(start, end + 1) });
    index = end + 1;
  }
  return refs;
}

export function hasVars(value) {
  return VAR_CALL.test(value);
}

/**
 * Resuelve un valor sustituyendo var() contra un mapa.
 * @returns {{value:string|null, missing:string[], cycle:string[]}}
 */
export function resolveValue(value, lookup, { depth = 0, stack = [] } = {}) {
  const missing = [];
  const cycle = [];
  if (depth > 32) return { value: null, missing: ['(profundidad)'], cycle };

  let output = value;
  let guard = 0;
  while (hasVars(output) && guard < 40) {
    guard += 1;
    const refs = findVarRefs(output);
    if (refs.length === 0) break;
    let replaced = false;
    for (const ref of refs) {
      if (stack.includes(ref.name)) {
        cycle.push(ref.name);
        return { value: null, missing, cycle };
      }
      const found = lookup(ref.name);
      if (found == null) {
        if (ref.fallback != null) {
          output = output.replace(ref.raw, ref.fallback);
          replaced = true;
          continue;
        }
        missing.push(ref.name);
        continue;
      }
      const inner = resolveValue(found, lookup, { depth: depth + 1, stack: [...stack, ref.name] });
      missing.push(...inner.missing);
      cycle.push(...inner.cycle);
      if (inner.value == null) continue;
      output = output.replace(ref.raw, inner.value);
      replaced = true;
    }
    if (!replaced) break;
  }
  return { value: hasVars(output) ? null : output.trim(), missing, cycle };
}

export { splitTopLevel };
