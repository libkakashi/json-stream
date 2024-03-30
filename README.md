A streaming JSON parser for Node.js that works with [superqueue](https://github.com/libkakashi/superqueue). This parser is designed to work with streaming JSON data, such as live generating JSON by an LLM where you want to display it in real-time as it's being generated.

Note: This is not meant to work with files that are too large to fit in memory.

### Installation

```bash
// yarn
yarn add superqueue@https://github.com/libkakashi/json-stream

// npm
npm i https://github.com/libkakashi/json-stream
```

### Example Usage

```tsx
import Queue from 'superqueue'; // https://github.com/libkakashi/superqueue
import JsonParser, {resolveStreamResult} from 'json-stream';

const queue = new Queue<string>();
const parser = new JsonParser(queue);
const jsonStream = parser.parseValue();

const res = await axios.get('streaming-json-endpoint', {
  responseType: 'stream',
});
const stream = res.data;

stream.on('data', chunk => {
  queue.push(...chunk); // push character by character, very important

  // obj gets name and description properties dynamically populated as more chunks are received. Make sure to keep every property optional since you never know when they'll be populated.
  const obj = await resolveStreamResult<{name?: string; description?: string}>(
    jsonStream
  );
});
stream.on('end', () => queue.end());
```
