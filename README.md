# redact-ai-stream

**Bi-directional PII Redaction for AI Streams**

`redact-ai-stream` is a lightweight Node.js library designed to secure your AI applications by automatically redacting Personally Identifiable Information (PII) from data streams *before* they reach public APIs (like OpenAI, Anthropic, etc.) and restoring the original data in the response stream.

## Features

*   **Stream-based Redaction**: Works directly with Node.js streams.
*   **Bi-directional**: Redact on the way out, restore on the way back.
*   **Session-based**: Keeps track of tokens per session to ensure correct restoration.
*   **Secure**: Original PII never leaves your server (it is stored in a temporary map).
*   **Simple API**: Just `.pipe()` it.

## Installation

```bash
npm install redact-ai-stream
```

## Usage

```javascript
const RedactionSession = require('redact-ai-stream');
const { Readable } = require('stream');

// 1. Create a session
const session = new RedactionSession();

// 2. Simulate user input stream (e.g., from a request)
const userInput = Readable.from(["My email is alice@example.com."]);

// 3. Redact the stream
const redactedStream = userInput.pipe(session.redact());

redactedStream.on('data', (chunk) => {
    console.log('Sending to AI:', chunk.toString());
    // Output: "Sending to AI: My email is <EMAIL_d41d...>"
});

// 4. Simulate AI response (which might use the token)
const aiResponse = Readable.from(["Sure, I will email <EMAIL_d41d...>."]);

// 5. Restore the stream for the user
const finalStream = aiResponse.pipe(session.restore());

finalStream.on('data', (chunk) => {
    console.log('Sending to User:', chunk.toString());
    // Output: "Sending to User: Sure, I will email alice@example.com."
});
```

## Supported Redactions

*   **Emails**: `user@example.com` -> `<EMAIL_UUID>`
*   **Credit Cards**: `1234 5678 1234 5678` -> `<CC_UUID>`
*   **Phone Numbers**: `123-456-7890` -> `<PHONE_UUID>`

## License

MIT
