# ADR 0005: Single-Owner Public Journal with Moderated Listening Notes

## Status

Accepted, 2026-10-03.

## Context

The primary user is a Christian songwriter journaling new songs and sharing them with listeners. Multi-user accounts, subscriptions and private drafts would expand scope without improving that workflow. Guest feedback must be frictionless without becoming an unmoderated public comment section.

## Decision

Keep one songwriter per deployment. Publish songs immediately and retain the existing fields, plus optional public notes. Identify shared songs with stable UUID query links while retaining the full library. Accept short timestamped guest notes without accounts/email, but publish only after admin approval. Store moderation status in D1 and filter public queries server-side. Rate-limit guest submissions using short-lived keyed IP/window hashes.

## Consequences

- Sharing and listening require no account; moderation remains a protected owner action.
- This is not a private notebook: publishing copy and optional notes are explicitly public.
- The owner must review feedback; distributed spam may require stronger edge protection later.
- No billing or multi-tenant data isolation is implied or scaffolded.
