import Queue from 'superqueue';

type JSONStreamValue = null | number | boolean | string | JSONArrayStream | JSONObjectStream;
type JSONStreamResult<T extends JSONStreamValue> = {
    data: T;
    wait: Promise<T>;
};
interface JSONObjectStream {
    [key: string]: JSONStreamResult<JSONStreamValue>;
}
type JSONArrayStream = Array<JSONStreamResult<JSONStreamValue>>;
declare class JsonParser<T> {
    #private;
    constructor(queue: Queue<string>);
    parseValue(skip?: boolean): Promise<JSONStreamResult<JSONObjectStream> | JSONStreamResult<JSONArrayStream> | JSONStreamResult<string> | JSONStreamResult<boolean> | JSONStreamResult<null> | JSONStreamResult<number>>;
    parseObject(): JSONStreamResult<JSONObjectStream>;
    parseArray(): JSONStreamResult<JSONArrayStream>;
    parseNumber(): JSONStreamResult<number>;
    parseKey(): JSONStreamResult<string>;
    parseIdentifier(): JSONStreamResult<string>;
    parseString(): JSONStreamResult<string>;
    parseBoolean(expected: boolean): JSONStreamResult<boolean>;
    parseNull(): JSONStreamResult<null>;
    resolve(): Promise<T>;
}

export { type JSONStreamResult, JsonParser as default };
