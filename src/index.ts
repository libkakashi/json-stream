import {Superqueue} from 'superqueue';

type JSONStreamValue =
  | null
  | number
  | boolean
  | string
  | JSONArrayStream
  | JSONObjectStream;

export type JSONStreamResult<T extends JSONStreamValue> = {
  data: T;
  wait: Promise<T>;
};

interface JSONObjectStream {
  [key: string]: JSONStreamResult<JSONStreamValue>;
}

type JSONArrayStream = Array<JSONStreamResult<JSONStreamValue>>;

const assert = (condition: boolean, message = 'Assertion failed') => {
  if (!condition) throw new Error(message);
};

const assertEq = (a: unknown, b: unknown, message = 'Assertion failed') => {
  if (a !== b) throw new Error(`${message}: '${a}' !== '${b}'`);
};

type UpdaterFunction<T> = (oldData: T) => T;
type DeepUpdaterFunction<T> = (oldData: T) => void;
type UpdateData<T> = T | UpdaterFunction<T>;

class JsonParser<T> {
  #queue: Superqueue<string>;
  #text = '';
  #index = 0;
  #offset = 0;
  #stream: Promise<JSONStreamResult<JSONStreamValue>>;

  constructor(queue: Superqueue<string>) {
    this.#queue = queue.pipe(r => [...r]).flat();

    this.#stream = (async () => {
      await this.#skipWhiteSpaces();
      return await this.parseValue()
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
      if (char === Superqueue.EOF) return undefined;
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

  #wrapResult<T extends JSONStreamValue>(
    initialData: T,
    callback: (update: {
      (data: UpdateData<T> | UpdaterFunction<T>, deep?: false): void;
      (data: DeepUpdaterFunction<T>, deep: true): void;
    }) => Promise<unknown>,
  ): JSONStreamResult<T> {
    const update = (
      data: UpdateData<T> | UpdaterFunction<T> | DeepUpdaterFunction<T>,
      deep = false,
    ) => {
      if (deep) {
        if (!(data instanceof Function)) {
          throw new Error('Data must be a function when using deep: true');
        }
        const newData = data(result.data);

        if (newData !== undefined) {
          throw new Error(
            'Update data must be undefined when using deep: true',
          );
        }
      } else {
        const newData = data instanceof Function ? data(result.data) : data;

        if (newData === undefined) {
          throw new Error('Update data cannot be undefined');
        }
        result.data = newData;
      }
    };
    const result: JSONStreamResult<T> = {
      data: initialData,
      wait: callback(update).then(() => result.data),
    };
    result.wait.catch(() => {});
    return result;
  }

  async parseValue() {
    const next = await this.#peekNonEof();

    switch (next) {
      case '{':
        return this.parseObject();
      case '[':
        return this.parseArray();
      case '"':
        return this.parseString();
      case 't':
        return this.parseBoolean(true);
      case 'f':
        return this.parseBoolean(false);
      case 'n':
        return this.parseNull();
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
        return this.parseNumber();
      default:
        throw new Error(`Unexpected token ${next} at index ${this.#pos} while parsing value in JSON`);
    }
  }

  parseObject() {
    return this.#wrapResult<JSONObjectStream>({}, async update => {
      await this.#expectNext('{');

      do {
        await this.#skipWhiteSpaces();
        if (await this.#peekNonEof() === '}') break;

        const key = await this.parseKey();
        await key.wait;

        await this.#skipWhiteSpaces();
        await this.#expectNext(':');
        await this.#skipWhiteSpaces();

        const val = await this.parseValue();
        update(data => void (data[key.data] = val), true);

        await val.wait;

        await this.#skipWhiteSpaces();
        if (await this.#peekNonEof() === '}') break;

        await this.#expectNext(',');
      } while (true);

      await this.#expectNext('}');
    });
  }

  parseArray() {
    return this.#wrapResult<JSONArrayStream>([], async update => {
      await this.#expectNext('[');

      do {
        await this.#skipWhiteSpaces();
        if (await this.#peekNonEof() === ']') break;

        const val = await this.parseValue();
        update(data => void data.push(val), true);

        await val.wait;

        await this.#skipWhiteSpaces();
        if (await this.#peekNonEof() === ']') break;

        await this.#expectNext(',');
      } while (true);

      await this.#expectNext(']');
    });
  }

  #numbers = '0123456789';

  parseNumber() {
    return this.#wrapResult<number>(0, async update => {
      let str = '';
      const consume = async () => {
        str += await this.#nextNonEof();
        update(() => Number(str));
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

  async parseKey(): Promise<JSONStreamResult<string>> {
    const char = await this.#peekNonEof();
    return char === '"' ? this.parseString() : this.parseIdentifier();
  }

  #letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_1234567890';

  parseIdentifier() {
    return this.#wrapResult<string>('', async update => {
      for (
        let char = await this.#peekNonEof();
        this.#letters.includes(char);
        char = await this.#peekNonEof()
      ) {
        await this.#nextNonEof();
        update(id => id + char);
      }
    });
  }

  parseString() {
    return this.#wrapResult<string>('', async update => {
      await this.#expectNext('"');
      await this.#peekNonEof();

      while (await this.#peekNonEof() !== '"') {
        const char = await this.#nextNonEof();

        if (char !== '\\') {
          update(str => str + char);
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
          update(str => str + escapeSequences[nextChar]);
          continue;
        }
        if (nextChar === 'u') {
          const char = parseInt(await this.#nextNonEof(4), 16);
          update(str => str + String.fromCharCode(char));
        } else if (nextChar === 'U') {
          const char = parseInt(await this.#nextNonEof(8), 16);
          update(str => str + String.fromCodePoint(char));
        } else {
          throw new Error(`Invalid escape sequence ${nextChar} at index ${this.#pos} in JSON`);
        }
      }
      await this.#expectNext('"');
    });
  }

  parseBoolean(expected: boolean) {
    return this.#wrapResult(expected, () =>
      this.#expectNext(expected ? 'true' : 'false'),
    );
  }

  parseNull() {
    return this.#wrapResult(null, () => this.#expectNext('null'));
  }

  async resolve(): Promise<T> {
    return this.#resolve(await this.#stream);
  }

  #resolve = (stream: JSONStreamResult<JSONStreamValue>): T => {
    switch (typeof stream.data) {
      case 'object':
        if (Array.isArray(stream.data)) {
          return stream.data.map(this.#resolve) as T extends Array<unknown>
            ? T
            : never;
        } else if (stream.data === null) {
          return null as T;
        } {
          const result: Record<string, unknown> = {};
          for (const key in stream.data) {
            result[key] = this.#resolve(stream.data[key]!);
          }
          return result as T;
        }
      default:
        return stream.data as T extends number | string | boolean ? T : never;
    }
  };
}

export default JsonParser;
