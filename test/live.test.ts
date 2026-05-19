import {describe, test, expect} from 'bun:test';
import JsonParser, {streamJson} from '../src';
import {asArr, asObj, flush, makeControllable} from './helpers';

describe('live string data grows in place', () => {
  test('string data grows character by character', async () => {
    const s = makeControllable();
    s.push('"');
    const root = await streamJson(s.iterable).root;

    s.push('h');
    await flush();
    expect(root.data).toBe('h');

    s.push('e');
    s.push('l');
    await flush();
    expect(root.data).toBe('hel');

    s.push('lo"');
    s.end();
    await root.wait;
    expect(root.data).toBe('hello');
  });

  test('object value string grows in place while sibling is unaffected', async () => {
    const s = makeControllable();
    s.push('{"name":"Jo');
    const root = await streamJson(s.iterable).root;
    await flush();

    const obj = asObj(root);
    expect(typeof obj.name?.data).toBe('string');
    expect(obj.name.data).toBe('Jo');
    expect(obj.name.done).toBe(false);

    s.push('hn","age":');
    await flush();
    expect(obj.name.data).toBe('John');
    expect(obj.name.done).toBe(true);

    s.push('30}');
    s.end();
    await root.wait;
    expect(obj.age.data).toBe(30);
    expect(obj.age.done).toBe(true);
  });
});

describe('live array data', () => {
  test('array elements appear one at a time', async () => {
    const s = makeControllable();
    s.push('[1,');
    const root = await streamJson(s.iterable).root;
    await flush();

    let arr = asArr(root);
    expect(arr.length).toBe(1);
    expect(arr[0]!.data).toBe(1);
    expect(arr[0]!.done).toBe(true);

    s.push('2,');
    await flush();
    arr = asArr(root);
    expect(arr.length).toBe(2);
    expect(arr[1]!.data).toBe(2);

    s.push('3]');
    s.end();
    await root.wait;
    expect(arr.length).toBe(3);
    expect(arr.map(r => r.data)).toEqual([1, 2, 3]);
  });

  test('partial element is visible before its closer', async () => {
    const s = makeControllable();
    s.push('["partial');
    const root = await streamJson(s.iterable).root;
    await flush();

    const arr = asArr(root);
    expect(arr.length).toBe(1);
    expect(arr[0]!.data).toBe('partial');
    expect(arr[0]!.done).toBe(false);

    s.push('"]');
    s.end();
    await root.wait;
    expect(arr[0]!.done).toBe(true);
    expect(arr[0]!.data).toBe('partial');
  });
});

describe('done flag flips at the right moment', () => {
  test('string done flips only after closing quote', async () => {
    const s = makeControllable();
    s.push('{"a":"hello');
    const root = await streamJson(s.iterable).root;
    await flush();

    const obj = asObj(root);
    expect(obj.a.data).toBe('hello');
    expect(obj.a.done).toBe(false);

    s.push('"');
    await flush();
    expect(obj.a.done).toBe(true);

    s.push('}');
    s.end();
    await root.wait;
  });

  test('object done flips only after closing brace', async () => {
    const s = makeControllable();
    s.push('{"a":1,"b":2');
    const root = await streamJson(s.iterable).root;
    await flush();
    expect(root.done).toBe(false);

    s.push('}');
    s.end();
    await root.wait;
    expect(root.done).toBe(true);
  });

  test('inner array done flips before outer object done', async () => {
    const s = makeControllable();
    s.push('{"arr":[1,2,3]');
    const root = await streamJson(s.iterable).root;
    await flush();

    const obj = asObj(root);
    expect(obj.arr.done).toBe(true);
    expect(root.done).toBe(false);

    s.push('}');
    s.end();
    await root.wait;
    expect(root.done).toBe(true);
  });
});

describe('error propagation', () => {
  test('inner node error populates inner.error and bubbles to root.error', async () => {
    const s = makeControllable();
    s.push('{"a":"\\uZZZZ"}');
    s.end();
    const root = await streamJson(s.iterable).root;
    try {
      await root.wait;
    } catch (_) {
      // expected
    }
    expect(root.done).toBe(true);
    expect(root.error?.message).toMatch(/invalid hex/i);
    const obj = asObj(root);
    expect(obj.a.done).toBe(true);
    expect(obj.a.error?.message).toMatch(/invalid hex/i);
  });

  test('completed siblings retain done=true with no error on later failure', async () => {
    const s = makeControllable();
    s.push('{"good":"value","bad":"\\uZZZZ"}');
    s.end();
    const root = await streamJson(s.iterable).root;
    try {
      await root.wait;
    } catch (_) {
      // expected
    }
    const obj = asObj(root);
    expect(obj.good.done).toBe(true);
    expect(obj.good.error).toBeUndefined();
    expect(obj.good.data).toBe('value');
    expect(obj.bad.error).toBeDefined();
  });
});

describe('snapshot during stream', () => {
  test('snapshot reflects current state mid-parse', async () => {
    const s = makeControllable();
    s.push('{"a":1,"b":"par');
    const parser = new JsonParser(s.iterable);
    await flush();
    const snap1 = await parser.snapshot();
    expect(snap1).toEqual({a: 1, b: 'par'});

    s.push('tial"}');
    s.end();
    await (await parser.root).wait;
    const snap2 = await parser.snapshot();
    expect(snap2).toEqual({a: 1, b: 'partial'});
  });

  test('snapshots are independent copies', async () => {
    const s = makeControllable();
    s.push('{"arr":[1,2');
    const parser = new JsonParser(s.iterable);
    await flush();
    const snap1 = await parser.snapshot();

    s.push(',3]}');
    s.end();
    await (await parser.root).wait;
    const snap2 = await parser.snapshot();

    expect((snap1 as {arr: number[]}).arr).toEqual([1, 2]);
    expect((snap2 as {arr: number[]}).arr).toEqual([1, 2, 3]);
  });
});
