import {Superqueue} from 'superqueue';
import JsonParser, {parseStream} from '../src';
import type {JSONValue, JSONStreamResult, JSONStreamValue} from '../src';

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

export type {JSONValue, JSONStreamResult, JSONStreamValue};
