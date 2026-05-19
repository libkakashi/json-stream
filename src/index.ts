import {Superqueue} from 'superqueue';

export type JSONValue =
  | null
  | number
  | boolean
  | string
  | JSONValue[]
  | {[key: string]: JSONValue};

export type JSONStreamValue =
  | null
  | number
  | boolean
  | string
  | JSONArrayStream
  | JSONObjectStream;

export type JSONStreamResult<T extends JSONStreamValue> = {
  data: T;
  wait: Promise<T>;
  done: boolean;
  error?: Error;
};

export interface JSONObjectStream {
  [key: string]: JSONStreamResult<JSONStreamValue>;
}

export type JSONArrayStream = Array<JSONStreamResult<JSONStreamValue>>;

const assert = (condition: boolean, message = 'Assertion failed') => {
  if (!condition) throw new Error(message);
};

const assertEq = (a: unknown, b: unknown, message = 'Assertion failed') => {
  if (a !== b) throw new Error(`${message}: '${a}' !== '${b}'`);
};

class JsonParser<T extends JSONValue = JSONValue> {
  #queue: Superqueue<string>;
  #text = '';
  #index = 0;
  #offset = 0;
  #signal?: AbortSignal;
  #sourceError?: Error;
  #stream: Promise<JSONStreamResult<JSONStreamValue>>;

