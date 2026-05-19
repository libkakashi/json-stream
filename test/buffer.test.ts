import {describe, test, expect} from 'bun:test';
import {parseExpectError, parseFull} from './helpers';

describe('buffer slide (>1024 chars)', () => {
  test('parses very long string', async () => {
    const longText = 'x'.repeat(5000);
    const result = await parseFull(`"${longText}"`);
    expect(result).toBe(longText);
  });

  test('parses long array of integers', async () => {
    const arr = Array.from({length: 2000}, (_, i) => i);
    const result = await parseFull(JSON.stringify(arr));
    expect(result).toEqual(arr);
  });

  test('parses long object with many keys', async () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) obj[`key${i}`] = i;
    const result = await parseFull(JSON.stringify(obj));
    expect(result).toEqual(obj);
  });

  test('parses deeply nested structure with cumulative size > slide threshold', async () => {
    let input = '"leaf"';
    for (let i = 0; i < 200; i++) input = `[${input}]`;
    const result = await parseFull(input);
    let cur: unknown = result;
    for (let i = 0; i < 200; i++) cur = (cur as unknown[])[0];
    expect(cur).toBe('leaf');
  });
});

describe('error positions after buffer slide', () => {
  test('error position is reported relative to original input even after slide', async () => {
    const prefix = '"' + 'x'.repeat(2000) + '"';
    const input = `[${prefix},@]`;
    const err = await parseExpectError(input);
    // The @ is at position 1 + prefix.length + 1 = 2003
    const expected = 1 + prefix.length + 1;
    expect(err.message).toContain(`index ${expected}`);
  });
});

describe('position reporting accuracy', () => {
  test('error at position 0', async () => {
    const err = await parseExpectError('@');
    expect(err.message).toContain('index 0');
  });

  test('error after one valid token', async () => {
    const err = await parseExpectError('[1, @]');
    // [ 1 , space @, so @ is at position 4
    expect(err.message).toContain('index 4');
  });

  test('error inside object key area', async () => {
    // After parseKey reads `"a"`, #expectNext(':') consumes '@' (advancing
    // #index past it) and only then realises the mismatch — so the error
    // reports the index AFTER the bad character.
    const err = await parseExpectError('{"a"@1}');
    expect(err.message).toMatch(/index 5/);
  });
});

describe('EOF positions', () => {
  test('EOF inside string includes index', async () => {
    const err = await parseExpectError('"abc');
    expect(err.message).toMatch(/end of json input/i);
    expect(err.message).toMatch(/index/);
  });

  test('EOF after opening brace', async () => {
    const err = await parseExpectError('{');
    expect(err.message).toMatch(/end of json input/i);
  });
});
