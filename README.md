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
import {parseStream} from 'json-stream';

const res = await fetch('https://example.com/streaming-json');
const stream = res.body!.pipeThrough(new TextDecoderStream());

const root = await parseStream(stream);

// root.data is the live tree — values appear and grow as parsing proceeds
console.log(root.data); // {} or partial right now

// Await the full parse:
await root.wait;
console.log(root.data); // {name: "Ada", description: "…"}
```

`parseStream` returns the root `JSONStreamResult` immediately — `.data` mutates in place as chunks arrive, `.wait` resolves on completion, `.done` flips to `true`, and `.error` is populated if anything fails.

## Walking the live tree

The tree is built out of `JSONStreamResult` nodes. Each node has `data`/`wait`/`done`/`error`. Strings, numbers, booleans, and nulls land in `data` directly; arrays hold `JSONStreamResult` children, and objects map keys to `JSONStreamResult` children.

```ts
const root = await parseStream(stream);

// Watch a specific field grow:
const obj = root.data as Record<string, JSONStreamResult<JSONStreamValue>>;
const interval = setInterval(() => {
  const name = obj.name?.data;
  console.log('name so far:', name);
  if (obj.name?.done) clearInterval(interval);
}, 16);
```

## Snapshots (deep copy)

For consumers that want a plain JS object at a point in time, use the `JsonParser` class directly:

```ts
import JsonParser from 'json-stream';

const parser = new JsonParser<{name?: string; age?: number}>(stream);

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
const root = await parseStream(stream, {signal: ac.signal});

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

### `parseStream(input, options?) → Promise<JSONStreamResult>`

```ts
parseStream(
  input: AsyncIterable<string>,
  options?: {signal?: AbortSignal},
): Promise<JSONStreamResult<JSONStreamValue>>
```

The primary entry point. Returns the root node as soon as the first character is peeked.

### `JSONStreamResult<T>`

```ts
type JSONStreamResult<T> = {
  data: T;            // live, mutates in place
  wait: Promise<T>;   // resolves on completion, rejects on error
  done: boolean;      // true once wait has settled
  error?: Error;      // populated on rejection
};
```

### `new JsonParser(input, options?)`

The underlying class. Use it if you want the `snapshot()` convenience:

```ts
const parser = new JsonParser<MyShape>(input, {signal});
parser.root;            // same as parseStream(input)
await parser.snapshot();// deep-copied plain JS value of current state
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
const root = await parseStream(chunks());
```
