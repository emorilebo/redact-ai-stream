import { Transform } from 'stream';
declare class RedactionSession {
    tokenMap: Map<string, string>;
    constructor();
    /**
     * returns a Transform stream that accepts strings/buffers,
     * identifies PII, replaces it with tokens, and stores the mapping.
     */
    redact(): Transform;
    /**
     * returns a Transform stream that restores original PII from tokens.
     */
    restore(): Transform;
}
export = RedactionSession;
