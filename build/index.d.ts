//#region src/index.d.ts
type JSONValue = null | number | boolean | string | JSONValue[] | {
  [key: string]: JSONValue;
};
type JSONStreamValue = null | number | boolean | string | JSONArrayStream | JSONObjectStream;
type JSONStreamResult<T extends JSONStreamValue> = {
  data: T;
  wait: Promise<T>;
  done: boolean;
  error?: Error;
};
interface JSONObjectStream {
  [key: string]: JSONStreamResult<JSONStreamValue>;
}
type JSONArrayStream = Array<JSONStreamResult<JSONStreamValue>>;
declare class JsonParser<T extends JSONValue = JSONValue> {
  #private;
  constructor(input: AsyncIterable<string>, options?: {
    signal?: AbortSignal;
  });
  get root(): Promise<JSONStreamResult<JSONStreamValue>>;
  snapshot(): Promise<T>;
}
declare const streamJson: <T extends JSONValue = JSONValue>(input: AsyncIterable<string>, options?: {
  signal?: AbortSignal;
}) => JsonParser<T>;
//#endregion
export { JSONArrayStream, JSONObjectStream, JSONStreamResult, JSONStreamValue, JSONValue, JsonParser as default, streamJson };