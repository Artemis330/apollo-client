import { mergeDeep } from '../mergeDeep';

describe('mergeDeep', function() {
  it('should return an object if first argument falsy', function() {
    expect(mergeDeep()).toEqual({});
    expect(mergeDeep(null)).toEqual({});
    expect(mergeDeep(null, { foo: 42 })).toEqual({ foo: 42 });
  });

  it('should preserve identity for single arguments', function() {
    const arg = Object.create(null);
    expect(mergeDeep(arg)).toBe(arg);
  });

  it('should preserve identity when merging non-conflicting objects', function() {
    const a = { a: { name: 'ay' } };
    const b = { b: { name: 'bee' } };
    const c = mergeDeep(a, b);
    expect(c.a).toBe(a.a);
    expect(c.b).toBe(b.b);
    expect(c).toEqual({
      a: { name: 'ay' },
      b: { name: 'bee' },
    });
  });

  it('should shallow-copy conflicting fields', function() {
    const a = { conflict: { fromA: [1, 2, 3] } };
    const b = { conflict: { fromB: [4, 5] } };
    const c = mergeDeep(a, b);
    expect(c.conflict).not.toBe(a.conflict);
    expect(c.conflict).not.toBe(b.conflict);
    expect(c.conflict.fromA).toBe(a.conflict.fromA);
    expect(c.conflict.fromB).toBe(b.conflict.fromB);
    expect(c).toEqual({
      conflict: {
        fromA: [1, 2, 3],
        fromB: [4, 5],
      },
    });
  });

  it('should resolve conflicts among more than two objects', function() {
    const sources = [];

    for (let i = 0; i < 100; ++i) {
      sources.push({
        ['unique' + i]: { value: i },
        conflict: {
          ['from' + i]: { value: i },
          nested: {
            ['nested' + i]: { value: i },
          },
        },
      });
    }

    const merged = mergeDeep(...sources);

    sources.forEach((source, i) => {
      expect(merged['unique' + i].value).toBe(i);
      expect(source['unique' + i]).toBe(merged['unique' + i]);

      expect(merged.conflict).not.toBe(source.conflict);
      expect(merged.conflict['from' + i].value).toBe(i);
      expect(merged.conflict['from' + i]).toBe(source.conflict['from' + i]);

      expect(merged.conflict.nested).not.toBe(source.conflict.nested);
      expect(merged.conflict.nested['nested' + i].value).toBe(i);
      expect(merged.conflict.nested['nested' + i]).toBe(
        source.conflict.nested['nested' + i],
      );
    });
  });

  it('can merge array elements', function() {
    const a = [{ a: 1 }, { a: 'ay' }, 'a'];
    const b = [{ b: 2 }, { b: 'bee' }, 'b'];
    const c = [{ c: 3 }, { c: 'cee' }, 'c'];
    const d = { 1: { d: 'dee' } };

    expect(mergeDeep(a, b, c, d)).toEqual([
      { a: 1, b: 2, c: 3 },
      { a: 'ay', b: 'bee', c: 'cee', d: 'dee' },
      'a',
    ]);
  });
});
