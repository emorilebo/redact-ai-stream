import { Transform, TransformCallback } from 'stream';
import { v4 as uuidv4 } from 'uuid';

const PATTERNS = {
    EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    PHONE: /\b\+?(\d{1,4}?[-. ]?)?(\(?\d{3}\)?[-. ]?)?\d{3}[-. ]?\d{4}\b/g,
    CREDIT_CARD: /\b(?:\d[ -]*?){13,19}\b/g
};

class RedactionSession {
    public tokenMap: Map<string, string>;

    constructor() {
        this.tokenMap = new Map();
    }

    /**
     * returns a Transform stream that accepts strings/buffers,
     * identifies PII, replaces it with tokens, and stores the mapping.
     */
    redact(): Transform {
        const session = this;
        let buffer = '';

        return new Transform({
            objectMode: true,
            transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
                let text = buffer + chunk.toString();

                // Redact Email
                text = text.replace(PATTERNS.EMAIL, (match) => {
                    const token = `<EMAIL_${uuidv4()}>`;
                    session.tokenMap.set(token, match);
                    return token;
                });

                // Redact Credit Card
                text = text.replace(PATTERNS.CREDIT_CARD, (match) => {
                    if (match.replace(/\D/g, '').length < 13) return match;

                    const token = `<CC_${uuidv4()}>`;
                    session.tokenMap.set(token, match);
                    return token;
                });

                // Redact Phone
                text = text.replace(PATTERNS.PHONE, (match) => {
                    if (match.replace(/\D/g, '').length < 10) return match;

                    const token = `<PHONE_${uuidv4()}>`;
                    session.tokenMap.set(token, match);
                    return token;
                });

                this.push(text);
                buffer = '';
                callback();
            },
            flush(callback: TransformCallback) {
                if (buffer) {
                    this.push(buffer);
                }
                callback();
            }
        });
    }

    /**
     * returns a Transform stream that restores original PII from tokens.
     */
    restore(): Transform {
        const session = this;
        return new Transform({
            objectMode: true,
            transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
                let text = chunk.toString();
                const tokenPattern = /<(EMAIL|CC|PHONE)_[0-9a-fA-F-]{36}>/g;

                text = text.replace(tokenPattern, (token: string) => {
                    if (session.tokenMap.has(token)) {
                        return session.tokenMap.get(token)!;
                    }
                    return token;
                });

                this.push(text);
                callback();
            }
        });
    }
}

export = RedactionSession;
