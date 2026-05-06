# ADR 0002: Deploy on Cloudflare Pages and Pages Functions

## Status

Accepted

## Context

The project needs lightweight static hosting, a small server-side layer for admin auth and mutations, and a deployment model that remains inexpensive for a long-lived personal project.

## Decision

Deploy the frontend on Cloudflare Pages and implement server-side endpoints as Pages Functions.

## Consequences

- Static hosting and function routing stay simple.
- The app gains a secure place for secrets, auth checks, and storage/database mutations.
- The deployment model aligns naturally with R2 for audio storage.
- The project becomes tied to Cloudflare-specific runtime conventions and Pages bindings.
