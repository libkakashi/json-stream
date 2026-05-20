import {describe, test, expect} from 'bun:test';
import {parseExpectError, parseFull} from './helpers';

describe('integers', () => {
  test('zero', async () => {
    expect(await parseFull('0')).toBe(0);
  });

  test('positive', async () => {
    expect(await parseFull('123')).toBe(123);
  });

  test('negative', async () => {
    expect(await parseFull('-456')).toBe(-456);
  });

  test('large value (within Number.MAX_SAFE_INTEGER)', async () => {
    expect(await parseFull('9007199254740991')).toBe(9007199254740991);
  });
});

describe('decimals', () => {
  test('positive decimal', async () => {
    expect(await parseFull('3.14')).toBe(3.14);
  });

  test('negative decimal', async () => {
    expect(await parseFull('-0.5')).toBe(-0.5);
  });

  test('zero point something', async () => {
    expect(await parseFull('0.001')).toBe(0.001);
  });
});

describe('exponents', () => {
  test('lowercase e', async () => {
    expect(await parseFull('1e10')).toBe(1e10);
  });

  test('uppercase E', async () => {
    expect(await parseFull('1E10')).toBe(1e10);
  });

  test('positive exponent sign', async () => {
    expect(await parseFull('1.5e+3')).toBe(1500);
  });

  test('negative exponent sign', async () => {
    expect(await parseFull('1.5e-3')).toBe(0.0015);
  });

  test('negative base with exponent', async () => {
    expect(await parseFull('-0.5E+2')).toBe(-50);
  });
});

describe('lenient number parsing', () => {
  test('leading zeros: "01" coerces to 1', async () => {
    expect(await parseFull('01')).toBe(1);
  });

  test('trailing dot: "1." treated as 1', async () => {
    expect(await parseFull('1.')).toBe(1);
  });

  test('multiple dots: "1.2.3" consumes 1.2, leftover is ignored at top level', async () => {
    expect(await parseFull('1.2.3')).toBe(1.2);
  });
});

describe('invalid numbers', () => {
  test('bare minus with letter throws', async () => {
    const err = await parseExpectError('-x');
    expect(err.message).toMatch(/digit/i);
  });

  test('bare minus at EOF throws', async () => {
    const err = await parseExpectError('-');
    expect(err.message).toMatch(/end of json input/i);
  });
});

describe('magnitudes', () => {
  test('Number.MAX_SAFE_INTEGER', async () => {
    expect(await parseFull(String(Number.MAX_SAFE_INTEGER))).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  test('Number.MIN_SAFE_INTEGER', async () => {
    expect(await parseFull(String(Number.MIN_SAFE_INTEGER))).toBe(
      Number.MIN_SAFE_INTEGER,
    );
  });

  test('very small positive (1e-100)', async () => {
    expect(await parseFull('1e-100')).toBe(1e-100);
  });

  test('very large (1e100)', async () => {
    expect(await parseFull('1e100')).toBe(1e100);
  });

  test('negative zero parses to 0 (Number normalizes the sign)', async () => {
    expect(await parseFull('-0')).toBe(-0);
  });
});

describe('incomplete exponents (lenient)', () => {
  test('"1e" alone consumes everything and yields NaN', async () => {
    // The parser is lenient: it consumes "1e" then has nothing more, so
    // Number("1e") = NaN. This is intentional — we record the AI's
    // intent (a number) rather than throwing.
    expect(Number.isNaN(await parseFull('1e'))).toBe(true);
  });

  test('"1e+" alone yields NaN', async () => {
    expect(Number.isNaN(await parseFull('1e+'))).toBe(true);
  });
});

describe('numbers inside collections', () => {
  test('array of mixed numeric types', async () => {
    expect(await parseFull('[1,-2,3.14,1e2,-1.5e-3]')).toEqual([
      1, -2, 3.14, 100, -0.0015,
    ]);
  });

  test('object with numeric values', async () => {
    expect(await parseFull('{"temp":-15.5,"count":-3,"big":1e6}')).toEqual({
      temp: -15.5,
      count: -3,
      big: 1e6,
    });
  });
});
