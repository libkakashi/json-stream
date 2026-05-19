import {describe, test, expect} from 'bun:test';
import {parseExpectError, parseFull} from './helpers';

describe('primitives', () => {
  test('parses positive integer at top level', async () => {
    expect(await parseFull('42')).toBe(42);
  });

  test('parses negative integer', async () => {
    expect(await parseFull('-7')).toBe(-7);
  });

  test('parses float', async () => {
    expect(await parseFull('3.14')).toBe(3.14);
  });

  test('parses true / false', async () => {
    expect(await parseFull('true')).toBe(true);
    expect(await parseFull('false')).toBe(false);
  });

  test('parses null', async () => {
    expect(await parseFull('null')).toBe(null);
  });

  test('parses empty string', async () => {
    expect(await parseFull('""')).toBe('');
  });
});

describe('objects', () => {
  test('parses empty object', async () => {
    expect(await parseFull('{}')).toEqual({});
  });

  test('parses simple object', async () => {
    expect(await parseFull('{"name":"John","age":30}')).toEqual({
      name: 'John',
      age: 30,
    });
  });

  test('parses nested object', async () => {
    expect(await parseFull('{"person":{"name":"John","age":30}}')).toEqual({
      person: {name: 'John', age: 30},
    });
  });

  test('preserves null property values', async () => {
    expect(await parseFull('{"value":null}')).toEqual({value: null});
  });

  test('preserves boolean property values', async () => {
    expect(await parseFull('{"active":true,"verified":false}')).toEqual({
      active: true,
      verified: false,
    });
  });
});

describe('arrays', () => {
  test('parses empty array', async () => {
    expect(await parseFull('[]')).toEqual([]);
  });

  test('parses array of numbers', async () => {
    expect(await parseFull('[1,2,3,4,5]')).toEqual([1, 2, 3, 4, 5]);
  });

  test('parses array of objects', async () => {
    expect(await parseFull('[{"id":1},{"id":2}]')).toEqual([{id: 1}, {id: 2}]);
  });

  test('parses mixed-type array', async () => {
    expect(await parseFull('[1,"two",true,null,{}]')).toEqual([
      1,
      'two',
      true,
      null,
      {},
    ]);
  });

  test('parses nested arrays', async () => {
    expect(await parseFull('[[1,2],[3,4]]')).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe('whitespace tolerance', () => {
  test('skips whitespace between tokens', async () => {
    expect(await parseFull('  {  "a"  :  1  ,  "b"  :  2  }  ')).toEqual({
      a: 1,
      b: 2,
    });
  });

  test('handles newlines and tabs', async () => {
    expect(await parseFull('{\n\t"a": 1,\n\t"b": 2\n}')).toEqual({
      a: 1,
      b: 2,
    });
  });
});

describe('error cases', () => {
  test('throws on bare minus with no digit', async () => {
    const err = await parseExpectError('-x');
    expect(err.message).toMatch(/digit/i);
  });

  test('throws on garbage token at value position', async () => {
    const err = await parseExpectError('@');
    expect(err.message).toMatch(/unexpected token/i);
  });

  test('throws on truncated true', async () => {
    const err = await parseExpectError('tr');
    expect(err.message).toMatch(/end of json input|expected/i);
  });

  test('throws on EOF inside string', async () => {
    const err = await parseExpectError('"abc');
    expect(err.message).toMatch(/end of json input/i);
  });
});
