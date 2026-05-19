import {describe, test, expect} from 'bun:test';
import JsonParser, {streamJson} from '../src';
import {chunked, parseFull} from './helpers';

const collect = async (input: AsyncIterable<string>) => {
  const root = await streamJson(input).root;
  await root.wait;
  return root;
};

const collectSnap = async (input: AsyncIterable<string>) => {
  const parser = new JsonParser(input);
  await (await parser.root).wait;
  return parser.snapshot();
};

describe('chunk boundary splits', () => {
  test('split in middle of a number', async () => {
    async function* gen() {
      yield '12';
      yield '34';
    }
    const root = await collect(gen());
    expect(root.data).toBe(1234);
  });

  test('split in middle of a number with decimal', async () => {
    async function* gen() {
      yield '12.';
      yield '34';
    }
    const root = await collect(gen());
    expect(root.data).toBe(12.34);
  });

  test('split inside exponent', async () => {
    async function* gen() {
      yield '1.5e';
      yield '+';
      yield '3';
    }
    const root = await collect(gen());
    expect(root.data).toBe(1500);
  });

  test('split between minus and digits', async () => {
    async function* gen() {
      yield '-';
      yield '42';
    }
    const root = await collect(gen());
    expect(root.data).toBe(-42);
  });

  test('split inside escape sequence \\n', async () => {
    async function* gen() {
      yield '"a\\';
      yield 'nb"';
    }
    const root = await collect(gen());
    expect(root.data).toBe('a\nb');
  });

  test('split inside \\u hex digits', async () => {
    async function* gen() {
      yield '"\\u00';
      yield '41"';
    }
    const root = await collect(gen());
    expect(root.data).toBe('A');
  });

  test('split inside surrogate-pair escape', async () => {
    async function* gen() {
      yield '"\\uD83D';
      yield '\\uDE00"';
    }
    const root = await collect(gen());
    expect(root.data).toBe('😀');
  });

  test('split inside \\U 8-hex sequence', async () => {
    async function* gen() {
      yield '"\\U0001';
      yield 'F600"';
    }
    const root = await collect(gen());
    expect(root.data).toBe('😀');
  });

  test('split between key and colon', async () => {
    async function* gen() {
      yield '{"a"';
      yield ':1}';
    }
    expect(await collectSnap(gen())).toEqual({a: 1});
  });

  test('split inside true/false/null literals', async () => {
    for (const word of ['true', 'false', 'null']) {
      async function* gen() {
        yield word.slice(0, 2);
        yield word.slice(2);
      }
      const root = await collect(gen());
      expect(root.data).toBe(JSON.parse(word) as unknown as typeof root.data);
    }
  });

  test('one character per chunk produces correct result', async () => {
    const input = '{"name":"Ada","numbers":[1,-2,3.14,1e2]}';
    expect(await collectSnap(chunked(input, 1))).toEqual(JSON.parse(input));
  });

  test('arbitrary chunk sizes produce same result as one-chunk', async () => {
    const input = '{"a":[1,"two",true,null,{"nested":3.14}]}';
    const expected = await parseFull(input);
    for (const size of [1, 2, 3, 5, 7, 11, 13]) {
      expect(await collectSnap(chunked(input, size))).toEqual(expected);
    }
  });

  test('empty string chunks are tolerated', async () => {
    async function* gen() {
      yield '{"a":';
      yield '';
      yield '1';
      yield '';
      yield '}';
    }
    expect(await collectSnap(gen())).toEqual({a: 1});
  });
});
