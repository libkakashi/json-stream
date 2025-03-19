// src/index.ts
import Queue from "superqueue";
var assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};
var assertEq = (a, b, message = "Assertion failed") => {
  if (a !== b) throw new Error(`${message}: '${a}' !== '${b}'`);
};
console.log("v2");
var JsonParser = class {
  #queue;
  #text = "";
  #index = 0;
  #stream;
  constructor(queue) {
    console.log("v2");
    this.#queue = queue.pipe((r) => [...r]).flat();
    this.#stream = (async () => {
      await this.#skipWhiteSpaces();
      return await this.parseValue();
    })();
  }
  #isWhitespace(char) {
    return char === " " || char === "\n" || char === "	" || char === "\r";
  }
  async #next(len = 1) {
    const str = await this.#peek(len);
    this.#index += len;
    return str;
  }
  async #nextNonEof(len, message) {
    const chunk = await this.#next(len);
    assert(chunk !== void 0, `Unexpected end of JSON input at index ${this.#index}: ${message}`);
    return chunk;
  }
  async #peek(len = 1) {
    while (this.#text.length < this.#index + len) {
      const char = await this.#queue.shiftUnsafe();
      if (char === Queue.EOF) return void 0;
      this.#text += char;
    }
    const result = this.#text.slice(this.#index, this.#index + len);
    return result;
  }
  async #peekNonEof(len, message) {
    const chunk = await this.#peek(len);
    assert(chunk !== void 0, `Unexpected end of JSON input at index ${this.#index}: ${message}`);
    return chunk;
  }
  async #skipWhiteSpaces() {
    while (this.#isWhitespace(await this.#peekNonEof())) {
      await this.#nextNonEof();
    }
  }
  async #expectNext(expected) {
    const char = await this.#nextNonEof(expected.length, `Expected '${expected}' at index ${this.#index}, got EOF.`);
    assertEq(char, expected, `Expected '${expected}' at index ${this.#index}, got '${char}'`);
    return char;
  }
  #wrapResult(initialData, callback) {
    const update = (data, deep = false) => {
      if (deep) {
        if (!(data instanceof Function)) {
          throw new Error("Data must be a function when using deep: true");
        }
        const newData = data(result.data);
        if (newData !== void 0) {
          throw new Error(
            "Update data must be undefined when using deep: true"
          );
        }
      } else {
        const newData = data instanceof Function ? data(result.data) : data;
        if (newData === void 0) {
          throw new Error("Update data cannot be undefined");
        }
        result.data = newData;
      }
    };
    const result = {
      data: initialData,
      wait: callback(update).then(() => result.data)
    };
    return result;
  }
  async parseValue() {
    const next = await this.#peekNonEof();
    switch (next) {
      case "{":
        return this.parseObject();
      case "[":
        return this.parseArray();
      case '"':
        return this.parseString();
      case "t":
        return this.parseBoolean(true);
      case "f":
        return this.parseBoolean(false);
      case "n":
        return this.parseNull();
      case "-":
      case "0":
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9":
        return this.parseNumber();
      default:
        console.error(this.#text.slice(this.#index - 10));
        throw new Error(`Unexpected token ${next} at index ${this.#index} while parsing value in JSON`);
    }
  }
  parseObject() {
    return this.#wrapResult({}, async (update) => {
      await this.#expectNext("{");
      do {
        await this.#skipWhiteSpaces();
        if (await this.#peekNonEof() === "}") break;
        const key = this.parseKey();
        await key.wait;
        await this.#skipWhiteSpaces();
        await this.#expectNext(":");
        await this.#skipWhiteSpaces();
        const val = await this.parseValue();
        update((data) => void (data[key.data] = val), true);
        await val.wait;
        await this.#skipWhiteSpaces();
        if (await this.#peekNonEof() === "}") break;
        await this.#expectNext(",");
      } while (true);
      await this.#expectNext("}");
    });
  }
  parseArray() {
    return this.#wrapResult([], async (update) => {
      await this.#expectNext("[");
      do {
        await this.#skipWhiteSpaces();
        if (await this.#peekNonEof() === "]") break;
        const val = await this.parseValue();
        update((data) => void data.push(val), true);
        await val.wait;
        await this.#skipWhiteSpaces();
        if (await this.#peekNonEof() === "]") break;
        await this.#expectNext(",");
      } while (true);
      await this.#expectNext("]");
    });
  }
  #numbers = "0123456789";
  parseNumber() {
    return this.#wrapResult(0, async (update) => {
      let str = "";
      const negative = await this.#peekNonEof() === "-";
      if (negative) {
        str += "-";
        await this.#nextNonEof();
      }
      for (let char = await this.#peekNonEof(); this.#numbers.includes(char) || char === "."; char = await this.#peekNonEof()) {
        await this.#nextNonEof();
        str += char;
        update(() => Number(str));
      }
    });
  }
  parseKey() {
    return this.#wrapResult("", async (update) => {
      const char = await this.#peekNonEof();
      const key = char === '"' ? this.parseString() : this.parseIdentifier();
      await key.wait;
      update(key.data);
    });
  }
  #letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_1234567890";
  parseIdentifier() {
    return this.#wrapResult("", async (update) => {
      for (let char = await this.#peekNonEof(); this.#letters.includes(char); char = await this.#peekNonEof()) {
        await this.#nextNonEof();
        update((id) => id + char);
      }
    });
  }
  parseString() {
    return this.#wrapResult("", async (update) => {
      await this.#expectNext('"');
      await this.#peekNonEof();
      while (await this.#peekNonEof() !== '"') {
        const char = await this.#nextNonEof();
        if (char !== "\\") {
          update((str) => str + char);
          continue;
        }
        const nextChar = await this.#nextNonEof();
        const escapeSequences = {
          '"': '"',
          "\\": "\\",
          "/": "/",
          b: "\b",
          f: "\f",
          n: "\n",
          r: "\r",
          t: "	"
        };
        if (escapeSequences[nextChar]) {
          update((str) => str + escapeSequences[nextChar]);
          continue;
        }
        if (nextChar === "u") {
          const char2 = parseInt(await this.#nextNonEof(4), 16);
          update((str) => str + String.fromCharCode(char2));
        } else if (nextChar === "U") {
          const char2 = parseInt(await this.#nextNonEof(8), 16);
          update((str) => str + String.fromCharCode(char2));
        } else {
          throw new Error(`Invalid escape sequence ${nextChar} at index ${this.#index} in JSON`);
        }
      }
      await this.#expectNext('"');
    });
  }
  parseBoolean(expected) {
    return this.#wrapResult(
      expected,
      () => this.#expectNext(expected ? "true" : "false")
    );
  }
  parseNull() {
    return this.#wrapResult(null, () => this.#expectNext("null"));
  }
  async resolve() {
    return this.#resolve(await this.#stream);
  }
  #resolve = (stream) => {
    switch (typeof stream.data) {
      case "object":
        if (Array.isArray(stream.data)) {
          return stream.data.map(this.#resolve);
        } else if (stream.data === null) {
          return null;
        }
        {
          const result = {};
          for (const key in stream.data) {
            result[key] = this.#resolve(stream.data[key]);
          }
          return result;
        }
      default:
        return stream.data;
    }
  };
};
var index_default = JsonParser;
export {
  index_default as default
};
