import Queue from 'superqueue';

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

const numbers = '0123456789';

type UpdaterFunction<T> = (oldData: T) => T;
type DeepUpdaterFunction<T> = (oldData: T) => void;
type UpdateData<T> = T | UpdaterFunction<T>;

class JsonParser<T> {
  queue: Queue<string>;
  last = '';
  #stream: Promise<JSONStreamResult<JSONStreamValue>>;

  constructor(queue: Queue<string>) {
    this.queue = queue;
    this.#stream = this.parseValue();
  }

  #isWhitespace(char: string): boolean {
    return char === ' ' || char === '\n' || char === '\t' || char === '\r';
  }

  async #next(len = 1): Promise<string | undefined> {
    let str = '';

    for (let i = 0; i < len; i++) {
      const char = await this.queue.shiftUnsafe();
      if (char === Queue.EOF) return undefined;
      str += char;
    }
    this.last = str.charAt(str.length - 1);
    return str;
  }

  async #nextNonEof(len?: number): Promise<string> {
    const chunk = await this.#next(len);
    assert(chunk !== undefined, 'Unexpected end of JSON input.');
    return chunk!;
  }

  async #skipWhiteSpaces(): Promise<string> {
    for (
      let char = await this.#nextNonEof();
      ;
      char = await this.#nextNonEof()
    ) {
      if (!this.#isWhitespace(char)) return char;
    }
  }

  async #expectNext(expected: string): Promise<string> {
    const char = await this.#nextNonEof(expected.length);
    assertEq(char, expected, `Expected '${expected}' got '${char} '`);
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

        if (newData) {
          throw new Error(
            'Update data must be undefined when using deep: true',
          );
        }
        return;
      } else {
        const newData = data instanceof Function ? data(result.data) : data;

        if (!newData) {
          throw new Error('Update data cannot be undefined');
        }
        result.data = newData;
      }
    };
    const result: JSONStreamResult<T> = {
      data: initialData,
      wait: callback(update).then(() => result.data),
    };
    return result;
  }

  async parseValue(skip = true) {
    if (skip) await this.#skipWhiteSpaces();

    switch (this.last) {
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
        throw new Error(`Unexpected token ${this.last} in JSON`);
    }
  }

  parseObject() {
    return this.#wrapResult<JSONObjectStream>({}, async update => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await this.#skipWhiteSpaces();
        if (this.last === '}') break;

        const key = this.parseString();
        await key.wait;

        assertEq(await this.#skipWhiteSpaces(), ':');

        const val = await this.parseValue();
        update(data => void (data[key.data] = val), true);

        await val.wait;

        if (typeof val!.data !== 'number' || this.#isWhitespace(this.last)) {
          await this.#skipWhiteSpaces();
        }
        if (this.last === '}') break;
        if (this.last !== ',') {
          throw new Error(`Unexpected token ${this.last} in JSON`);
        }
      }
    });
  }

  parseArray() {
    return this.#wrapResult<JSONArrayStream>([], async update => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await this.#skipWhiteSpaces();
        if (this.last === ']') break;

        const val = await this.parseValue(false);
        update(data => void data.push(val), true);

        await val.wait;

        if (typeof val.data !== 'number' || this.#isWhitespace(this.last)) {
          await this.#skipWhiteSpaces();
        }
        if (this.last === ']') break;
        if (this.last !== ',')
          throw new Error(`Unexpected token ${this.last} in JSON`);
      }
    });
  }

  parseNumber() {
    return this.#wrapResult(parseInt(this.last), async update => {
      for (let char = await this.#next(); ; char = await this.#next()) {
        if (!char || !(numbers.includes(char) && char !== '.')) {
          break;
        }
        update(num => parseFloat(num.toString() + char));
      }
    });
  }

  parseString() {
    return this.#wrapResult<string>('', async update => {
      for (
        let char = await this.#nextNonEof();
        char !== '"';
        char = await this.#nextNonEof()
      ) {
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
          update(str => str + String.fromCharCode(char));
        }
        throw new Error(`Invalid escape sequence ${nextChar} in JSON`);
      }
    });
  }

  parseBoolean(expected: boolean) {
    return this.#wrapResult(expected, () =>
      this.#expectNext(expected ? 'rue' : 'alse'),
    );
  }

  parseNull() {
    return this.#wrapResult(null, () => this.#expectNext('ull'));
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
        } else {
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
