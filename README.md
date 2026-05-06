# SELAH

SELAH is a static-first devotional music web app for publishing and listening to daily songs with lyrics, scripture references, and album art. I built it as a single-page app in vanilla HTML, CSS, and JavaScript, with Cloudflare Pages/Functions handling deployment and secure admin actions, Supabase storing devotional metadata and artwork, and Cloudflare R2 serving MP3 files.

[Live Demo](https://selah-by8.pages.dev/)

## What I Built

- Designed and shipped the listening UI, vinyl-style player, waveform seeking, lyrics modal, and archive browsing experience in vanilla HTML, CSS, and JavaScript.
- Implemented secure admin publishing with Cloudflare Pages Functions, signed session cookies, and server-side create/update/delete flows instead of browser-side write credentials.
- Migrated the project to Cloudflare Pages + R2 while keeping Supabase for devotional metadata and artwork, then documented the architecture and decision tradeoffs in `docs/`.

## About

- Vinyl-inspired listening experience with waveform scrubbing, playback speed control, volume control, lyrics modal, and a progress-driven tonearm animation.
- Secure admin publishing flow backed by Cloudflare Pages Functions and signed session cookies instead of client-side credentials.
- Hybrid storage model that keeps relational metadata in Supabase and large audio files in Cloudflare R2.

## Screenshots

### Product UI

The recruiter-facing story starts with the product itself: a polished listening surface plus a lightweight publishing console for new songs.

#### Listen page

![SELAH listen page with vinyl player and archive](screenshots/listen-page-vinyl-player.png)

#### Admin upload page

![SELAH admin upload workflow](screenshots/admin-upload-song-page.png)

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Vanilla HTML, CSS, JavaScript |
| Client SDKs | `@supabase/supabase-js`, `jsmediatags` (CDN) |
| Hosting | Cloudflare Pages |
| Serverless runtime | Cloudflare Pages Functions |
| Audio storage | Cloudflare R2 |
| Metadata database | Supabase Postgres |
| Artwork storage | Supabase Storage |
| Config | `wrangler.jsonc` |

## Engineering Highlights

- Single-file frontend architecture: the UI, playback logic, archive rendering, and admin state live in one hand-editable `index.html` file for fast iteration without a framework build step.
- Secure write path: admin login, create, update, delete, audio upload, and artwork upload all run through server-side Functions using Cloudflare secrets and `HttpOnly` session cookies.
- Storage split by workload: Supabase handles relational devotional records and artwork, while Cloudflare R2 handles MP3 delivery and bandwidth-heavy media access.
- Playback UI tied to real audio state: the waveform, timing, play/pause state, and tonearm animation stay synchronized with the underlying `audio` element instead of decorative timers.
- Resilient archive loading: the public song list prefers a server-side proxy and falls back to direct Supabase reads to avoid brittle first-load behavior.

## Architecture

- [Architecture Overview](docs/architecture.md)
- [Architecture Decision Records](docs/adrs/README.md)

The deployed system is a static frontend on Cloudflare Pages with a thin Functions layer for admin auth and data mutations. Public readers fetch devotional metadata through a Pages Function or public Supabase reads, while audio is delivered from Cloudflare R2 and artwork is served from Supabase Storage.

### Deployment and Operations

These screenshots show the actual deployed runtime shape and the configuration surface behind the project.

#### Cloudflare Pages variables and R2 binding

Shows the production secrets/variables layer plus the `AUDIO_BUCKET` R2 binding used by Pages Functions.

![Cloudflare Pages variables and R2 binding](screenshots/cloudflare-pages-variables-and-r2-binding.png)

#### Cloudflare Pages deployment details

Shows the production deployment snapshot and the static artifact shape for the Pages deployment.

![Cloudflare Pages deployment details](screenshots/cloudflare-pages-production-deployment-details.png)

#### Supabase service role location

Used during server-side setup to wire protected write access without exposing elevated credentials in the browser.

![Supabase service role key location](screenshots/supabase-service-role-location.png)

#### Cloudflare R2 activation billing checkpoint

Captures the billing moment that forces explicit cost-awareness before object storage becomes part of the architecture.

![Cloudflare R2 activation billing checkpoint](screenshots/cloudflare-r2-activation-billing-checkpoint.png)

## Project Structure

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml
├── docs/
│   ├── architecture.md
│   └── adrs/
│       ├── README.md
│       ├── 0001-single-file-frontend.md
│       ├── 0002-cloudflare-pages-runtime.md
│       ├── 0003-split-media-and-metadata-storage.md
│       └── 0004-server-side-admin-writes.md
├── functions/
│   └── api/
│       ├── _auth.js
│       ├── _media.js
│       ├── _supabase.js
│       ├── admin-entry-create.js
│       ├── admin-entry-delete.js
│       ├── admin-entry-update.js
│       ├── admin-login.js
│       ├── admin-logout.js
│       ├── admin-session.js
│       ├── delete-audio.js
│       ├── devotionals.js
│       ├── upload-art.js
│       └── upload-audio.js
├── screenshots/
├── index.html
├── README.md
└── wrangler.jsonc
```

## Setup

### 1. Configure Supabase

Create a Supabase project with:

- a `devotionals` table
- public read access for the archive
- a storage bucket for artwork: `devotional-art`
- an optional legacy/fallback audio bucket: `devotional-audio`

This app expects browser-side public reads and server-side writes.

### 2. Configure the frontend

Update the config block in `index.html`:

```js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON = 'YOUR_SUPABASE_ANON_KEY';
```

The admin password is intentionally not stored in the frontend bundle.

### 3. Configure Cloudflare R2

Create an R2 bucket for MP3s and bind it to Pages Functions as:

```text
AUDIO_BUCKET
```

Also configure a public delivery base URL for playback, either with the default R2 public URL or a custom domain.

### 4. Configure Cloudflare Pages variables

Set these in Cloudflare Pages:

```text
SUPABASE_URL
SUPABASE_ANON
SUPABASE_SERVICE_ROLE
ADMIN_PASSWORD
ADMIN_SESSION_SECRET
AUDIO_PUBLIC_BASE_URL
AUDIO_KEY_PREFIX
SUPABASE_ART_BUCKET
SUPABASE_AUDIO_BUCKET
SUPABASE_ART_KEY_PREFIX
```

## Deployment

### Cloudflare Pages

1. Push the repository to GitHub.
2. Create a Cloudflare Pages project.
3. Connect the repository.
4. Leave the build command blank.
5. Set the output directory to `.`.
6. Add the required secrets, variables, and the `AUDIO_BUCKET` binding.
7. Deploy.

### Runtime endpoints

Static frontend:

- `/`

Pages Functions:

- `/api/devotionals`
- `/api/admin-login`
- `/api/admin-logout`
- `/api/admin-session`
- `/api/admin-entry-create`
- `/api/admin-entry-update`
- `/api/admin-entry-delete`
- `/api/upload-audio`
- `/api/upload-art`
- `/api/delete-audio`

## Privacy & Security

- Admin writes use Cloudflare secrets and `HttpOnly` session cookies.
- The browser only uses the Supabase anon key for public reads.
- Elevated Supabase access stays inside the Functions layer through the service role key.
- Audio and artwork deletions are handled server-side to avoid exposing storage credentials.

## Limitations

- The frontend remains intentionally monolithic; that keeps iteration fast but increases the size of `index.html`.
- Public Supabase config still lives in the client for read-only access.
- There is no framework build step, which keeps the repo lightweight but also means stronger structure depends on discipline rather than tooling.
- There are no automated end-to-end browser tests yet; current checks focus on syntax and repository hygiene.

## Validation

Current repo-level checks used for this project:

- inline script parse check for `index.html`
- `node --check` on Pages Function files
- `git diff --check`
- GitHub Actions CI mirrors those validation steps on push and pull request

## License

Personal project / portfolio-style usage unless changed later.
