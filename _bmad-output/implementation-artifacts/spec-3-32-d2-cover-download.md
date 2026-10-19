---
title: 'Story 3.32: [D2] Cover download'
type: 'feature'
created: '2026-10-19'
baseline_revision: 'f58cc824d40d1f89ef547e34c8f45b5b4b155052'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** A new shared Book is created without a cover. AD-14 requires the cover to be stored locally, so screens never load images from the sources. The bytes must be fetched before the save's transaction opens, the `media` row must be created inside it, and no partial or orphaned file may survive.

**Approach:** Add `lib/catalogue/covers.ts`.
- `downloadCover(ctx, isbn13)` runs before the transaction. It writes the source cover to the media directory under a temporary name and renames it into place.
- `ensureSharedBook(ctx, isbn13, cover?)` creates the `media` row inside the transaction and sets `books.cover`.
- A new `onRollback()` hook in `withTransaction` deletes the file when the save rolls back.
- `onInit` sweeps orphaned files.

## Boundaries & Constraints

**Always:**
- **`src/lib/catalogue/covers.ts` exports:**
  - `COVER_HOSTS = ['api.finna.fi', 'books.google.com']`.
  - `type CoverPolicy = { allows(url: URL): boolean; maxBytes: number; timeoutMs: number }`.
  - `coverPolicy`: `allows` is `protocol === 'https:'` and an exact hostname in `COVER_HOSTS`, with `maxBytes` 5 MiB and `timeoutMs` 5000.
  - `type DownloadedCover = { filename; mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; filesize; width; height }`.
  - `mediaDir(payload)`: the absolute path of the `media` collection's `upload.staticDir`.
  - `downloadCover`, `attachCover`, `discardCover` and `sweepOrphanMedia`, described below.
- **`downloadCover(ctx, isbn13, policy = coverPolicy): Promise<DownloadedCover | undefined>`:**
  - It throws a plain `Error` when `ctx.transactionID` is set (AD-14: never inside a transaction). Then it calls `assertLive(ctx)` and `normaliseIsbn`.
  - It returns `undefined` with no fetch in three cases: a shared Book with the ISBN exists (system find, same where as `ensureSharedBook`), `lookupSources` is not `found`, or `candidates[0].coverUrl` is absent.
  - Otherwise it fetches the URL:
    - Only when `policy.allows(url)` holds.
    - With `redirect: 'error'` and `AbortSignal.timeout(policy.timeoutMs)` covering the body.
    - It requires a 2xx status, and rejects a `Content-Length` above `maxBytes` and a streamed body that passes `maxBytes`.
  - The bytes must be JPEG, PNG or WebP by `sharp(bytes).metadata()`, which also gives `width` and `height`.
  - It writes `<mediaDir>/.<uuid>.tmp` with flag `wx`, then renames it to `<mediaDir>/<uuid>.<jpg|png|webp>`. It creates the directory if needed.
  - Every failure (policy, network, timeout, status, size, format, write, rename) returns `undefined` after one `payload.logger.warn` naming the ISBN, the URL's host and the reason. It also unlinks the temporary file if one exists (ENOENT ignored). It never throws for a download or write failure.
- **`attachCover(tx, cover): Promise<number>`** runs `assertLive(tx)`, then `payload.create` on `media` with system privileges (`req: tx.req, overrideAccess: true, depth: 0`) and `data: { filename, mimeType, filesize, width, height }`, with no file. It returns the id.
- **`discardCover(payload, cover)`** unlinks the file and ignores ENOENT.
- **`sweepOrphanMedia(payload, now = Date.now()): Promise<number>`:**
  - It unlinks each regular file in `mediaDir` whose `mtime` is more than one hour before `now` and whose name is no `media` row's `filename`. It reads all rows with system privileges.
  - It logs `payload.logger.info` with the count and returns the count. A missing directory counts 0.
  - It never throws: any error is logged with `payload.logger.error` and the sweep stops.
- **`src/lib/payload/transaction.ts` gains `onRollback(ctx, fn: () => Promise<void>)`:**
  - It throws when `ctx.transactionID` is undefined. Otherwise it registers `fn` for that transaction, keyed by `ctx.req`, so joined calls share it.
  - The opener's catch runs the callbacks in order after `killTransaction`, in a `finally` so a failing kill still runs them. Each callback is in its own try/catch that logs `req.payload.logger.error`, and the original error is rethrown unchanged.
  - Callbacks never run on commit.
