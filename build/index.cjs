Object.defineProperties(exports, {
	__esModule: { value: true },
	[Symbol.toStringTag]: { value: "Module" }
});
//#region src/index.ts
const assert = (condition, message = "Assertion failed") => {
	if (!condition) throw new Error(message);
};
const assertEq = (a, b, message = "Assertion failed") => {
	if (a !== b) throw new Error(`${message}: '${a}' !== '${b}'`);
};
var JsonParser = class {
	#iter;
	#text = "";
	#index = 0;
	#offset = 0;
	#done = false;
	#signal;
	#stream;
	constructor(input, options = {}) {
		this.#signal = options.signal;
		this.#iter = input[Symbol.asyncIterator]();
		this.#stream = (async () => {
			await this.#skipWhiteSpaces();
			return await this.#parseValue();
		})();
		this.#stream.catch(() => {});
	}
	get #pos() {
		return this.#offset + this.#index;
	}
	#isWhitespace(char) {
		return char === " " || char === "\n" || char === "	" || char === "\r";
	}
	async #next(len = 1) {
		const str = await this.#peek(len);
		if (str === void 0) return void 0;
		this.#index += len;
		if (this.#index >= 1024) {
			this.#offset += this.#index;
			this.#text = this.#text.slice(this.#index);
			this.#index = 0;
		}
		return str;
	}
	async #nextNonEof(len, message) {
		const chunk = await this.#next(len);
		assert(chunk !== void 0, `Unexpected end of JSON input at index ${this.#pos}: ${message}`);
		return chunk;
	}
	async #pullChunk() {
		var _this$signal;
		if (this.#done) return void 0;
		if ((_this$signal = this.#signal) === null || _this$signal === void 0 ? void 0 : _this$signal.aborted) {
			var _this$iter$return, _this$iter, _this$signal$reason;
			(_this$iter$return = (_this$iter = this.#iter).return) === null || _this$iter$return === void 0 || _this$iter$return.call(_this$iter);
			throw (_this$signal$reason = this.#signal.reason) !== null && _this$signal$reason !== void 0 ? _this$signal$reason : /* @__PURE__ */ new Error("aborted");
		}
		const nextPromise = this.#iter.next();
		const result = this.#signal ? await new Promise((resolve, reject) => {
			const onAbort = () => {
				var _this$iter$return2, _this$iter2, _reason;
				(_this$iter$return2 = (_this$iter2 = this.#iter).return) === null || _this$iter$return2 === void 0 || _this$iter$return2.call(_this$iter2);
				reject((_reason = this.#signal.reason) !== null && _reason !== void 0 ? _reason : /* @__PURE__ */ new Error("aborted"));
			};
			this.#signal.addEventListener("abort", onAbort, { once: true });
			nextPromise.then((v) => {
				this.#signal.removeEventListener("abort", onAbort);
				resolve(v);
			}, (e) => {
				this.#signal.removeEventListener("abort", onAbort);
				reject(e);
			});
		}) : await nextPromise;
		if (result.done) {
			this.#done = true;
			return;
		}
		return result.value;
	}
	async #peek(len = 1) {
		while (this.#text.length < this.#index + len) {
			const chunk = await this.#pullChunk();
			if (chunk === void 0) return void 0;
			this.#text += chunk;
		}
		return this.#text.slice(this.#index, this.#index + len);
	}
	async #peekNonEof(len, message) {
		const chunk = await this.#peek(len);
		assert(chunk !== void 0, `Unexpected end of JSON input at index ${this.#pos}: ${message}`);
		return chunk;
	}
	async #skipWhiteSpaces() {
		while (this.#isWhitespace(await this.#peekNonEof())) await this.#nextNonEof();
	}
	async #expectNext(expected) {
		const char = await this.#nextNonEof(expected.length, `Expected '${expected}' at index ${this.#pos}, got EOF.`);
		assertEq(char, expected, `Expected '${expected}' at index ${this.#pos}, got '${char}'`);
		return char;
	}
	#wrapResult(initialData, callback) {
		const set = (data) => {
			const newData = data instanceof Function ? data(result.data) : data;
			if (newData === void 0) throw new Error("set: data cannot be undefined");
			result.data = newData;
		};
		const mutate = (fn) => {
			if (fn(result.data) !== void 0) throw new Error("mutate: callback must return undefined");
		};
		const result = {
			data: initialData,
			done: false,
			wait: callback({
				set,
				mutate
			}).then(() => {
				result.done = true;
				return result.data;
			}, (err) => {
				result.done = true;
				result.error = err;
				throw err;
			})
		};
		result.wait.catch(() => {});
		return result;
	}
	async #parseValue() {
		const next = await this.#peekNonEof();
		switch (next) {
			case "{": return this.#parseObject();
			case "[": return this.#parseArray();
			case "\"": return this.#parseString();
			case "t": return this.#parseBoolean(true);
			case "f": return this.#parseBoolean(false);
			case "n": return this.#parseNull();
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
			case "9": return this.#parseNumber();
			default: throw new Error(`Unexpected token ${next} at index ${this.#pos} while parsing value in JSON`);
		}
	}
	#parseObject() {
		return this.#wrapResult({}, async ({ mutate }) => {
			await this.#expectNext("{");
			while (true) {
				await this.#skipWhiteSpaces();
				if (await this.#peekNonEof() === "}") break;
				const key = await this.#parseKey();
				await key.wait;
				await this.#skipWhiteSpaces();
				await this.#expectNext(":");
				await this.#skipWhiteSpaces();
				const val = await this.#parseValue();
				mutate((data) => void (data[key.data] = val));
				await val.wait;
				await this.#skipWhiteSpaces();
				if (await this.#peekNonEof() === "}") break;
				await this.#expectNext(",");
			}
			await this.#expectNext("}");
		});
	}
	#parseArray() {
		return this.#wrapResult([], async ({ mutate }) => {
			await this.#expectNext("[");
			while (true) {
				await this.#skipWhiteSpaces();
				if (await this.#peekNonEof() === "]") break;
				const val = await this.#parseValue();
				mutate((data) => void data.push(val));
				await val.wait;
				await this.#skipWhiteSpaces();
				if (await this.#peekNonEof() === "]") break;
				await this.#expectNext(",");
			}
			await this.#expectNext("]");
		});
	}
	#numbers = "0123456789";
	#parseNumber() {
		return this.#wrapResult(0, async ({ set }) => {
			let str = "";
			const consume = async () => {
				str += await this.#nextNonEof();
				set(() => Number(str));
			};
			const isDigit = (c) => c !== void 0 && this.#numbers.includes(c);
			if (await this.#peekNonEof() === "-") await consume();
			if (!isDigit(await this.#peekNonEof())) throw new Error(`Expected digit at index ${this.#pos}, got '${await this.#peek()}'`);
			while (isDigit(await this.#peek())) await consume();
			if (await this.#peek() === ".") {
				await consume();
				while (isDigit(await this.#peek())) await consume();
			}
			const expChar = await this.#peek();
			if (expChar === "e" || expChar === "E") {
				await consume();
				const sign = await this.#peek();
				if (sign === "+" || sign === "-") await consume();
				while (isDigit(await this.#peek())) await consume();
			}
		});
	}
	async #parseKey() {
		return await this.#peekNonEof() === "\"" ? this.#parseString() : this.#parseIdentifier();
	}
	#letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_1234567890";
	#parseIdentifier() {
		return this.#wrapResult("", async ({ set }) => {
			for (let char = await this.#peekNonEof(); this.#letters.includes(char); char = await this.#peekNonEof()) {
				await this.#nextNonEof();
				set((id) => id + char);
			}
		});
	}
	#parseString() {
		return this.#wrapResult("", async ({ set }) => {
			await this.#expectNext("\"");
			await this.#peekNonEof();
			while (await this.#peekNonEof() !== "\"") {
				const char = await this.#nextNonEof();
				if (char !== "\\") {
					set((str) => str + char);
					continue;
				}
				const nextChar = await this.#nextNonEof();
				const escapeSequences = {
					"\"": "\"",
					"\\": "\\",
					"/": "/",
					b: "\b",
					f: "\f",
					n: "\n",
					r: "\r",
					t: "	"
				};
				if (escapeSequences[nextChar]) {
					set((str) => str + escapeSequences[nextChar]);
					continue;
				}
				if (nextChar === "u" || nextChar === "U") {
					const width = nextChar === "u" ? 4 : 8;
					const hex = await this.#nextNonEof(width);
					if (!/^[0-9a-fA-F]+$/.test(hex)) throw new Error(`Invalid hex in \\${nextChar} escape at index ${this.#pos}: '${hex}'`);
					const codePoint = parseInt(hex, 16);
					set((str) => str + String.fromCodePoint(codePoint));
				} else throw new Error(`Invalid escape sequence ${nextChar} at index ${this.#pos} in JSON`);
			}
			await this.#expectNext("\"");
		});
	}
	#parseBoolean(expected) {
		return this.#wrapResult(expected, () => this.#expectNext(expected ? "true" : "false"));
	}
	#parseNull() {
		return this.#wrapResult(null, () => this.#expectNext("null"));
	}
	get root() {
		return this.#stream;
	}
	async snapshot() {
		return this.#snapshot(await this.#stream);
	}
	#snapshot = (stream) => {
		if (typeof stream.data !== "object") return stream.data;
		if (stream.data === null) return null;
		if (Array.isArray(stream.data)) return stream.data.map(this.#snapshot);
		const result = {};
		for (const key in stream.data) result[key] = this.#snapshot(stream.data[key]);
		return result;
	};
};
const streamJson = (input, options) => new JsonParser(input, options);
//#endregion
exports.default = JsonParser;
exports.streamJson = streamJson;
