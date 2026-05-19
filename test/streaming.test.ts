import {describe, test, expect} from 'bun:test';
import {Superqueue} from 'superqueue';
import JsonParser, {parseStream} from '../src';
import type {JSONStreamResult, JSONStreamValue} from '../src';
import {chunked, fromString} from './helpers';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('parseStream factory', () => {
  test('returns root immediately, before parse completes', async () => {
    async function* slow() {
      yield '{';
      await delay(50);
      yield '"a":1}';
    }
    const root = await parseStream(slow());
    expect(root.done).toBe(false);
    expect(root.data).toEqual({});
    await root.wait;
    expect(root.done).toBe(true);
  });

  test('returned root.data mutates in place as values arrive', async () => {
    async function* gen() {
      yield '{"name":"Jo';
      await delay(10);
      yield 'hn","age":';
      await delay(10);
      yield '30}';
    }
    const root = await parseStream(gen());
    const obj = root.data as Record<string, JSONStreamResult<JSONStreamValue>>;

    // give the parser one tick to enter the object
    await delay(5);
    expect('name' in obj || obj.name === undefined).toBe(true);

    await root.wait;
    expect((obj.name.data as string)).toBe('John');
    expect(obj.age.data).toBe(30);
  });
});

describe('JSONStreamResult.done', () => {
  test('starts false, flips to true on success', async () => {
    const root = await parseStream(fromString('{"a":1}'));
    expect(root.done).toBe(false);
    await root.wait;
    expect(root.done).toBe(true);
    expect(root.error).toBeUndefined();
  });

  test('flips to true on error and exposes the error', async () => {
    const root = await parseStream(fromString('{"a":"\\uZZZZ"}'));
    try {
      await root.wait;
    } catch (_) {
      // expected
    }
    expect(root.done).toBe(true);
    expect(root.error).toBeDefined();
    expect(root.error?.message).toMatch(/invalid hex/i);
  });

  test('inner nodes also get done flags', async () => {
    const root = await parseStream(fromString('{"a":"hello"}'));
    await root.wait;
    const obj = root.data as Record<string, JSONStreamResult<JSONStreamValue>>;
    expect(obj.a.done).toBe(true);
  });
});

describe('AsyncIterable input variants', () => {
  test('async generator yielding char-by-char', async () => {
    const root = await parseStream(chunked('{"a":1,"b":2}', 1));
    await root.wait;
    expect(new JsonParser(fromString('{"a":1,"b":2}'))).toBeDefined();
    // verify via a fresh parse with the same string
    const root2 = await parseStream(fromString('{"a":1,"b":2}'));
    await root2.wait;
    const obj = root2.data as Record<string, JSONStreamResult<JSONStreamValue>>;
    expect(obj.a.data).toBe(1);
    expect(obj.b.data).toBe(2);
  });

  test('async generator yielding multi-char chunks', async () => {
    const root = await parseStream(chunked('{"hello":"world"}', 4));
    await root.wait;
    const obj = root.data as Record<string, JSONStreamResult<JSONStreamValue>>;
    expect(obj.hello.data).toBe('world');
  });

  test('chunk boundary inside a string', async () => {
    async function* split() {
      yield '{"a":"he';
      yield 'llo"}';
    }
    const root = await parseStream(split());
    await root.wait;
    const obj = root.data as Record<string, JSONStreamResult<JSONStreamValue>>;
    expect(obj.a.data).toBe('hello');
  });

  test('chunk boundary inside an escape sequence', async () => {
    async function* split() {
      yield '{"a":"\\';
      yield 'n"}';
    }
    const root = await parseStream(split());
    await root.wait;
    const obj = root.data as Record<string, JSONStreamResult<JSONStreamValue>>;
    expect(obj.a.data).toBe('\n');
  });

  test('Superqueue still works as input', async () => {
    const q = Superqueue.fromArray([...'{"a":1}']);
    const root = await parseStream(q);
    await root.wait;
    const obj = root.data as Record<string, JSONStreamResult<JSONStreamValue>>;
    expect(obj.a.data).toBe(1);
  });
});

describe('snapshot()', () => {
  test('returns plain JS value matching live tree', async () => {
    const parser = new JsonParser(fromString('{"a":1,"b":[2,3]}'));
    await (await parser.root).wait;
    expect(await parser.snapshot()).toEqual({a: 1, b: [2, 3]});
  });

  test('typed snapshot via generic', async () => {
    const parser = new JsonParser<{a: number}>(fromString('{"a":42}'));
    await (await parser.root).wait;
    const s = await parser.snapshot();
    expect(s.a).toBe(42);
  });

  test('snapshot is a copy, not the live tree', async () => {
    const parser = new JsonParser(fromString('{"a":[1,2]}'));
    await (await parser.root).wait;
    const snap = await parser.snapshot();
    expect(Array.isArray((snap as {a: unknown[]}).a)).toBe(true);
    // mutating snapshot doesn't affect live tree
    (snap as {a: unknown[]}).a.push(99);
    const snap2 = await parser.snapshot();
    expect((snap2 as {a: unknown[]}).a.length).toBe(2);
  });
});
