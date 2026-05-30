# ADR 0003: Use Cloudflare-Native Data and Media Storage

## Status

Accepted

## Context

Devotional metadata is relational and query-oriented, while MP3 files and artwork are larger, bandwidth-heavy assets. The app should stay lightweight and avoid a separate database or object-storage vendor when the workload can fit within Cloudflare's edge-native products.

## Decision

Store devotional records in Cloudflare D1 and store MP3 plus artwork files in Cloudflare R2. Use separate R2 object prefixes (`audio/` and `art/`) rather than separate providers.

## Consequences

- The app stays fully on Cloudflare for hosting, serverless functions, metadata, and media.
- D1 keeps the relational archive model without requiring a managed Postgres dependency.
- R2 handles both public playback files and artwork through the same object-storage model.
- Existing legacy data still needs an explicit import if it lives outside Cloudflare.
