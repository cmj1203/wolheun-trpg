export interface Rewrite {
  path: string;
  positions: unknown[];
  rest: 'none' | 'any' | unknown;
}

export interface SchemaError {
  path: string;
  reason: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const DATA_KEYWORDS = new Set(['enum', 'const', 'required', 'type', 'default', 'examples', 'pattern']);

function childPath(path: string, key: string, index?: number): string {
  if (key === 'items' || key === 'additionalItems') return `${path}[*]`;
  if (key === 'prefixItems' && index !== undefined) return `${path}[${index}]`;
  return path;
}

/** Copy of `schema` with every `prefixItems` array rewritten to `items: {anyOf}`; the input is never mutated. */
export function translateForCli(schema: unknown): { schema: unknown; rewrites: Rewrite[] } {
  const rewrites: Rewrite[] = [];

  const walk = (node: unknown, path: string): unknown => {
    if (Array.isArray(node)) return node.map((n) => walk(n, path));
    if (!isObj(node)) return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (DATA_KEYWORDS.has(k)) out[k] = structuredClone(v);
      else if (k === 'properties' && isObj(v)) {
        out[k] = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, walk(pv, `${path}.${pk}`)]));
      } else if (k === 'prefixItems' && Array.isArray(v)) {
        out[k] = v.map((item, i) => walk(item, childPath(path, k, i)));
      } else out[k] = walk(v, childPath(path, k));
    }
    if (!Array.isArray(out.prefixItems)) return out;

    const positions = out.prefixItems as unknown[];
    const originalItems = out.items;
    const unique: unknown[] = [];
    const seen = new Set<string>();
    for (const s of [...positions, ...(isObj(originalItems) ? [originalItems] : [])]) {
      const key = JSON.stringify(s);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
    }
    delete out.prefixItems;
    out.items = unique.length === 1 ? unique[0] : { anyOf: unique };
    if (originalItems === false && out.maxItems === undefined) out.maxItems = positions.length;
    rewrites.push({ path, positions, rest: originalItems === false ? 'none' : isObj(originalItems) ? originalItems : 'any' });
    return out;
  };

  return { schema: walk(schema, '$'), rewrites };
}

export function positionalInstruction(rewrites: readonly Rewrite[]): string {
  const parts = rewrites.map((r) => {
    const runs: string[] = [];
    let start = 0;
    for (let i = 1; i <= r.positions.length; i++) {
      const same = i < r.positions.length && JSON.stringify(r.positions[i]) === JSON.stringify(r.positions[start]);
      if (same) continue;
      const label = i - 1 === start ? `item ${start}` : `items ${start}-${i - 1}`;
      runs.push(`${label}: ${JSON.stringify(r.positions[start])}`);
      start = i;
    }
    const n = r.positions.length;
    const rest = r.rest === 'none' ? `no items after index ${n - 1}` : r.rest === 'any' ? `items ${n}+: any of the schemas above` : `items ${n}+: ${JSON.stringify(r.rest)}`;
    return `${r.path} is an ordered array. ${runs.join('; ')}; ${rest}.`;
  });
  return `[Output order constraint] Array items must follow this per-position schema exactly, in order:\n${parts.join('\n')}`;
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function matchesType(v: unknown, t: string): boolean {
  const actual = typeOf(v);
  return actual === t || (t === 'number' && actual === 'integer');
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b) || (isObj(a) && isObj(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => deepEqual(a[k], b[k])));
}

const regexCache = new Map<string, RegExp | null>();
function compile(pattern: string): RegExp | null {
  if (!regexCache.has(pattern)) {
    let re: RegExp | null = null;
    try {
      re = new RegExp(pattern, 'u');
    } catch {
      try {
        re = new RegExp(pattern);
      } catch {
        re = null;
      }
    }
    regexCache.set(pattern, re);
  }
  return regexCache.get(pattern) ?? null;
}

const short = (v: unknown) => {
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
};

