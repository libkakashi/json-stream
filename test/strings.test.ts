import {describe, test, expect} from 'bun:test';
import {parseExpectError, parseFull} from './helpers';

describe('plain strings', () => {
  test('simple ascii', async () => {
    expect(await parseFull('"hello"')).toBe('hello');
  });

  test('empty', async () => {
    expect(await parseFull('""')).toBe('');
  });

  test('contains spaces and punctuation', async () => {
    expect(await parseFull('"Hello, world!"')).toBe('Hello, world!');
  });
});

describe('escape sequences', () => {
  test('newline, tab, carriage return', async () => {
    expect(await parseFull('"a\\nb\\tc\\rd"')).toBe('a\nb\tc\rd');
  });

  test('backslash and forward slash', async () => {
    expect(await parseFull('"\\\\\\/"')).toBe('\\/');
  });

  test('quote', async () => {
    expect(await parseFull('"say \\"hi\\""')).toBe('say "hi"');
  });

  test('backspace and form feed', async () => {
    expect(await parseFull('"\\b\\f"')).toBe('\b\f');
  });

  test('combined escapes inside object value', async () => {
    expect(await parseFull('{"message":"Hello\\nWorld\\t\\"Testing\\""}')).toEqual({
      message: 'Hello\nWorld\t"Testing"',
    });
  });
});

describe('unicode escapes', () => {
  test('\\u for BMP code point', async () => {
    expect(await parseFull('"\\u0041"')).toBe('A');
  });

  test('\\u for surrogate pair combines to astral character', async () => {
    expect(await parseFull('"\\uD83D\\uDE00"')).toBe('😀');
  });

  test('\\U with 8 hex digits handles astral plane directly', async () => {
    expect(await parseFull('"\\U0001F600"')).toBe('😀');
  });

  test('throws on invalid hex in \\u', async () => {
    const err = await parseExpectError('"\\uZZZZ"');
    expect(err.message).toMatch(/invalid hex/i);
  });

  test('throws on partial invalid hex in \\u', async () => {
    const err = await parseExpectError('"\\u12ZZ"');
    expect(err.message).toMatch(/invalid hex/i);
  });

  test('throws on invalid hex in \\U', async () => {
    const err = await parseExpectError('"\\UZZZZZZZZ"');
    expect(err.message).toMatch(/invalid hex/i);
  });
});

describe('invalid escapes', () => {
  test('throws on unknown escape', async () => {
    const err = await parseExpectError('"\\x"');
    expect(err.message).toMatch(/invalid escape sequence/i);
  });
});
