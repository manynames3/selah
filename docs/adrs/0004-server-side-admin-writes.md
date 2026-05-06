# ADR 0004: Route Admin Writes Through Server-Side Functions

## Status

Accepted

## Context

The original admin gate was client-side and unsuitable for protecting real create/delete operations. The application needs authenticated admin actions without exposing privileged Supabase access or storage credentials in the browser.

## Decision

Move admin login, create, update, delete, and upload operations behind Cloudflare Pages Functions that use Cloudflare secrets and a signed `HttpOnly` session cookie.

## Consequences

- The service role key and admin password stay off the client.
- Admin mutations become auditable, explicit server-side routes.
- The frontend keeps a simple fetch-based integration pattern.
- The app now depends on secret configuration and cookie-based session handling in the Pages runtime.