- **`ensureSharedBook(ctx, isbn13, cover?: DownloadedCover)`:**
  - Inside the transaction, when `cover` is given, its first act is `onRollback(tx, () => discardCover(payload, cover))`.
  - When a shared Book already exists, it calls `discardCover` and returns the Book unchanged.
  - On create, it calls `attachCover(tx, cover)` and passes `cover: <id>` in the Book data.
  - Without `cover`, behaviour is exactly as in 3.31.
- **`src/collections/Media.ts`:**
  - `upload.staticDir: process.env.MEDIA_DIR || 'media'` and `upload.filesRequiredOnCreate: false`.
  - A `beforeOperation` guard on `create` throws Payload's `MissingFile` when there is neither `req.file` nor `args.data.filename`. Payload strips `filename` from non-system creates, so the admin must still upload a file.
- **`src/payload.config.ts`:** `onInit` runs `seedFirstUser(payload)` and then `sweepOrphanMedia(payload)`.
- **`vitest.setup.ts`:** `MEDIA_DIR` is `path.resolve('media-test')`, so the int lane's sweep never touches the dev `media` directory. `.gitignore` gets `/media-test`, and `.env.example` documents `MEDIA_DIR` (default `media`).
- **Imports:** `covers.ts` imports `Context` only as a type, because `payload.config` imports `covers.ts` and `context.ts` imports `payload.config`.

**Never:**
- No cover fetch inside a transaction, in a hook, or by the browser.
- No following of redirects, no `http`, no host outside the policy.
- No `media` row written by Payload's own file write: no `file`/`filePath` on the create.
- No cover preview route, `coverUrl()`, `setCover()`, `media` visibility (D28), undo of the media row (3.37) or `saveCopy` (3.35).
- No migration: no schema change.
- No test reaches the network.

## I/O & Edge-Case Matrix

The fixture server is a local `node:http` server on `127.0.0.1`. Tests pass `{ ...coverPolicy, allows: (u) => u.origin === origin, timeoutMs: 300 }`, plus a small `maxBytes` where needed. `lookupSources` is mocked.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create with cover | New ISBN, `coverUrl` = fixture JPEG. `downloadCover`, then `ensureSharedBook(ctx, isbn, cover)` | `cover.filename` matches `/^[0-9a-f-]{36}\.jpg$/` and exists in `mediaDir`, with no `.tmp` left. The Book's `cover` is a media row with that filename, `image/jpeg` and the fixture's width and height. | No error expected |
| No cover / known Book | No `coverUrl`, or a shared Book exists | `undefined`. The fixture server has 0 hits. | No error expected |
| Bad download | 404; HTML body; a body over `maxBytes`; no response before the timeout; 302; a URL the policy rejects | `undefined`, one warn logged, no new file in `mediaDir`. The rejected URL is never requested. | Logged, never thrown |
| Failed write | `fs.writeFile` spied to write part of the bytes, then reject with ENOSPC | `undefined`, no new file (neither `.tmp` nor final) | Logged |
| In a transaction | `withTransaction(ctx, tx => downloadCover(tx, isbn))` | Rejects, with no fetch | Plain `Error` |
| Rolled-back save | `withTransaction(ctx, async tx => { await ensureSharedBook(tx, isbn, cover); throw e })` | Rejects with `e`. The file is gone, and no media row or Book remains. | Rollback |
| Reuse with cover | A shared Book exists. `ensureSharedBook(ctx, isbn, cover)` | `created: false`. The file is gone and the Book is unchanged. | No error expected |
| Sweep | An orphan with mtime 2 h ago, a fresh orphan, and a 2 h old file with a media row | Returns 1. Only the old orphan is removed. | No error expected |
| Allowlist | `coverPolicy.allows` on the https Finna and Google URLs; `http://books.google.com/…`; `https://books.google.com.evil.test/…` | true, true, false, false | — |
| Admin create without file | Admin context through the gateway, `data: {}` | Rejects. No media row. | `MissingFile` |

</intent-contract>

## Code Map

