import { Transform, TransformCallback } from 'stream';
import { v4 as uuidv4 } from 'uuid';

const PATTERNS = {
    EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    PHONE: /\b\+?(\d{1,4}?[-. ]?)?(\(?\d{3}\)?[-. ]?)?\d{3}[-. ]?\d{4}\b/g,
    CREDIT_CARD: /\b(?:\d[ -]*?){13,19}\b/g
};

// Maximum length any in-flight PII pattern could plausibly reach. Used as the
// hold-back window when chunks arrive mid-pattern so we never finalise a chunk
// while a PII match is still being assembled.
const MAX_PATTERN_LENGTH = 128;

class RedactionSession {
    public tokenMap: Map<string, string>;

    constructor() {
        this.tokenMap = new Map();
    }

    private redactBlock(text: string): string {
        // Park already-emitted tokens behind NUL sentinels while we run the
        // remaining PII patterns, then splice them back. NUL cannot appear in
        // normal text and breaks the \b / \d / \w boundaries our subsequent
        // phone / credit-card regexes rely on, so parked tokens are inert.
        const PARKED: string[] = [];
        const park = (token: string): string => {
            const i = PARKED.push(token) - 1;
            return `\x00${i}\x00`;
        };

        let out = text;

        out = out.replace(PATTERNS.EMAIL, (match) => {
            const token = `<EMAIL_${uuidv4()}>`;
            this.tokenMap.set(token, match);
            return park(token);
        });

        out = out.replace(PATTERNS.CREDIT_CARD, (match) => {
            if (match.replace(/\D/g, '').length < 13) return match;
            const token = `<CC_${uuidv4()}>`;
            this.tokenMap.set(token, match);
            return park(token);
        });

        out = out.replace(PATTERNS.PHONE, (match) => {
            if (match.replace(/\D/g, '').length < 10) return match;
            const token = `<PHONE_${uuidv4()}>`;
            this.tokenMap.set(token, match);
            return park(token);
        });

        return out.replace(/\x00(\d+)\x00/g, (_, idx) => PARKED[Number(idx)]);
    }

    /**
     * Returns a Transform stream that accepts strings/buffers, identifies PII,
     * replaces it with reversible tokens, and stores the original mapping.
     *
     * Chunk-boundary safety: a hold-back buffer of up to MAX_PATTERN_LENGTH
     * characters is retained between chunks so that a PII pattern split across
     * chunk boundaries (e.g. ["te", "st@example.com"]) is still detected.
     */
    redact(): Transform {
        const session = this;
        let buffer = '';

        return new Transform({
            objectMode: true,
            transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
                const text = buffer + chunk.toString();

                // Decide how much of `text` is safe to emit now: only the prefix
                // that cannot be extended by the next chunk into a PII match.
                // Hold the tail (up to MAX_PATTERN_LENGTH chars, snapped to the
                // last whitespace boundary when possible) in the buffer.
                let cut = text.length - MAX_PATTERN_LENGTH;
                if (cut < 0) cut = 0;

                if (cut > 0) {
                    const ws = text.lastIndexOf(' ', cut);
                    if (ws > 0) cut = ws + 1;
                }

                const head = text.slice(0, cut);
                const tail = text.slice(cut);

                if (head.length > 0) {
                    this.push(session.redactBlock(head));
                }

                buffer = tail;
                callback();
            },
            flush(callback: TransformCallback) {
                if (buffer.length > 0) {
                    this.push(session.redactBlock(buffer));
                    buffer = '';
                }
                callback();
            }
        });
    }

    /**
     * Returns a Transform stream that restores original PII from tokens.
     *
     * Tokens are fixed-shape (`<TYPE_<uuidv4>>`) so cross-chunk safety only
     * requires holding back the last ~64 characters between chunks.
     */
    restore(): Transform {
        const session = this;
        let buffer = '';
        const TOKEN_MAX = 64;
        const tokenPattern = /<(EMAIL|CC|PHONE)_[0-9a-fA-F-]{36}>/g;

        const sub = (s: string): string =>
            s.replace(tokenPattern, (token) => session.tokenMap.get(token) ?? token);

        return new Transform({
            objectMode: true,
            transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
                const text = buffer + chunk.toString();
                let cut = text.length - TOKEN_MAX;
                if (cut < 0) cut = 0;

                const head = text.slice(0, cut);
                const tail = text.slice(cut);

                if (head.length > 0) this.push(sub(head));
                buffer = tail;
                callback();
            },
            flush(callback: TransformCallback) {
                if (buffer.length > 0) {
                    this.push(sub(buffer));
                    buffer = '';
                }
                callback();
            }
        });
    }
}

export = RedactionSession;
