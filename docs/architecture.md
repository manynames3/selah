# Architecture Overview

SELAH is a static-first music application deployed on Cloudflare Pages. The runtime is intentionally small: a single HTML/CSS/JavaScript frontend, a thin Cloudflare Functions layer for auth and mutations, Cloudflare D1 for devotional records, and Cloudflare R2 for MP3 and artwork storage.

## C4-Style Container Diagram

```mermaid
flowchart TB
    user["User / Admin Browser"]

    subgraph cloudflare["Cloudflare"]
        pages["Cloudflare Pages\nStatic frontend (`index.html`)"]
        funcs["Pages Functions\nAuth, archive proxy, create/update/delete, uploads"]
        db["Cloudflare D1\n`devotionals` metadata"]
        r2["Cloudflare R2\nMP3 and artwork object storage"]
    end

    user --> pages
    user --> r2
    pages --> funcs
    funcs --> db
    funcs --> r2
```

## Runtime Flow

### Public listening flow

1. The browser loads the static app from Cloudflare Pages.
2. The archive is requested through `/api/devotionals`.
3. Metadata returned from D1 populates the archive, current track, lyrics, and playback state.
4. MP3 playback uses the public R2 URL stored on each devotional row.
5. Artwork uses the public R2 URL stored on each devotional row.

### Admin publishing flow

1. The admin logs in through `/api/admin-login`.
2. A Pages Function validates the password against Cloudflare secrets and sets an `HttpOnly` session cookie.
3. Audio uploads are posted to `/api/upload-audio` and written to R2.
4. Extracted artwork uploads are posted to `/api/upload-art` and written to R2.
5. Final devotional metadata is created or updated through `/api/admin-entry-create` or `/api/admin-entry-update`.
6. Delete operations call `/api/admin-entry-delete`, which removes the devotional row and cleans up referenced media.

## Deployment Shape

- Static asset: one `index.html` file served by Cloudflare Pages.
- Function layer: files under `functions/api/`, deployed as Pages Functions.
- Object storage: `AUDIO_BUCKET` R2 binding configured in `wrangler.jsonc`.
- Database: `DB` D1 binding configured in `wrangler.jsonc`.
- Public live URL: [https://selah-by8.pages.dev](https://selah-by8.pages.dev)

## Key Constraints

- The app stays framework-free and build-free on purpose.
- Public reads go through a same-origin Pages Function instead of direct browser database credentials.
- Audio and artwork share an R2 bucket with separate object prefixes to keep the free-tier-friendly footprint small.
- The frontend is still monolithic, which is efficient for a small app but raises future maintenance pressure if features keep expanding.

## Notable Implementation Choices

- Archive reads and admin writes are server-side only; the browser never receives database or object storage credentials.
- Tonearm animation and waveform progress are driven from real audio state instead of independent timers.