/** Validates `value` against a JSON Schema subset; unknown keywords are ignored. Returns the first error or null. */
export function validate(schema: unknown, value: unknown, path = '$'): SchemaError | null {
  if (schema === true || schema === undefined) return null;
  if (schema === false) return { path, reason: 'not allowed' };
  if (!isObj(schema)) return null;
  const s = schema as Record<string, unknown>;

  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type.filter((t): t is string => typeof t === 'string') : typeof s.type === 'string' ? [s.type] : [];
    if (types.length > 0 && !types.some((t) => matchesType(value, t))) return { path, reason: `expected type ${types.join('|')}, got ${typeOf(value)}` };
  }
  if (Array.isArray(s.enum) && !s.enum.some((e) => deepEqual(e, value))) return { path, reason: `${short(value)} not in enum ${short(s.enum)}` };
  if ('const' in s && !deepEqual(s.const, value)) return { path, reason: `must equal ${short(s.const)}` };

  if (typeof value === 'string') {
    const len = [...value].length;
    if (typeof s.minLength === 'number' && len < s.minLength) return { path, reason: `length ${len} < minLength ${s.minLength}` };
    if (typeof s.maxLength === 'number' && len > s.maxLength) return { path, reason: `length ${len} > maxLength ${s.maxLength}` };
    if (typeof s.pattern === 'string') {
      const re = compile(s.pattern);
      if (re && !re.test(value)) return { path, reason: `does not match pattern ${s.pattern}` };
    }
  }
  if (typeof value === 'number') {
    if (typeof s.minimum === 'number' && value < s.minimum) return { path, reason: `${value} < minimum ${s.minimum}` };
    if (typeof s.maximum === 'number' && value > s.maximum) return { path, reason: `${value} > maximum ${s.maximum}` };
    if (typeof s.exclusiveMinimum === 'number' && value <= s.exclusiveMinimum) return { path, reason: `${value} <= exclusiveMinimum ${s.exclusiveMinimum}` };
    if (typeof s.exclusiveMaximum === 'number' && value >= s.exclusiveMaximum) return { path, reason: `${value} >= exclusiveMaximum ${s.exclusiveMaximum}` };
  }

  if (Array.isArray(value)) {
    if (typeof s.minItems === 'number' && value.length < s.minItems) return { path, reason: `${value.length} items < minItems ${s.minItems}` };
    if (typeof s.maxItems === 'number' && value.length > s.maxItems) return { path, reason: `${value.length} items > maxItems ${s.maxItems}` };
    const prefix = Array.isArray(s.prefixItems) ? s.prefixItems : Array.isArray(s.items) ? s.items : [];
    const rest = Array.isArray(s.items) ? s.additionalItems : s.items;
    for (let i = 0; i < value.length; i++) {
      const sub = i < prefix.length ? prefix[i] : rest;
      const err = validate(sub, value[i], `${path}[${i}]`);
      if (err) return err;
    }
  }

  if (isObj(value)) {
    if (Array.isArray(s.required)) {
      for (const k of s.required) if (typeof k === 'string' && !(k in value)) return { path, reason: `missing required "${k}"` };
    }
    const props = isObj(s.properties) ? s.properties : {};
    for (const [k, v] of Object.entries(value)) {
      const p = `${path}.${k}`;
      if (k in props) {
        const err = validate(props[k], v, p);
        if (err) return err;
      } else if (s.additionalProperties !== undefined) {
        const err = validate(s.additionalProperties, v, p);
        if (err) return s.additionalProperties === false ? { path: p, reason: 'additional property not allowed' } : err;
      }
    }
  }

  if (Array.isArray(s.allOf)) {
    for (const sub of s.allOf) {
      const err = validate(sub, value, path);
      if (err) return err;
    }
  }
  for (const key of ['anyOf', 'oneOf'] as const) {
    const branches = s[key];
    if (!Array.isArray(branches) || branches.length === 0) continue;
    const errors = branches.map((b) => validate(b, value, path));
    const passed = errors.filter((e) => e === null).length;
    if (key === 'oneOf' && passed > 1) return { path, reason: `matches ${passed} oneOf branches` };
    if (passed === 0) {
      const deepest = errors.reduce((a, b) => ((b?.path.length ?? 0) > (a?.path.length ?? 0) ? b : a));
      return { path, reason: `matches none of ${key} (${branches.length}); closest: ${deepest?.path}: ${deepest?.reason}` };
    }
  }
  return null;
}

