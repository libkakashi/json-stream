"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);
var import_superqueue = __toESM(require("superqueue"), 1);
var assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};
var assertEq = (a, b, message = "Assertion failed") => {
  if (a !== b) throw new Error(`${message}: '${a}' !== '${b}'`);
};
var numbers = "0123456789";
var JsonParser = class {
  #queue;
  #last = "";
  #index = 0;
  #stream;
  constructor(queue) {
    this.#queue = queue.pipe((r) => [...r]).flat();
    this.#stream = this.parseValue();
  }
  #isWhitespace(char) {
    return char === " " || char === "\n" || char === "	" || char === "\r";
  }
  async #next(len = 1) {
    let str = "";
    for (let i = 0; i < len; i++) {
      const char = await this.#queue.shiftUnsafe();
      if (char === import_superqueue.default.EOF) return void 0;
      str += char;
    }
    this.#last = str.charAt(len - 1);
    this.#index += len;
    return str;
  }
  async #nextNonEof(len, message) {
    const chunk = await this.#next(len);
    assert(chunk !== void 0, `Unexpected end of JSON input at index ${this.#index}: ${message}`);
    return chunk;
  }
  async #skipWhiteSpaces() {
    for (let char = await this.#nextNonEof(1, "skipWhiteSpaces"); ; char = await this.#nextNonEof(1, "skipWhiteSpaces")) {
      if (!this.#isWhitespace(char)) return char;
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
        if (newData) {
          throw new Error(
            "Update data must be undefined when using deep: true"
          );
        }
        return;
      } else {
        const newData = data instanceof Function ? data(result.data) : data;
        if (!newData) {
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
  async parseValue(skip = true) {
    if (skip) await this.#skipWhiteSpaces();
    switch (this.#last) {
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
        throw new Error(`Unexpected token ${this.#last} at index ${this.#index} while parsing value in JSON`);
    }
  }
  parseObject() {
    return this.#wrapResult({}, async (update) => {
      while (true) {
        await this.#skipWhiteSpaces();
        if (this.#last === "}") break;
        const key = this.parseString();
        await key.wait;
        assertEq(await this.#skipWhiteSpaces(), ":");
        const val = await this.parseValue();
        update((data) => void (data[key.data] = val), true);
        await val.wait;
        if (typeof val.data !== "number" || this.#isWhitespace(this.#last)) {
          await this.#skipWhiteSpaces();
        }
        if (this.#last === "}") break;
        if (this.#last !== ",") {
          throw new Error(`Unexpected token ${this.#last} at index ${this.#index} while parsing object in JSON`);
        }
      }
    });
  }
  parseArray() {
    return this.#wrapResult([], async (update) => {
      while (true) {
        await this.#skipWhiteSpaces();
        if (this.#last === "]") break;
        const val = await this.parseValue(false);
        update((data) => void data.push(val), true);
        await val.wait;
        if (typeof val.data !== "number" || this.#isWhitespace(this.#last)) {
          await this.#skipWhiteSpaces();
        }
        if (this.#last === "]") break;
        if (this.#last !== ",")
          throw new Error(`Unexpected token ${this.#last} at index ${this.#index} while parsing array in JSON`);
      }
    });
  }
  parseNumber() {
    return this.#wrapResult(parseInt(this.#last), async (update) => {
      for (let char = await this.#next(); ; char = await this.#next()) {
        if (!char || !(numbers.includes(char) && char !== ".")) {
          break;
        }
        update((num) => parseFloat(num.toString() + char));
      }
    });
  }
  parseString() {
    return this.#wrapResult("", async (update) => {
      for (let char = await this.#nextNonEof(); char !== '"'; char = await this.#nextNonEof()) {
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
        }
        throw new Error(`Invalid escape sequence ${nextChar} at index ${this.#index} in JSON`);
      }
    });
  }
  parseBoolean(expected) {
    return this.#wrapResult(
      expected,
      () => this.#expectNext(expected ? "rue" : "alse")
    );
  }
  parseNull() {
    return this.#wrapResult(null, () => this.#expectNext("ull"));
  }
  async resolve() {
    return this.#resolve(await this.#stream);
  }
  #resolve = (stream) => {
    switch (typeof stream.data) {
      case "object":
        if (Array.isArray(stream.data)) {
          return stream.data.map(this.#resolve);
        } else {
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
