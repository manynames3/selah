# ADR 0001: Keep the Frontend as a Single Static Page

## Status

Accepted

## Context

The application is small, UI-heavy, and iterated directly in the browser. Adding a framework and build pipeline would increase setup and deployment complexity without solving a scaling problem the project currently has.

## Decision

Keep the frontend in a single `index.html` file with inline CSS and JavaScript.

## Consequences

- Fast iteration and low operational overhead.
- Easy to deploy as a pure static asset on Cloudflare Pages.
- Playback logic, admin UI, and archive rendering stay easy to inspect in one place.
- File size and maintainability pressure will grow if the project expands substantially.
