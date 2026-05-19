import {Superqueue} from 'superqueue';
import JsonParser, {parseStream} from '../src';
import type {
  JSONValue,
  JSONStreamResult,
  JSONStreamValue,
  JSONObjectStream,
  JSONArrayStream,
} from '../src';

export const fromString = (s: string) => Superqueue.fromArray([...s]);

export async function* chunked(s: string, perChunk = 1) {
  for (let i = 0; i < s.length; i += perChunk) yield s.slice(i, i + perChunk);
}

export const parseFull = async <T extends JSONValue = JSONValue>(
  s: string,
): Promise<T> => {
  const parser = new JsonParser<T>(fromString(s));
  const root = await parser.root;
  await root.wait;
  return parser.snapshot();
};

export const parseExpectError = async (s: string): Promise<Error> => {
  try {
    const root = await parseStream(fromString(s));
    await root.wait;
  } catch (e) {
    return e as Error;
  }
  throw new Error(`expected parse to throw on input: ${s}`);
};

/**
 * Lets a test feed chunks into a parser on demand and pause between them
 * to inspect partial state.
 */
export const makeControllable = (): {
  iterable: AsyncIterable<string>;
  push: (s: string) => void;
  end: () => void;
} => {
  type Resolver = (v: IteratorResult<string>) => void;
  let waiting: Resolver | null = null;
  const queue: Array<string | null> = [];

  const iterator: AsyncIterableIterator<string> = {
    [Symbol.asyncIterator]() {
      return this;
    },
    next() {
      if (queue.length > 0) {
        const v = queue.shift()!;
        if (v === null) return Promise.resolve({value: undefined, done: true});
        return Promise.resolve({value: v, done: false});
      }
      return new Promise<IteratorResult<string>>(r => {
        waiting = r;
      });
    },
  };

  const deliver = (v: string | null) => {
    if (waiting) {
      const r = waiting;
      waiting = null;
      if (v === null) r({value: undefined, done: true});
      else r({value: v, done: false});
    } else {
      queue.push(v);
    }
  };

  return {
    iterable: iterator,
    push: (s: string) => deliver(s),
    end: () => deliver(null),
  };
};

/** Drain pending microtasks so the parser advances over awaited chunks. */
export const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0));
};

export const asObj = (r: JSONStreamResult<JSONStreamValue>) =>
  r.data as JSONObjectStream;
export const asArr = (r: JSONStreamResult<JSONStreamValue>) =>
  r.data as JSONArrayStream;

export type {
  JSONValue,
  JSONStreamResult,
  JSONStreamValue,
  JSONObjectStream,
  JSONArrayStream,
};
