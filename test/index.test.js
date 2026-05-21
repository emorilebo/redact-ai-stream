const { test } = require('node:test');
const assert = require('node:assert');
const { Readable } = require('stream');
const RedactionSession = require('..');

// Helper to convert stream to string
async function streamToString(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk.toString());
    }
    return chunks.join('');
}

test('RedactionSession redacts emails', async (t) => {
    const session = new RedactionSession();
    const input = "Hello, my email is john.doe@example.com and jane_doe+test@gmail.co.uk.";

    // Create source stream
    const source = Readable.from([input]);
    const redactor = session.redact();

    const redactedStream = source.pipe(redactor);
    const result = await streamToString(redactedStream);

    assert.doesNotMatch(result, /john\.doe@example\.com/);
    assert.doesNotMatch(result, /jane_doe\+test@gmail\.co\.uk/);
    assert.match(result, /Hello, my email is <EMAIL_[0-9a-f-]+> and <EMAIL_[0-9a-f-]+>\./);

    // Check map size
    assert.strictEqual(session.tokenMap.size, 2);
});

test('RedactionSession restores emails', async (t) => {
    const session = new RedactionSession();
    const input = "Contact me at bob@example.com please.";

    const source = Readable.from([input]);
    const redactor = session.redact();
    const restorer = session.restore();

    // Pipeline: source -> redactor -> restorer
    const pipeline = source.pipe(redactor).pipe(restorer);
    const result = await streamToString(pipeline);

    assert.strictEqual(result, input);
});

test('RedactionSession redacts credit cards', async (t) => {
    const session = new RedactionSession();
    const cc = "4532 1234 5678 9012";
    const input = `Payment info: ${cc}`;

    const source = Readable.from([input]);
    const redactor = session.redact();
    const result = await streamToString(source.pipe(redactor));

    assert.doesNotMatch(result, /4532 1234 5678 9012/);
    assert.match(result, /Payment info: <CC_[0-9a-f-]+>/);

    // Test restore
    const restoredSource = Readable.from([result]);
    const restorer = session.restore();
    const finalResult = await streamToString(restoredSource.pipe(restorer));
    assert.strictEqual(finalResult, input);
});

test('RedactionSession redacts phone numbers', async (t) => {
    const session = new RedactionSession();
    const phone = "555-0199";
    // Our simplistic regex might need full 10 digits or be specific.
    // Let's test standard 10 digit US number
    const phoneFull = "123-456-7890";
    const input = `Call ${phoneFull}`;

    const source = Readable.from([input]);
    const redactor = session.redact();
    const result = await streamToString(source.pipe(redactor));

    assert.doesNotMatch(result, /123-456-7890/);
    assert.match(result, /Call <PHONE_[0-9a-f-]+>/);
});

test('Multiple chunks handling (whitespace-aligned)', async (t) => {
    const session = new RedactionSession();
    const inputChunksSafe = ["My email is ", "test@example.com", " today."];
    const source = Readable.from(inputChunksSafe);

    const redactor = session.redact();
    const result = await streamToString(source.pipe(redactor));

    assert.doesNotMatch(result, /test@example\.com/);
    assert.match(result, /My email is <EMAIL_[0-9a-f-]+> today\./);
});

test('PII split mid-pattern across chunks is still redacted (regression)', async (t) => {
    // This is the bug fixed in v1.3.0: the previous impl never held back the
    // tail of a chunk, so "te" + "st@example.com" leaked because neither chunk
    // individually matched the email regex.
    const session = new RedactionSession();
    const chunks = ["My email is te", "st@example.com today."];
    const source = Readable.from(chunks);

    const redactor = session.redact();
    const result = await streamToString(source.pipe(redactor));

    assert.doesNotMatch(result, /test@example\.com/);
    assert.match(result, /My email is <EMAIL_[0-9a-f-]+> today\./);
});

test('PII split into single-character chunks is still redacted', async (t) => {
    const session = new RedactionSession();
    const full = "Email: a.b+c@example.co.uk done.";
    const chunks = Array.from(full); // 1 char per chunk
    const source = Readable.from(chunks);

    const redactor = session.redact();
    const result = await streamToString(source.pipe(redactor));

    assert.doesNotMatch(result, /a\.b\+c@example\.co\.uk/);
    assert.match(result, /Email: <EMAIL_[0-9a-f-]+> done\./);
});

test('Credit card split across chunks is still redacted', async (t) => {
    const session = new RedactionSession();
    const chunks = ["Card: 4532 1234 ", "5678 9012 end."];
    const source = Readable.from(chunks);

    const redactor = session.redact();
    const result = await streamToString(source.pipe(redactor));

    assert.doesNotMatch(result, /4532 1234 5678 9012/);
    assert.match(result, /Card: <CC_[0-9a-f-]+> end\./);
});

test('Round-trip restore works across chunk-split PII', async (t) => {
    const session = new RedactionSession();
    const original = "Hi alice@example.com please call 555-123-4567 today.";
    // split mid-email and mid-phone
    const chunks = ["Hi alic", "e@example.com please call 555-12", "3-4567 today."];

    const source = Readable.from(chunks);
    const redacted = await streamToString(source.pipe(session.redact()));

    // PII must be gone from the redacted stream
    assert.doesNotMatch(redacted, /alice@example\.com/);
    assert.doesNotMatch(redacted, /555-123-4567/);

    // Restoring must reconstruct the original
    const restored = await streamToString(
        Readable.from([redacted]).pipe(session.restore())
    );
    assert.strictEqual(restored, original);
});
