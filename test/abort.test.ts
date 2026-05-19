import {describe, test, expect} from 'bun:test';
import {streamJson} from '../src';
import {fromString} from './helpers';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('AbortSignal', () => {
  test('aborts pending parse and rejects wait with signal.reason', async () => {
    async function* slow() {
      yield '{"a":';
      await delay(100);
      yield '1}';
    }

    const ac = new AbortController();
    const root = await streamJson(slow(), {signal: ac.signal}).root;

    const reason = new Error('user-cancelled');
    setTimeout(() => ac.abort(reason), 10);

    await expect(root.wait).rejects.toBe(reason);
    expect(root.done).toBe(true);
    expect(root.error).toBe(reason);
  });

  test('aborts with default Error if no reason given', async () => {
    async function* slow() {
      yield '{"a":';
      await delay(100);
      yield '1}';
    }

    const ac = new AbortController();
    const root = await streamJson(slow(), {signal: ac.signal}).root;

    setTimeout(() => ac.abort(), 10);

    await expect(root.wait).rejects.toBeDefined();
    expect(root.done).toBe(true);
  });

  test('signal aborted before construction rejects .root', async () => {
    const ac = new AbortController();
    ac.abort(new Error('pre-aborted'));

    await expect(
      streamJson(fromString('{"a":1}'), {signal: ac.signal}).root,
    ).rejects.toThrow(/pre-aborted/);
  });

  test('completed parse is unaffected by later abort', async () => {
    const ac = new AbortController();
    const root = await streamJson(fromString('{"a":1}'), {signal: ac.signal}).root;
    await root.wait;

    ac.abort();
    expect(root.done).toBe(true);
    expect(root.error).toBeUndefined();
  });

  test('abort during deeply nested parse propagates to root', async () => {
    async function* slow() {
      yield '{"a":{"b":{"c":[1,2,';
      await delay(100);
      yield '3]}}}';
    }

    const ac = new AbortController();
    const root = await streamJson(slow(), {signal: ac.signal}).root;

    setTimeout(() => ac.abort(new Error('mid-nest')), 10);
    await expect(root.wait).rejects.toThrow(/mid-nest/);
    expect(root.done).toBe(true);
  });

  test('multiple aborts are idempotent', async () => {
    async function* slow() {
      yield '{"a":';
      await delay(100);
      yield '1}';
    }

    const ac = new AbortController();
    const root = await streamJson(slow(), {signal: ac.signal}).root;

    setTimeout(() => {
      ac.abort(new Error('first'));
      ac.abort(new Error('second'));
    }, 10);

    await expect(root.wait).rejects.toThrow(/first/);
  });

  test('partial data is preserved on abort', async () => {
    const {default: JsonParser} = await import('../src');
    async function* slow() {
      yield '{"good":"value","x":';
      await delay(100);
      yield '1}';
    }

    const ac = new AbortController();
    const parser = new JsonParser(slow(), {signal: ac.signal});
    const root = await parser.root;

    setTimeout(() => ac.abort(new Error('user-cancel')), 30);
    try {
      await root.wait;
    } catch (_) {
      // expected
    }
    const snap = await parser.snapshot();
    expect((snap as {good?: string}).good).toBe('value');
  });
});
