import {describe, test, expect} from 'bun:test';
import JsonParser, {streamJson} from '../src';
import {fromString, makeControllable, flush} from './helpers';

describe('multiple consumers', () => {
  test('multiple awaiters of root.wait all resolve', async () => {
    const root = await streamJson(fromString('{"a":1}')).root;
    const [a, b, c] = await Promise.all([root.wait, root.wait, root.wait]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  test('multiple awaiters all see the same rejection', async () => {
    const root = await streamJson(fromString('"\\uZZZZ"')).root;
    const errors = await Promise.allSettled([root.wait, root.wait, root.wait]);
    expect(errors.every(e => e.status === 'rejected')).toBe(true);
    const messages = errors.map(e =>
      e.status === 'rejected' ? (e.reason as Error).message : '',
    );
    expect(new Set(messages).size).toBe(1);
  });

  test('multiple snapshot() calls during streaming return monotonically-evolving values', async () => {
    const s = makeControllable();
    const parser = new JsonParser(s.iterable);

    s.push('{"a":');
    await flush();
    const snap1 = await parser.snapshot();

    s.push('1,"b":');
    await flush();
    const snap2 = await parser.snapshot();

    s.push('2}');
    s.end();
    await (
      await parser.root
    ).wait;
    const snap3 = await parser.snapshot();

    expect(snap1).toEqual({});
    expect(snap2).toEqual({a: 1});
    expect(snap3).toEqual({a: 1, b: 2});
  });

  test('snapshot after error returns whatever was parsed', async () => {
    const parser = new JsonParser(fromString('{"a":1,"b":"\\uZZZZ"}'));
    try {
      await (
        await parser.root
      ).wait;
    } catch {
      // expected
    }
    const snap = await parser.snapshot();
    expect((snap as {a: number}).a).toBe(1);
  });
});

describe('parser reuse and isolation', () => {
  test('two parsers in parallel do not interfere', async () => {
    const [a, b] = await Promise.all([
      streamJson(fromString('{"a":1}')).root.then(r =>
        r.wait.then(() => r.data),
      ),
      streamJson(fromString('[10,20,30]')).root.then(r =>
        r.wait.then(() => r.data),
      ),
    ]);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  test('root.wait resolves to the same root.data', async () => {
    const root = await streamJson(fromString('{"x":42}')).root;
    const waitedData = await root.wait;
    expect(waitedData).toBe(root.data);
  });
});
