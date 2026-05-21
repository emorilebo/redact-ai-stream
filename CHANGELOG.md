# Changelog

All notable changes to `redact-ai-stream` will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] — 2026-05-21

### Fixed
- **Critical (privacy):** PII split across chunk boundaries is now correctly
  redacted. The previous implementation evaluated each chunk independently,
  so input like `["te", "st@example.com"]` would leak the email through the
  stream unchanged. The redactor now retains a hold-back buffer (up to 128
  characters, snapped to the last whitespace boundary) so a pattern
  straddling a chunk boundary is reassembled before regex evaluation.
- Redacted tokens (e.g. `<EMAIL_<uuid>>`) are no longer themselves matched
  by the phone / credit-card regexes during the same redaction pass. Tokens
  are parked behind NUL sentinels and spliced back after all PII regexes
  run, preventing nested token corruption.

### Added
- Four new regression tests covering chunk-split emails, single-character
  chunking, chunk-split credit cards, and a full round-trip restore over
  chunk-split PII.
- `LICENSE` file (MIT) shipped at repository root.
- `engines` field in `package.json` pinning the minimum Node version to 18.

### Notes
- Token format is unchanged (`<EMAIL_<uuid>>`, `<CC_<uuid>>`,
  `<PHONE_<uuid>>`) so downstream consumers that pattern-match these tokens
  are unaffected.
- The redaction map is still session-scoped and held only in memory.

## [1.2.0]

- Public release on npm.