- `src/lib/catalogue/ensureSharedBook.ts:25-95`: 3.31's function, extended here. Keep its find, the `system` options and the create. The cover is added to them.
- `src/lib/payload/transaction.ts:37-59`: `withTransaction`. `onRollback` goes beside it, and the opener's catch at `:54` runs the callbacks.
- `src/collections/Media.ts`: the upload collection. `randomFilename` acts only on `req.file`, so the system create with `data.filename` is untouched by it.
- `node_modules/payload/dist/collections/operations/create.js:31-50,75,135-147,266`: shows why the approach works.
  - `sanitizeUploadData` (which strips `filename`) runs only when `!overrideAccess`.
  - `beforeOperation` runs after it.
  - `generateFileData` throws `MissingFile` unless `filesRequiredOnCreate === false`; with no file, it returns the data unchanged and writes nothing.
- `src/lib/metadata/sources/finna.ts:206-212`, `google.ts:106-119`: cover URLs.
  - Finna: `https://api.finna.fi/Cover/Show?…`.
  - Google: `https://books.google.com/books/content?…&fife=w2000`.
  - Both were checked live on 2026-10-19: they answer 200 with `image/jpeg` and no redirect, and Finna sends no `Content-Length`.
- `src/lib/metadata/sources/shared.ts:66-89`: the precedents for fetching with a timeout and logging without the URL.
- `src/lib/metadata/lookup.ts:102`: `lookupSources`. `src/lib/metadata/source.ts`: `SourceResult.coverUrl?`.
- `src/payload.config.ts:49`: `onInit`. `src/lib/account/seedFirstUser.ts`: the existing onInit task.
- `tests/int/ensureSharedBook.int.spec.ts`: the `candidate()` builder and the `vi.mock('@/lib/metadata/lookup')` style to reuse.
- `tests/int/media.int.spec.ts:18,30`: uses `path.resolve('media')`; change it to `mediaDir(payload)`.
- `vitest.setup.ts`: runs before `payload.config` loads.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:104`: `3-32-d2-cover-download`.

## Tasks & Acceptance

**Execution:**
- `src/lib/payload/transaction.ts`: add `onRollback` and run the callbacks in the opener's catch.
- `src/collections/Media.ts`: set `staticDir`, `filesRequiredOnCreate: false` and the `MissingFile` guard.
- `src/lib/catalogue/covers.ts`: new, as described in Always.
- `src/lib/catalogue/ensureSharedBook.ts`: add the optional `cover` and update the doc comment (AD-14).
- `src/payload.config.ts`: `onInit` runs the seed, then the sweep.
- `vitest.setup.ts`, `.gitignore`, `.env.example`: `MEDIA_DIR` for tests.
- `tests/int/covers.int.spec.ts`: new. One test per matrix row except the admin row, using the fixture server, with the server closed and files removed in `afterAll`.
- `tests/int/media.int.spec.ts`: use `mediaDir(payload)`, and add the admin-create-without-file row.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: set the 3.32 status.

**Acceptance Criteria:**
- Given `npx eslint src tests`, `npx tsc --noEmit`, `npm run test:unit` and `npm run test:int`, when they run, then all pass with 0 lint errors.
- Given `covers.ts` and `ensureSharedBook.ts`, when inspected, then the only network call is in `downloadCover`, and the cover URL comes only from `lookupSources`' outcome.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 32 findings — high 2, medium 6, low 17, false 7, maybe-false 0
- findings:
  - `[false]` `[reject]` intent (a): the AC is phrased "when it is saved", but nothing in `src/` composes download, transaction and ensure. The save is story 3.35 (D4), and STORY-SLICING makes D2 a service slice. No defect: there is no save to wire yet.
  - `[low]` `[reject]` intent (b): no test feeds a failed download's `undefined` into a save. `ensureSharedBook` without a cover is 3.31's tested path, and the failed-download rows assert `undefined`. Unlikely to break; a test would only restate it.
  - `[medium]` `[patch]` intent (c): the `onInit` wiring of the sweep is untested. Grouped with the first verification-gap row.
  - `[low]` `[reject]` intent (d): the allowlist has two exact hosts. Google `imageLinks` are always `books.google.com` (fixtures), and Finna images are relative `/Cover/Show` paths joined to `api.finna.fi`. Both were checked live with no redirect. A different host would be refused and logged, and the Book saved without a cover, which is the safe failure.
  - `[low]` `[reject]` intent (e): the cover's outcome and the Book's outcome are two `lookupSources` reads. Grouped with the two-lookups rows below.
  - `[false]` `[reject]` intent (f): media visibility (D28), the preview route (D10) and `setCover` (D29) are absent. They are other slices by the epic itself.
  - `[medium]` `[patch]` verification-gap: removing `runs as onInit` left the `onInit` composition untested. Pre-verified. Patched: a test places an old orphan, calls `payload.config.onInit(payload)` and expects it gone.
  - `[medium]` `[patch]` verification-gap: nothing pins the int lane's media directory to `media-test`, and that is what keeps the sweep off the dev `media` directory. Pre-verified. Patched: an assertion that `mediaDir(payload)` is `path.resolve('media-test')`.
  - `[medium]` `[patch]` verification-gap: `onRollback`'s failure isolation (a callback that throws, the original error rethrown, no run on commit) is untested. Pre-verified. Patched in `transaction.int.spec.ts`.
  - `[low]` `[reject]` edge: the `requireFile` guard makes the admin's "Duplicate" on a media row fail with `MissingFile`. Verified real: `beforeOperation` sees no file. Duplicating a cover row is not a back-office task, and the fix adds a branch.
  - `[false]` `[reject]` edge: a non-system create with `{ filename, url }` (Payload's remote URL source) is now refused. AD-14 says only `lib/catalogue` downloads covers, so refusing a server-side fetch by URL is the intended outcome, not a defect.
  - `[low]` `[reject]` edge: a non-admin create without a file gets `MissingFile` (400) before `Forbidden`. Either way nothing is created, and no surface creates media as a user.
  - `[high]` `[patch]` edge: the sweep on an empty or wrong database deletes every media file older than an hour. Verified: there is no guard, and starting the app before a restore wipes the covers. Patched: when files exist and the `media` table has no rows, the sweep deletes nothing and warns.
  - `[medium]` `[patch]` edge: the sweep deletes files the app never wrote (`.DS_Store`, which Finder leaves, as already observed in this repo's worktrees). Patched: only `<uuid>.<jpg|png|webp>` and `.<uuid>.tmp` are considered.
  - `[low]` `[reject]` edge: an ENOENT between `readdir` and `stat`/`unlink` stops the sweep. That needs a concurrent discard during boot, and the next start sweeps again. The fix adds guards.
  - `[low]` `[reject]` edge: a non-ENOENT unlink error on the existing-Book path fails the save. A media directory the app cannot unlink in also fails the write that produced the file. Unlikely, and the fix adds handling.
  - `[false]` `[reject]` edge: the same cover passed twice in one transaction deletes a referenced file. No caller does this; 3.35 downloads one cover per save.
  - `[low]` `[reject]` edge: a throw before `onRollback` is registered orphans the file. `downloadCover` already normalised the same ISBN, so `INVALID_ISBN` cannot follow it, and an `initTransaction` failure is rare. The sweep removes the file.
  - `[low]` `[reject]` edge: the two `lookupSources` reads can differ, and the cover can come from another candidate. Verified real only for a degraded `found` outcome, which is never cached. The cover is still for the same ISBN. Fixing it changes both functions' public signatures, and the root cause is 3.31's deferred degraded-outcome item.
  - `[false]` `[reject]` edge: the exported `attachCover`/`discardCover` trust `cover.filename` as a path part. No caller builds a `DownloadedCover` from untrusted input; only `downloadCover` produces one, and the client never holds it.
  - `[false]` `[reject]` edge: a database error in `downloadCover`'s find throws instead of returning `undefined`. The contract covers download and write failures, not the database; a database error fails the save loudly, which is correct.
  - `[low]` `[reject]` edge (deletion): the removed `runs as onInit` test. Same root cause as the patched `onInit` row; the new `onInit` test covers the sweep. The seed's wiring has no direct test: it would need an empty users table in a shared test database.
  - `[low]` `[reject]` edge (claim): orphans from paths without a rollback stay until the next restart. This is AD-14's design (the sweep at `onInit`). In a single-user app they are rare and small.
  - `[low]` `[reject]` edge (claim): `ensureSharedBook` can still call the sources inside the transaction on a cache miss. This is 3.31's rejected row (the cover download warms the cache first). The AC concerns cover fetches.
  - `[high]` `[patch]` blind: the sweep has no safety and can delete the whole library (empty or wrong database, foreign files). Same root causes as the two patched sweep rows; patched with them.
  - `[low]` `[reject]` blind: one save asks the sources twice, and the cover can come from another outcome. Same as the edge two-lookups row; same disposition.
  - `[low]` `[reject]` blind: image dimensions are not checked, so a placeholder or an oversized header gets through. The adapters avoid Google's placeholder (`zoom=0`), and both hosts are trusted sources. Guards for an unseen case.
  - `[low]` `[patch]` blind: the failure log loses the cause of unexpected errors, so a redirect reads as "network error". Patched: `err` is logged for any error that is not a `CoverFailure`.
  - `[false]` `[reject]` blind: `DownloadedCover.filename` is trusted as a path part. Same refutation as the edge row: no untrusted producer.
  - `[low]` `[reject]` blind: `payload.config` loads the metadata module tree, and an import cycle is held off by a comment. A later value import of `context.ts` would fail at boot, loudly, in every test file. No silent harm.
  - `[medium]` `[patch]` blind: `onRollback`'s failure behaviour is untested. Same root cause as the verification-gap row; patched there.
  - `[low]` `[reject]` blind: the download adds up to 5 s to a save. AD-14 requires the bytes before the transaction, and 5 s plus a 4 s lookup on a miss stays within the 20 s target.

## Design Notes

**Why we write the file and Payload only records it.** Payload's upload write is a plain `fs.writeFile` to the final path, inside the create. That would put the write inside the transaction and leave partial files on a full disk. A system create with `data.filename` and no file stores the row and writes nothing (see the Code Map). The guard keeps "a create needs a file" for everyone else.

**Why `onRollback`.** The save (3.35) opens the transaction, and `ensureSharedBook` only joins it. A later failure, in `createCopy` for example, rolls back a media row this function created. Only the opener knows about it, so cleanup has to hang off the opener. A crash between the rename and the commit leaves an orphan, and the hourly-age sweep in `onInit` removes it.

**3.35 composes it as:**
```ts
const cover = await downloadCover(ctx, isbn13)
return withTransaction(ctx, async (tx) => {
  const book = await ensureSharedBook(tx, isbn13, cover)
  // createCopy(tx, …)
})
```

## Verification

**Commands:**
- `npx eslint src tests`: expected 0 errors.
- `npx tsc --noEmit`: expected clean.
- `npm run test:unit`: expected all pass.
- `npm run test:int`: expected all pass, `covers` and `media` included. Uses main's Postgres on `localhost:5432` through `.env`.

## Auto Run Result

**Summary.** New shared Books now get a locally stored cover (AD-14).
- **`downloadCover(ctx, isbn13)`** runs before the save's transaction and refuses to run inside one.
  - It returns nothing, with no request, when a shared Book with the ISBN exists or the best candidate has no cover URL.
  - Otherwise it fetches the URL. The fetch is https only, from `api.finna.fi` or `books.google.com`, follows no redirects, and has a 5 MiB limit and a 5 s timeout.
  - `sharp` must read the bytes as JPEG, PNG or WebP. The file is written as `.<uuid>.tmp` and renamed to `<uuid>.<ext>`.
  - Any failure logs one warning and returns `undefined`, so the Book is saved without a cover.
- **`ensureSharedBook(ctx, isbn13, cover?)`:**
  - It creates the `media` row inside the transaction (a system create that records the file Payload did not write) and sets `books.cover`.
  - It registers `onRollback` to delete the file, and it deletes the file at once when the shared Book already exists.
- **`withTransaction`** gains `onRollback(ctx, fn)`. The callbacks run after a rollback, each one isolated, and the original error is rethrown.
- **`onInit`** runs the seed, then `sweepOrphanMedia`. The sweep removes app-named files (`<uuid>.<ext>`, `.<uuid>.tmp`) that are older than an hour and have no `media` row, and it logs the count. It deletes nothing when files exist but the `media` table is empty.
- **The int lane** writes media to `media-test` (`MEDIA_DIR`), so its sweep never touches the dev `media` directory.

**Files changed.**
- `src/lib/catalogue/covers.ts`: new. The allowlist and policy, the download, the media row, the discard, the sweep and `mediaDir`.
- `src/lib/catalogue/ensureSharedBook.ts`: the optional `cover`, its rollback cleanup, and the discard on reuse.
- `src/lib/payload/transaction.ts`: `onRollback`, with the callbacks run by the opener.
- `src/collections/Media.ts`: `staticDir` from `MEDIA_DIR`, `filesRequiredOnCreate: false`, and the `requireFile` guard.
- `src/payload.config.ts`: `onInit` runs the seed, then the sweep.
- `vitest.setup.ts`, `.gitignore`, `.env.example`: `MEDIA_DIR` / `media-test`.
- `tests/int/covers.int.spec.ts`: new. 19 tests against a local fixture server.
- `tests/int/media.int.spec.ts`: `mediaDir(payload)`, plus the admin create without a file.
- `tests/int/transaction.int.spec.ts`: `onRollback` isolation, and no callback on commit.
- `tests/int/seedFirstUser.int.spec.ts`: dropped the `onInit === seedFirstUser` identity test.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 3.32 is done.

**Review.** 32 findings: high 2, medium 6, low 17, false 7.

Patched 6 entries (high 1, medium 4, low 1):
- **Sweep on an empty table:** the sweep deletes nothing (high).
- **Foreign files:** the sweep only touches app-written names.
- **`onInit` wiring:** a test runs `onInit` and the sweep removes an orphan.
- **Media directory:** a test pins the int lane's directory to `media-test`.
- **`onRollback`:** a test for failure isolation and for no run on commit.
- **Failure log:** the cause (`err`) is logged for errors that are not `CoverFailure`.

Deferred: none.

Rejected, with reasons (see the triage log):
- **The save-level AC:** 3.35 wires the save, since D2 is a service slice.
- **Two `lookupSources` reads:** this needs a degraded, uncached outcome, and it is the root of 3.31's deferred item. The fix changes both public signatures.
- **Admin Duplicate on media now fails:** rare in the back office, and the fix adds a branch.
- **Remote-URL create refused:** intended under AD-14.
- **`MissingFile` before `Forbidden`:** no write happens either way.
- **ENOENT race in the sweep, and a non-ENOENT unlink on reuse:** unlikely, and the fixes add guards.
- **Orphan before `onRollback` is registered, and orphans until restart:** the sweep handles both by design.
- **A same cover passed twice, and an untrusted `filename`:** false, since no caller does this.
- **A database error in `downloadCover` propagates:** correct behaviour.
- **No dimension checks:** trusted hosts, and the adapters avoid the placeholder.
- **Config import tree and cycle comment:** would fail loudly at boot.
- **5 s added to a save:** within AD-14 and the 20 s target.
- **Allowlist hosts:** both verified against the fixtures and live.
- **Sources called inside the transaction:** 3.31's row.
- **Out-of-slice AD-14 parts:** other stories.

**Follow-up review:** recommended, because a high entry was patched. The unverified risk is the new sweep guards:
- The empty-table branch is exercised only through a mocked `payload.find`, never against a really empty database.
- The app-name pattern must keep matching every name Payload's `randomFilename` produces. A future upload extension outside `jpe?g|png|webp` would never be swept, which is safe but would leak.

**Verification** (main checkout, Postgres `localhost:5432`, after the patches):
- `npx eslint src tests`: 0 errors (36 pre-existing warnings in the generated migrations).
- `npx tsc --noEmit`: clean.
- `npm run test:unit`: 30 files, 521 passed.
- `npm run test:int`: 33 files passed, 1 skipped (`migrationSchema`, push on). 274 tests passed: covers 19/19, media 10/10, transaction 10/10.
- `media/` and `media-test/` are empty after the run.
- Matrix audit: every row has a passing test.
- Playwright not run (service story).

**Residual risks.**
- **Nothing calls this yet:** no production path calls `downloadCover` until 3.35 composes `downloadCover`, then `withTransaction`, then `ensureSharedBook(tx, isbn, cover)`.
- **Degraded outcome:** a `found` outcome while a source failed is not cached. The save then calls the sources twice, and the cover may come from a different candidate of the same ISBN (3.31's deferred item).
- **Seed wiring:** nothing directly asserts that the seed runs inside `onInit` any more.
- **Admin "Duplicate" on a media row:** fails with `MissingFile`.
- **Parallel worktrees:** 3.33 and 3.34 were in progress beside this run. Expect the usual `sprint-status.yaml` conflict on adjacent lines.
