import {describe, test, expect} from 'bun:test';
import {parseFull} from './helpers';

describe('unquoted object keys', () => {
  test('single unquoted key', async () => {
    expect(await parseFull('{name:"John"}')).toEqual({name: 'John'});
  });

  test('multiple unquoted keys', async () => {
    expect(await parseFull('{active:true,verified:false}')).toEqual({
      active: true,
      verified: false,
    });
  });

  test('mix of quoted and unquoted', async () => {
    expect(await parseFull('{"a":1,b:2}')).toEqual({a: 1, b: 2});
  });

  test('unquoted keys with underscores and digits', async () => {
    expect(await parseFull('{id_1:1,id_2:2}')).toEqual({id_1: 1, id_2: 2});
  });
});

describe('trailing commas', () => {
  test('trailing comma in object', async () => {
    expect(await parseFull('{"a":1,"b":2,}')).toEqual({a: 1, b: 2});
  });

  test('trailing comma in array', async () => {
    expect(await parseFull('[1,2,3,]')).toEqual([1, 2, 3]);
  });

  test('trailing comma in nested structures', async () => {
    expect(await parseFull('{"arr":[1,2,],"obj":{"x":1,},}')).toEqual({
      arr: [1, 2],
      obj: {x: 1},
    });
  });
});

describe('AI-like input that resembles spec violations', () => {
  test('object with unquoted keys, mixed content, and whitespace', async () => {
    const input = `{
title: "Introduction to Testing",
description: "Learn the core concepts",
duration
:15,
tags:["beginner","testing"]
}`;
    expect(await parseFull(input)).toEqual({
      title: 'Introduction to Testing',
      description: 'Learn the core concepts',
      duration: 15,
      tags: ['beginner', 'testing'],
    });
  });
});
