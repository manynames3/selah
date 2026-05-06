# ADR 0003: Split Metadata and Artwork from Audio Storage

## Status

Accepted

## Context

Devotional metadata is relational and query-oriented, while MP3 files are larger, bandwidth-heavy assets. Artwork is already integrated with Supabase Storage, but audio delivery has different cost and usage characteristics.

## Decision

Store devotional records in Supabase Postgres, keep artwork in Supabase Storage, and store MP3 files in Cloudflare R2.

## Consequences

- Each workload uses infrastructure that fits it better.
- Audio delivery benefits from R2’s storage and egress model.
- The app avoids moving the entire data model during hosting changes.
- The system now spans multiple services, which increases integration and cleanup logic.
