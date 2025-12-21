# redact-ai-stream

![NPM Version](https://img.shields.io/npm/v/redact-ai-stream)
![License](https://img.shields.io/npm/l/redact-ai-stream)
![Downloads](https://img.shields.io/npm/dm/redact-ai-stream)
![TypeScript](https://img.shields.io/badge/types-included-blue)

**Bi-directional PII Redaction for AI Streams**

`redact-ai-stream` is a lightweight, specialized Node.js library designed to secure your AI applications. It acts as a middleware layer, automatically redacting Personally Identifiable Information (PII) from data streams *before* they exit your secure boundary (e.g., to OpenAI, Anthropic), and transparently restoring that data in the incoming response stream.

## Why use this?
When building RAG requests or chat interfaces, you often need to send user context to an LLM. However, sending raw email addresses, phone numbers, or credit card details violates privacy compliance (GDPR, CCPA) and security best practices. `redact-ai-stream` solves this by tokenizing sensitive data on the fly.

## Features

*   **Stream-based Redaction**: Integrates natively with Node.js `Transform` streams.
*   **Bi-directional**: Redacts outgoing data, restores incoming data.
*   **Session-based Security**: Tokens are unique per session (`<EMAIL_UUID>`).
*   **Zero-Persistence**: Original PII is held in memory only for the duration of the stream; never stored on disk.
*   **TypeScript Support**: Written in TypeScript with full type definitions included.

## Installation

```bash
npm install redact-ai-stream
```

## Usage

### TypeScript / ES Modules

```typescript
import RedactionSession from 'redact-ai-stream';
import { Readable } from 'stream';

// 1. Create a session
const session = new RedactionSession();

// 2. Mock input stream (e.g., from an API request)
const userInput = Readable.from(["My email is alice@example.com."]);

// 3. Pipe through redaction
const redactedStream = userInput.pipe(session.redact());

redactedStream.on('data', (chunk) => {
    console.log('To LLM:', chunk.toString());
    // Output: "To LLM: My email is <EMAIL_1234-5678...>"
});

// ... Send to AI ...

// 4. Restore AI response
const aiResponse = Readable.from(["Sending confirmation to <EMAIL_1234-5678...>."]);
const finalStream = aiResponse.pipe(session.restore());

finalStream.on('data', (chunk) => {
    console.log('To User:', chunk.toString());
    // Output: "To User: Sending confirmation to alice@example.com."
});
```

### CommonJS

```javascript
const RedactionSession = require('redact-ai-stream');
// Usage is identical to above
```

## Supported Redactions

| Type | Pattern Example | Token Format |
| :--- | :--- | :--- |
| **Email** | `alice@example.com` | `<EMAIL_UUID>` |
| **Credit Card** | `4532 1234 5678 9012` | `<CC_UUID>` |
| **Phone** | `+1-555-0123` | `<PHONE_UUID>` |

## License

MIT © Godfrey Lebo

