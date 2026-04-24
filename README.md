# SELAH

Daily devotional songwriting site: one song, one scripture, one archive.

The app is intentionally simple:
- one main frontend file: `index.html`
- one Netlify serverless function for archive reads: `netlify/functions/devotionals.js`
- Netlify config for cache behavior: `netlify.toml`

The current UI uses a vinyl-player metaphor with a turntable, animated tonearm, waveform scrubbing, lyrics modal, archive list, and password-gated admin upload flow.

## Tech Stack

| Layer | Tooling |
| --- | --- |
| Frontend | Vanilla HTML, CSS, JavaScript |
| Client data/auth/storage access | `@supabase/supabase-js` via CDN |
| MP3 artwork extraction | `jsmediatags` via CDN |
| Data store | Supabase Postgres |
| File storage | Supabase Storage |
| Hosting | Netlify |
| Serverless proxy | Netlify Functions |
| Typography | Google Fonts (`Libre Baskerville`, `Bebas Neue`, `Nunito`) |

## Project Structure

```text
.
├── index.html
├── README.md
├── netlify.toml
└── netlify/
    └── functions/
        └── devotionals.js
```

## How It Works

### Frontend

`index.html` contains:
- all page markup
- all styling
- all playback logic
- Supabase reads/writes for uploads, deletes, and storage URLs
- waveform generation and seeking
- tonearm animation and playback-state sync

This repo deliberately avoids a framework or build step. That keeps deployment friction low and makes Netlify deploys straightforward.

### Data Model

The app reads from a single `devotionals` table:

```sql
create table devotionals (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  scripture   text,
  entry_date  date not null,
  lyrics      text,
  audio_url   text,
  art_url     text,
  created_at  timestamptz default now()
);
```

Recommended policies used by this project:

```sql
alter table devotionals enable row level security;

create policy "Public read" on devotionals
for select using (true);

create policy "Anon insert" on devotionals
for insert with check (true);

create policy "Anon delete" on devotionals
for delete using (true);
```

Storage buckets:
- `devotional-audio`
- `devotional-art`

### Archive Loading

The archive now prefers a production-safe path:

1. Netlify function `/.netlify/functions/devotionals`
2. direct Supabase REST read
3. direct Supabase client query

That fallback chain exists because browser-only first-load archive loading was intermittently hanging in the deployed flow. The Netlify function removes that dependency on a fragile browser-to-Supabase path.

## Setup

### 1. Configure Supabase

Create a Supabase project and set up:
- the `devotionals` table
- the public read / anon insert / anon delete policies
- two public storage buckets:
  - `devotional-audio`
  - `devotional-art`

### 2. Configure the app

Open `index.html` and update the config block:

```js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON = 'YOUR_SUPABASE_ANON_KEY';
const ADMIN_PASSWORD = 'your-password';
```

If needed, also update the Netlify function copy in:

```text
netlify/functions/devotionals.js
```

That file currently proxies Supabase archive reads on the server side.

### 3. Deploy

#### Netlify from GitHub

1. Push the repo to GitHub
2. Create a Netlify site from that repository
3. Netlify will deploy `index.html` as the main site
4. Netlify will also expose `/.netlify/functions/devotionals`

#### Manual note

If you open `index.html` directly with `file://`, the Netlify function path does not exist. The page can still render locally, but the production archive-loading path is meant for the deployed Netlify site.

## Thought Process

The project follows a few practical constraints:

### 1. Keep the app editable in one place

The main UX and business logic live in one file so changes can be made quickly without a bundler, framework conventions, or build tooling overhead.

### 2. Use animation where it reinforces playback state

The turntable UI is decorative, but the important motion is functional:
- the disc spinning means playback is active
- the waveform shows progress and allows seeking
- the tonearm position reflects song progress

That means animation is tied to actual audio state instead of just CSS loops.

### 3. Preserve a static-site deployment model

Even after the archive-loading bug, the solution stayed within the existing hosting model by adding a small Netlify function instead of moving the whole app to a framework or custom backend.

## Troubleshooting Notes

### Archive stuck on "Loading songs..."

This was one of the main debugging issues.

Root causes and fixes:
- browser-side archive loading was unreliable on initial load in the deployed flow
- a visualizer init crash could prevent later setup code from running
- direct client and REST reads needed a more resilient fallback chain

What changed:
- added `netlify/functions/devotionals.js` as a same-origin archive proxy
- made archive loading use function -> REST -> client fallback
- guarded the visualizer canvas access so a missing/unsupported context does not break the rest of app initialization

### Tonearm moving the wrong direction

The original tonearm motion rotated away from the record instead of onto it. That was corrected first, then replaced with a progress-driven tonearm model.

### Tonearm realism

The player now uses:
- a longer tonearm
- progress-based inward tracking across the song duration
- pause/resume behavior driven by actual audio state
- reset behavior on track change and restart

Current sweep:
- start angle: `9deg`
- end angle: `36deg`

Interpolation is linear from `audio.currentTime / audio.duration`.

### Waveform scrubbing

Waveform seeking was tightened so the scrubber uses the rendered waveform bounds and updates progress immediately after a seek, rather than waiting for the next audio time event.

## Recent Updates Made

Recent work on this repo included:

- fixed first-load archive rendering so songs appear without visiting the admin screen
- added a Netlify function proxy for archive reads
- fixed the tonearm moving in the wrong direction
- replaced fixed tonearm states with progress-based inward tracking
- narrowed tonearm sweep to a more realistic `9deg -> 36deg`
- lengthened the tonearm so the stylus reaches further across the record
- fixed waveform scrubbing behavior
- added volume control with mute/unmute and live percentage readout
- improved header and archive UI hierarchy
- changed the brand lockup text to `SELAH`
- removed the top-right tagline from the header
- removed the `WAVEFORM SEEK` label while keeping the helper text
- changed the left transport control to `-15 REWIND`
- tightened spacing between song date, title, and key/scripture in both the hero player and archive list

## Current UX Features

- vinyl-style player with animated disc
- progress-driven tonearm tracking
- waveform seek
- auto-advance to next song
- playback speed controls
- loop toggle
- lyrics modal
- volume slider + mute toggle
- archive summary and selected-song context
- admin gate for upload flow
- delete controls visible only in admin mode

## Operational Notes

- `netlify.toml` disables aggressive HTML caching so archive and UI updates show up faster after deploy
- the admin password is stored client-side in `index.html`, which is acceptable only for a lightweight personal project, not for a hardened production admin system
- the Netlify function currently contains Supabase values inline; if this grows beyond a personal project, move those to Netlify environment variables

## If You Want To Extend It

Practical next steps:
- move Supabase credentials for the function into Netlify environment variables
- replace client-side admin password gating with a real auth flow
- split `index.html` into smaller modules once change velocity makes single-file editing too costly
- add tests around archive loading and playback-state sync if the project grows

## License

Personal project / portfolio-style usage unless you choose otherwise.
