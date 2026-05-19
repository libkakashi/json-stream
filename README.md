# json-stream

A lenient streaming JSON parser. Reads from an `AsyncIterable<string>` and exposes the in-progress tree as it's parsed — designed for rendering LLM JSON output token-by-token without waiting for the full response.

Not meant for files larger than memory.

## Install

```bash
# npm
npm i github:libkakashi/json-stream

# yarn
yarn add github:libkakashi/json-stream
```

## Quick start

```ts
import {streamJson} from 'json-stream';

const res = await fetch('https://example.com/streaming-json');
const stream = res.body!.pipeThrough(new TextDecoderStream());

const parser = streamJson(stream);
const root = await parser.root;

// root.data is the live tree — values appear and grow as parsing proceeds
console.log(root.data); // {} or partial right now

// Await the full parse:
await root.wait;
console.log(root.data); // {name: "Ada", description: "…"}
```

`streamJson(input)` returns a `JsonParser` synchronously. From it you can grab `.root` (a promise to the root `JSONStreamResult`) or call `.snapshot()` to get a plain-JS copy of the current state. On the root node, `.data` mutates in place as chunks arrive, `.wait` resolves on completion, `.done` flips to `true`, and `.error` is populated if anything fails.

## Walking the live tree

The tree is built out of `JSONStreamResult` nodes. Each node has `data`/`wait`/`done`/`error`. Strings, numbers, booleans, and nulls land in `data` directly; arrays hold `JSONStreamResult` children, and objects map keys to `JSONStreamResult` children.

```ts
const root = await streamJson(stream).root;

// Watch a specific field grow:
const obj = root.data as Record<string, JSONStreamResult<JSONStreamValue>>;
const interval = setInterval(() => {
  const name = obj.name?.data;
  console.log('name so far:', name);
  if (obj.name?.done) clearInterval(interval);
}, 16);
```

## Snapshots (deep copy)

For consumers that want a plain JS object at a point in time, use `snapshot()` on the parser:

```ts
const parser = streamJson<{name?: string; age?: number}>(stream);

// poll over time:
setInterval(async () => {
  const snap = await parser.snapshot();
  render(snap);
}, 100);
```

`snapshot()` walks the live tree once and returns a plain JS value with the same shape — strings, numbers, plain objects, plain arrays. It does **not** wait for the parse to finish; you get whatever's parsed at the moment of the call.

## Cancellation

Pass an `AbortSignal` to stop parsing on disconnect or unmount:

```ts
const ac = new AbortController();
const root = await streamJson(stream, {signal: ac.signal}).root;

// later, e.g. on user navigation:
ac.abort();

// root.wait rejects with the abort reason; root.error is populated.
```

## Leniency

The parser deliberately accepts inputs the JSON spec would reject, because LLM output isn't always strict JSON:

- **Unquoted object keys**: `{title: "x"}` → `{title: "x"}`
- **Trailing commas**: `[1, 2,]` → `[1, 2]`
- **Recoverable number errors**: `01` → `1`, `1.` → `1`, `1.2.3` → `1.2` (rest left for the outer parser)
- **Bare control characters in strings**: not rejected

It still throws on outright malformed input (unknown escape sequences, garbage tokens, bare `-` with no digit, invalid hex in `\u` / `\U`).

## API

### `streamJson(input, options?) → JsonParser`

```ts
streamJson<T extends JSONValue = JSONValue>(
  input: AsyncIterable<string>,
  options?: {signal?: AbortSignal},
): JsonParser<T>
```

The primary entry point. Returns a parser instance synchronously. Equivalent to `new JsonParser(input, options)` without the `new`.

### `JsonParser`

```ts
class JsonParser<T extends JSONValue = JSONValue> {
  get root: Promise<JSONStreamResult<JSONStreamValue>>;
  snapshot(): Promise<T>;
}
```

- `.root` — resolves to the root `JSONStreamResult` as soon as the first character is peeked.
- `.snapshot()` — deep-copied plain JS value of the current state. Does not wait for the parse to finish.

### `JSONStreamResult<T>`

```ts
type JSONStreamResult<T> = {
  data: T;            // live, mutates in place
  wait: Promise<T>;   // resolves on completion, rejects on error
  done: boolean;      // true once wait has settled
  error?: Error;      // populated on rejection
};
```

### Input

Any `AsyncIterable<string>` works:

- Web `ReadableStream` after `pipeThrough(new TextDecoderStream())`
- Node `Readable` (Node 16+ implements async iteration)
- Async generators
- [`superqueue`](https://github.com/libkakashi/superqueue) — original integration; still supported

```ts
async function* chunks() {
  yield '{"a":';
  yield '1}';
}
const root = await streamJson(chunks()).root;
```
