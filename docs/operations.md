# Operations and Recovery

## Release Checklist

1. Run `npm ci`, `npm run check`, `npm test`, `npm run build`, and the browser suite.
2. Export production D1 to a private, backed-up location: `npx wrangler d1 export DB --remote --output=/absolute/private/path/selah-backup.sql`. The export includes feedback awaiting approval; do not commit it or expose it as a static asset.
3. Back up R2 objects separately using an S3-compatible backup tool or the dashboard. D1 exports contain URLs, not audio bytes. A database backup alone cannot restore a deleted recording.
4. Apply D1 migrations before deploying the new Functions: `npx wrangler d1 migrations apply DB --remote`.
5. Confirm the two admin secrets and D1/R2 bindings. Keep preview and production resources separate. This project uses Pages Direct Upload, not automatic deployment from GitHub.
6. Push the validated commit to GitHub, build with `npm run build`, and release with `npx wrangler pages deploy dist --project-name selah --branch main`. Smoke-test anonymous library access, a direct song link, playback, login, upload/edit, feedback submission/approval, and logout. Use a dedicated staging journal for destructive checks rather than production songs. For a separate Git-integrated deployment, use build command `npm run build`, output directory `dist`, and Node 22+.

## Smoke Checks

`GET /api/devotionals` must return a JSON array and HTTP 200 without cookies. `GET /api/feedback?entryId=<song UUID>` must expose approved notes only. Anonymous `GET /api/admin-feedback` must return 401. Cross-origin mutation requests must return 403.

If the archive fails, check the `DB` binding, migrations and Functions logs. A `file://` preview cannot reach this API. A static-server HTML fallback may return 200 with HTML; the client treats this as a failure, not an empty archive.

If login reports configuration missing, ensure `ADMIN_PASSWORD` exists and `ADMIN_SESSION_SECRET` contains at least 32 random characters. The signing secret must be independent of the password. Secrets never belong in client code or committed `.dev.vars` files.

## Media Cleanup

- Uploads enter `media_cleanup` before R2 writes. Unattached URLs become eligible after 24 hours, allowing a failed publishing form to retry using the same file.
- Replacing/deleting an entry enqueues old URLs in the same D1 batch as the entry mutation. Feedback is removed with deleted songs.
- Eligible media is processed in batches of 20 after successful authenticated POSTs. References from other entries protect shared files. R2 failures increment attempts and defer the receipt for one minute.
- For an idle site, log in and call same-origin `POST /api/admin-maintenance` with `{}` from an authorized operator/browser. Repeat until eligible receipts are drained. The endpoint returns removed/failed counts; it does not claim that future-dated uploads were processed.
- Inspect receipts using `npx wrangler d1 execute DB --remote --command="SELECT due_at, attempts FROM media_cleanup ORDER BY due_at LIMIT 20"`. Do not delete receipts just to silence an error: fix the bucket/base-URL configuration and retry.

There is no scheduled Worker in this release. Add scheduled maintenance only if orphan accumulation is material. This keeps the deployment small while making the known idle-site limitation explicit.

## Recovery

For a bad deployment, roll back the Pages code snapshot. The notes/feedback migration is additive to the original song table; leave it in place during a code rollback. Rollback does not undo publishes or deletes.

For lost data, restore D1 and R2 from compatible backups in a separate staging environment first. Verify song IDs, media URLs, timestamps and feedback visibility, then plan a controlled production restore. Do not import an old export blindly into a live database.

Rotating `ADMIN_SESSION_SECRET` invalidates all signed sessions. Log out also clears the current browser cookie. Stateless copied session tokens remain valid until expiry or secret rotation; logout is not global token revocation.

## Local Preview

`npm run dev` creates an isolated D1/R2 runtime on `127.0.0.1:8788`. Its password is `local-preview-only`; configuration and state live inside ignored `.wrangler/`. It reads public production song metadata to seed the preview but never writes to remote D1 or R2.

The end-to-end test runner uses a separate port (8790) and test state. Never reuse production secrets or add `--remote` to local scripts. Local state is server-side emulation, not browser localStorage.
