import {describe, test, expect} from 'bun:test';
import {parseStream} from '../src';
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
    const root = await parseStream(slow(), {signal: ac.signal});

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
    const root = await parseStream(slow(), {signal: ac.signal});

    setTimeout(() => ac.abort(), 10);

    await expect(root.wait).rejects.toBeDefined();
    expect(root.done).toBe(true);
  });

  test('signal aborted before construction rejects parseStream itself', async () => {
    const ac = new AbortController();
    ac.abort(new Error('pre-aborted'));

    await expect(
      parseStream(fromString('{"a":1}'), {signal: ac.signal}),
    ).rejects.toThrow(/pre-aborted/);
  });

  test('completed parse is unaffected by later abort', async () => {
    const ac = new AbortController();
    const root = await parseStream(fromString('{"a":1}'), {signal: ac.signal});
    await root.wait;

    ac.abort();
    expect(root.done).toBe(true);
    expect(root.error).toBeUndefined();
  });
});
