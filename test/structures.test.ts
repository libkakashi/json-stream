import {describe, test, expect} from 'bun:test';
import {parseFull} from './helpers';

describe('empty / whitespace-only containers', () => {
  test('empty object with whitespace inside', async () => {
    expect(await parseFull('{   }')).toEqual({});
  });

  test('empty array with whitespace inside', async () => {
    expect(await parseFull('[   ]')).toEqual([]);
  });

  test('whitespace-only between brackets and content', async () => {
    expect(await parseFull('[\n  1\n]')).toEqual([1]);
  });

  test('whitespace before and after entire document', async () => {
    expect(await parseFull('\n\n  42  \n\n')).toBe(42);
  });
});

describe('deep nesting', () => {
  test('100-level array nesting', async () => {
    let input = '"leaf"';
    for (let i = 0; i < 100; i++) input = `[${input}]`;
    const result = await parseFull(input);
    let cur: unknown = result;
    for (let i = 0; i < 100; i++) {
      expect(Array.isArray(cur)).toBe(true);
      cur = (cur as unknown[])[0];
    }
    expect(cur).toBe('leaf');
  });

  test('alternating object/array nesting', async () => {
    let input = '"leaf"';
    for (let i = 0; i < 30; i++) {
      input = i % 2 === 0 ? `{"a":${input}}` : `[${input}]`;
    }
    const result = await parseFull(input);
    let cur: unknown = result;
    for (let i = 29; i >= 0; i--) {
      cur = i % 2 === 0 ? (cur as {a: unknown}).a : (cur as unknown[])[0];
    }
    expect(cur).toBe('leaf');
  });
});

describe('duplicate keys', () => {
  test('later value wins', async () => {
    expect(await parseFull('{"a":1,"a":2}')).toEqual({a: 2});
  });
});

describe('special string contents', () => {
  test('string containing only escape sequences', async () => {
    expect(await parseFull('"\\n\\t\\r\\b\\f"')).toBe('\n\t\r\b\f');
  });

  test('string of 4000 chars', async () => {
    const s = 'a'.repeat(4000);
    expect(await parseFull(`"${s}"`)).toBe(s);
  });

  test('emoji in string content', async () => {
    expect(await parseFull('"hi 😀 there"')).toBe('hi 😀 there');
  });

  test('emoji as object key (via unicode escape)', async () => {
    // String keys go through parseString so escapes work
    expect(await parseFull('{"\\uD83D\\uDE00":"smile"}')).toEqual({
      '😀': 'smile',
    });
  });
});

describe('mixed real-world-ish payloads', () => {
  test('object with arrays containing objects', async () => {
    const input = `{
      "users": [
        {"id": 1, "name": "Ada", "active": true},
        {"id": 2, "name": "Linus", "active": false}
      ],
      "count": 2
    }`;
    expect(await parseFull(input)).toEqual({
      users: [
        {id: 1, name: 'Ada', active: true},
        {id: 2, name: 'Linus', active: false},
      ],
      count: 2,
    });
  });

  test('LLM-shaped output with unquoted keys and trailing commas', async () => {
    const input = `{
      title: "Test Course",
      lessons: [
        {id: 1, title: "Intro",},
        {id: 2, title: "Deep dive",},
      ],
    }`;
    expect(await parseFull(input)).toEqual({
      title: 'Test Course',
      lessons: [
        {id: 1, title: 'Intro'},
        {id: 2, title: 'Deep dive'},
      ],
    });
  });
});
