import { describe, expect, test } from 'bun:test';
import { translateForCli, validate, positionalInstruction } from './schema.ts';

const item = (who: string) => ({ type: 'object', required: ['speaker'], properties: { speaker: { type: 'string', enum: [who] } } });

describe('translateForCli', () => {
  test('prefixItems becomes deduplicated anyOf, maxItems from items:false, input untouched', () => {
    const schema = { type: 'object', properties: { lines: { type: 'array', prefixItems: [item('A'), item('B'), item('B')], items: false, minItems: 2 } } };
    const before = structuredClone(schema);
    const { schema: out, rewrites } = translateForCli(schema);
    expect(schema).toEqual(before);
    expect(JSON.stringify(out)).not.toContain('prefixItems');
    expect(out).toEqual({ type: 'object', properties: { lines: { type: 'array', items: { anyOf: [item('A'), item('B')] }, minItems: 2, maxItems: 3 } } });
    expect(rewrites).toHaveLength(1);
    expect(rewrites[0]!.path).toBe('$.lines');
    expect(rewrites[0]!.positions).toHaveLength(3);
  });

  test('existing maxItems is kept and an object items schema joins the anyOf', () => {
    const { schema: kept } = translateForCli({ type: 'array', prefixItems: [item('A')], items: false, maxItems: 5 });
    expect(kept).toEqual({ type: 'array', items: item('A'), maxItems: 5 });
    const { schema: open } = translateForCli({ type: 'array', prefixItems: [item('A')], items: item('C') });
    expect(open).toEqual({ type: 'array', items: { anyOf: [item('A'), item('C')] } });
    const { schema: bare } = translateForCli({ type: 'array', prefixItems: [item('A'), item('B')] });
    expect(bare).toEqual({ type: 'array', items: { anyOf: [item('A'), item('B')] } });
  });

  test('nested prefixItems inside anyOf/items are rewritten with their data paths', () => {
    const schema = { type: 'array', items: { anyOf: [{ type: 'object', properties: { pair: { type: 'array', prefixItems: [item('A'), item('B')] } } }] } };
    const { schema: out, rewrites } = translateForCli(schema);
    expect(JSON.stringify(out)).not.toContain('prefixItems');
    expect(rewrites.map((r) => r.path)).toEqual(['$[*].pair']);
  });

  test('no rewrite leaves the schema equal and reports nothing', () => {
    const schema = { type: 'object', properties: { enum: { type: 'string', enum: ['prefixItems'] } } };
    const { schema: out, rewrites } = translateForCli(schema);
    expect(out).toEqual(schema);
    expect(rewrites).toHaveLength(0);
  });

  test('positional instruction names each rewritten path', () => {
    const { rewrites } = translateForCli({ type: 'object', properties: { a: { type: 'array', prefixItems: [item('A')] }, b: { type: 'array', prefixItems: [item('B')] } } });
    const text = positionalInstruction(rewrites);
    expect(text).toContain('$.a');
    expect(text).toContain('$.b');
  });
});

describe('validate', () => {
  const cases: [string, object, unknown, unknown][] = [
    ['type string', { type: 'string' }, 'x', 1],
    ['type integer', { type: 'integer' }, 2, 2.5],
    ['type boolean', { type: 'boolean' }, false, 'false'],
    ['type array of types with null', { type: ['string', 'null'] }, null, 3],
    ['enum', { enum: ['a', 'b'] }, 'b', 'c'],
    ['const', { const: { k: 1 } }, { k: 1 }, { k: 2 }],
    ['pattern (game text pattern)', { type: 'string', pattern: '^[^"\\\\\\n\\r]{1,10}$' }, '대사 한 줄', 'say "hi"'],
    ['pattern rejects newline', { type: 'string', pattern: '^[^"\\\\\\n\\r]{1,10}$' }, 'ab', 'a\nb'],
    ['minLength counts code points', { type: 'string', minLength: 2 }, '가나', '가'],
    ['maxLength', { type: 'string', maxLength: 2 }, '가나', '가나다'],
    ['minimum', { type: 'integer', minimum: 0 }, 0, -1],
    ['maximum', { type: 'integer', maximum: 3 }, 3, 4],
    ['minItems', { type: 'array', minItems: 1 }, [1], []],
    ['maxItems', { type: 'array', maxItems: 1 }, [1], [1, 2]],
    ['items', { type: 'array', items: { type: 'boolean' } }, [true], [true, 1]],
    ['prefixItems order', { type: 'array', prefixItems: [item('A'), item('B')] }, [{ speaker: 'A' }, { speaker: 'B' }], [{ speaker: 'B' }, { speaker: 'A' }]],
    ['prefixItems with items:false', { type: 'array', prefixItems: [item('A')], items: false }, [{ speaker: 'A' }], [{ speaker: 'A' }, { speaker: 'A' }]],
    ['required', { type: 'object', required: ['a'] }, { a: 1 }, {}],
    ['properties', { type: 'object', properties: { a: { type: 'string' } } }, { a: 'x' }, { a: 1 }],
    ['additionalProperties false', { type: 'object', properties: { a: {} }, additionalProperties: false }, { a: 1 }, { a: 1, b: 2 }],
    ['anyOf', { anyOf: [{ type: 'string' }, { type: 'integer' }] }, 3, true],
  ];
  for (const [name, schema, good, bad] of cases) {
    test(name, () => {
      expect(validate(schema, good)).toBeNull();
      expect(validate(schema, bad)).not.toBeNull();
    });
  }

  test('error path points at the failing element', () => {
    const schema = { type: 'object', properties: { lines: { type: 'array', prefixItems: [item('A'), item('B')] } } };
    expect(validate(schema, { lines: [{ speaker: 'A' }, { speaker: 'A' }] })?.path).toBe('$.lines[1].speaker');
  });

  test('unknown keywords and invalid patterns are ignored', () => {
    expect(validate({ type: 'string', format: 'email', 'x-custom': { deep: true }, pattern: '(' }, 'anything')).toBeNull();
    expect(validate(true, 1)).toBeNull();
    expect(validate(false, 1)).not.toBeNull();
  });
});
