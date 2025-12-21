const { Transform } = require('stream');
const { v4: uuidv4 } = require('uuid');

const PATTERNS = {
    EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    // Basic phone pattern: supports +1-555-555-5555, (555) 555-5555, 555 555 5555
    PHONE: /\b\+?(\d{1,4}?[-. ]?)?(\(?\d{3}\)?[-. ]?)?\d{3}[-. ]?\d{4}\b/g,
    // Basic credit card: 12 digit sequences (Amex) to 16/19 digits
    CREDIT_CARD: /\b(?:\d[ -]*?){13,19}\b/g
};

class RedactionSession {
    constructor() {
        this.tokenMap = new Map();
    }

    /**
     * returns a Transform stream that accepts strings/buffers,
     * identifies PII, replaces it with tokens, and stores the mapping.
     */
    redact() {
        const session = this;
        let buffer = ''; // Buffer for handling split PII across chunks

        return new Transform({
            objectMode: true,
            transform(chunk, encoding, callback) {
                let text = buffer + chunk.toString();

                // Strategy: to handle split chunks, we technically should hold back 
                // the end of the string if it looks like it *could* be the start of a PII.
                // For this MVP version, we will process the whole chunk. 
                // A production version would need sophisticated buffering.

                // Redact Email
                text = text.replace(PATTERNS.EMAIL, (match) => {
                    const token = `<EMAIL_${uuidv4()}>`;
                    session.tokenMap.set(token, match);
                    return token;
                });

                // Redact Credit Card
                text = text.replace(PATTERNS.CREDIT_CARD, (match) => {
                    // Simple luhn check could be added here for validity, 
                    // but for security "better safe than sorry" is often okay.
                    // To avoid false positives on simple numbers, let's strictly require length.
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
                buffer = ''; // Reset buffer (if we were using it for partials)
                callback();
            },
            flush(callback) {
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
    restore() {
        const session = this;
        return new Transform({
            objectMode: true,
            transform(chunk, encoding, callback) {
                let text = chunk.toString();
                // Token pattern: <TYPE_UUID>
                const tokenPattern = /<(EMAIL|CC|PHONE)_[0-9a-fA-F-]{36}>/g;

                text = text.replace(tokenPattern, (token) => {
                    if (session.tokenMap.has(token)) {
                        return session.tokenMap.get(token);
                    }
                    return token;
                });

                this.push(text);
                callback();
            }
        });
    }
}

module.exports = RedactionSession;
