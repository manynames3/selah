# ADR 0006: Small Static Modules and Durable Media Cleanup Receipts

## Status

Accepted, 2026-10-03. Frontend structure supersedes ADR 0001's inline-file detail.

## Context

Inline styles, handlers and application logic made verification harder and prevented a restrictive script policy. D1 mutations and R2 deletions cannot participate in one distributed transaction. A best-effort deletion can silently leak media after a database update succeeds.

## Decision

Retain native HTML/CSS/JavaScript, but separate page, skin, application logic and pure playback helpers. Build by copying an allowlist of public files to `dist`. Use native browser audio decoding for waveform analysis. Record cleanup receipts in D1 alongside entry changes, and track unattached uploads before writing to R2. Process receipts in bounded batches, preserving files still referenced by any entry.

## Consequences

- No framework or bundler; development tooling remains separate from production code.
- Scripts no longer require inline event handlers; security policy and browser tests can exercise the real page.
- Failed media deletion remains recoverable, but cleanup needs subsequent admin activity or an operator maintenance run.
- Waveform analysis needs CORS-enabled public media delivery and consumes browser memory; a clearly labeled progress-bar fallback remains available.