  constructor(input: AsyncIterable<string>, options: {signal?: AbortSignal} = {}) {
    this.#signal = options.signal;
    this.#queue = new Superqueue<string>();

    options.signal?.addEventListener('abort', () => this.#queue.end());

    void (async () => {
      try {
        for await (const chunk of input) {
          if (options.signal?.aborted) break;
          this.#queue.push(chunk);
        }
      } catch (e) {
        this.#sourceError = e as Error;
      } finally {
        this.#queue.end();
      }
    })();

    this.#stream = (async () => {
      await this.#skipWhiteSpaces();
      return await this.#parseValue()
    })();
    this.#stream.catch(() => {});
  }

  get #pos() {
    return this.#offset + this.#index;
  }

  #isWhitespace(char: string): boolean {
    return char === ' ' || char === '\n' || char === '\t' || char === '\r';
  }

  async #next(len = 1): Promise<string | undefined> {
    const str = await this.#peek(len);
    if (str === undefined) return undefined;
    this.#index += len;
    if (this.#index >= 1024) {
      this.#offset += this.#index;
      this.#text = this.#text.slice(this.#index);
      this.#index = 0;
    }
    return str;
  }

  async #nextNonEof(len?: number, message?: string): Promise<string> {
    const chunk = await this.#next(len);
    assert(chunk !== undefined, `Unexpected end of JSON input at index ${this.#pos}: ${message}`);
    return chunk!;
  }

  async #peek(len = 1): Promise<string | undefined> {
    while (this.#text.length < this.#index + len) {
      const char = await this.#queue.shiftUnsafe();
      if (char === Superqueue.EOF) {
        if (this.#signal?.aborted) {
          throw this.#signal.reason ?? new Error('aborted');
        }
        if (this.#sourceError) throw this.#sourceError;
        return undefined;
      }
      this.#text += char;
    }
    const result = this.#text.slice(this.#index, this.#index + len);
    return result;
  }

  async #peekNonEof(len?: number, message?: string): Promise<string> {
    const chunk = await this.#peek(len);
    assert(chunk !== undefined, `Unexpected end of JSON input at index ${this.#pos}: ${message}`);
    return chunk!;
  }

  async #skipWhiteSpaces() {
    while (
      this.#isWhitespace(await this.#peekNonEof())
    ) {
      await this.#nextNonEof();
    }
  }

  async #expectNext(expected: string): Promise<string> {
    const char = await this.#nextNonEof(expected.length, `Expected '${expected}' at index ${this.#pos}, got EOF.`);
    assertEq(char, expected, `Expected '${expected}' at index ${this.#pos}, got '${char}'`);
    return char;
  }

  #wrapResult<V extends JSONStreamValue>(
    initialData: V,
    callback: (api: {
      set: (data: V | ((old: V) => V)) => void;
      mutate: (fn: (data: V) => void) => void;
    }) => Promise<unknown>,
  ): JSONStreamResult<V> {
    const set = (data: V | ((old: V) => V)) => {
      const newData = data instanceof Function ? data(result.data) : data;
      if (newData === undefined) {
        throw new Error('set: data cannot be undefined');
      }
      result.data = newData;
    };
    const mutate = (fn: (data: V) => void) => {
      const ret = fn(result.data);
      if (ret !== undefined) {
        throw new Error('mutate: callback must return undefined');
      }
    };
    const result: JSONStreamResult<V> = {
      data: initialData,
      done: false,
      wait: callback({set, mutate}).then(
        () => {
          result.done = true;
          return result.data;
        },
        (err: Error) => {
          result.done = true;
          result.error = err;
          throw err;
        },
      ),
    };
    result.wait.catch(() => {});
    return result;
  }

  async #parseValue() {
    const next = await this.#peekNonEof();

    switch (next) {
      case '{':
        return this.#parseObject();
      case '[':
        return this.#parseArray();
      case '"':
        return this.#parseString();
      case 't':
        return this.#parseBoolean(true);
      case 'f':
        return this.#parseBoolean(false);
      case 'n':
        return this.#parseNull();
      case '-':
      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        return this.#parseNumber();
      default:
        throw new Error(`Unexpected token ${next} at index ${this.#pos} while parsing value in JSON`);
    }
  }

  #parseObject() {
    return this.#wrapResult<JSONObjectStream>({}, async ({mutate}) => {
      await this.#expectNext('{');

      while (true) {
        await this.#skipWhiteSpaces();
        if (await this.#peekNonEof() === '}') break;

        const key = await this.#parseKey();
        await key.wait;

        await this.#skipWhiteSpaces();
        await this.#expectNext(':');
        await this.#skipWhiteSpaces();

        const val = await this.#parseValue();
        mutate(data => void (data[key.data] = val));

        await val.wait;

        await this.#skipWhiteSpaces();
        if (await this.#peekNonEof() === '}') break;

        await this.#expectNext(',');
      }

      await this.#expectNext('}');
    });
  }

  #parseArray() {
    return this.#wrapResult<JSONArrayStream>([], async ({mutate}) => {
      await this.#expectNext('[');

      while (true) {
        await this.#skipWhiteSpaces();
        if (await this.#peekNonEof() === ']') break;

        const val = await this.#parseValue();
        mutate(data => void data.push(val));

        await val.wait;

        await this.#skipWhiteSpaces();
        if (await this.#peekNonEof() === ']') break;

        await this.#expectNext(',');
      }

      await this.#expectNext(']');
    });
  }

  #numbers = '0123456789';

  #parseNumber() {
    return this.#wrapResult<number>(0, async ({set}) => {
      let str = '';
      const consume = async () => {
        str += await this.#nextNonEof();
        set(() => Number(str));
      };
      const isDigit = (c: string | undefined) =>
        c !== undefined && this.#numbers.includes(c);

      if ((await this.#peekNonEof()) === '-') await consume();

      if (!isDigit(await this.#peekNonEof())) {
        throw new Error(
          `Expected digit at index ${this.#pos}, got '${await this.#peek()}'`,
        );
      }
      while (isDigit(await this.#peek())) await consume();

      if ((await this.#peek()) === '.') {
        await consume();
        while (isDigit(await this.#peek())) await consume();
      }

      const expChar = await this.#peek();
      if (expChar === 'e' || expChar === 'E') {
        await consume();
        const sign = await this.#peek();
        if (sign === '+' || sign === '-') await consume();
        while (isDigit(await this.#peek())) await consume();
      }
    });
  }

  async #parseKey(): Promise<JSONStreamResult<string>> {
    const char = await this.#peekNonEof();
    return char === '"' ? this.#parseString() : this.#parseIdentifier();
  }

  #letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_1234567890';

  #parseIdentifier() {
    return this.#wrapResult<string>('', async ({set}) => {
      for (
        let char = await this.#peekNonEof();
        this.#letters.includes(char);
        char = await this.#peekNonEof()
      ) {
        await this.#nextNonEof();
        set(id => id + char);
      }
    });
  }

  #parseString() {
    return this.#wrapResult<string>('', async ({set}) => {
      await this.#expectNext('"');
      await this.#peekNonEof();

      while (await this.#peekNonEof() !== '"') {
        const char = await this.#nextNonEof();

        if (char !== '\\') {
          set(str => str + char);
          continue;
        }
        const nextChar = await this.#nextNonEof();

        const escapeSequences: Record<string, string> = {
          '"': '"',
          '\\': '\\',
          '/': '/',
          b: '\b',
          f: '\f',
          n: '\n',
          r: '\r',
          t: '\t',
        };
        if (escapeSequences[nextChar]) {
          set(str => str + escapeSequences[nextChar]);
          continue;
        }
        if (nextChar === 'u' || nextChar === 'U') {
          const width = nextChar === 'u' ? 4 : 8;
          const hex = await this.#nextNonEof(width);
          if (!/^[0-9a-fA-F]+$/.test(hex)) {
            throw new Error(
              `Invalid hex in \\${nextChar} escape at index ${this.#pos}: '${hex}'`,
            );
          }
          const codePoint = parseInt(hex, 16);
          set(str => str + String.fromCodePoint(codePoint));
        } else {
          throw new Error(`Invalid escape sequence ${nextChar} at index ${this.#pos} in JSON`);
        }
      }
      await this.#expectNext('"');
    });
  }

  #parseBoolean(expected: boolean) {
    return this.#wrapResult(expected, () =>
      this.#expectNext(expected ? 'true' : 'false'),
    );
  }

  #parseNull() {
    return this.#wrapResult(null, () => this.#expectNext('null'));
  }

  get root(): Promise<JSONStreamResult<JSONStreamValue>> {
    return this.#stream;
  }

  async snapshot(): Promise<T> {
    return this.#snapshot(await this.#stream) as T;
  }

  #snapshot = (stream: JSONStreamResult<JSONStreamValue>): JSONValue => {
    if (typeof stream.data !== 'object') return stream.data;
    if (stream.data === null) return null;
    if (Array.isArray(stream.data)) return stream.data.map(this.#snapshot);

    const result: {[key: string]: JSONValue} = {};
    for (const key in stream.data) {
      result[key] = this.#snapshot(stream.data[key]!);
    }
    return result;
  };
}

export const parseStream = (
  input: AsyncIterable<string>,
  options?: {signal?: AbortSignal},
): Promise<JSONStreamResult<JSONStreamValue>> =>
  new JsonParser(input, options).root;

export default JsonParser;
