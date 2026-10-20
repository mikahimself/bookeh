---
title: 'Story 3.43: [D10] Cover component and cover preview'
type: 'feature'
created: '2026-10-20'
baseline_revision: '17d2e0c2f0caeb89905804355782fb0118fc3919'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The preview URL /data/cover/<isbn13> and its record do not tell editions apart, so picking another edition can leave the old cover (or a stuck placeholder) on the Answer, and a picker cannot show each candidate's cover.
    evidence: |-
      `recordCoverPreview` keeps one URL per user and ISBN (the picked candidate's), and `coverUrl({ isbn13 })` gives the same `src` for every pick, so React keeps the `<img>` and the browser does not refetch. `Cover` keeps the failed `src`, so a failed pick stays a placeholder. Two lookups of one ISBN with different picks overwrite each other (last write wins). No screen picks yet: 3.53 (C12) brings `?pick=<n>`, the picker rows with covers, and the save of the picked candidate (`downloadCover` still takes `candidates[0]`). The fix belongs there: a pick-specific preview URL (e.g. `coverUrl({ isbn13, pick })` and `/data/cover/<isbn13>/<n>` with every candidate's URL recorded), or keying `Cover` by pick.
    location: >-
      src/lib/catalogue/coverPreview.ts, src/lib/books/coverUrl.ts, src/app/(frontend)/components/Cover.tsx
    severity: medium
  - summary: >-
      The Cover placeholder (p-2 padding, 12px title) does not fit the row covers of 16 × 24, 32 × 48 and 44 × 66 px in DESIGN.md's collection density table.
    evidence: |-
      At 16px wide the padding leaves no room for text; at 32px `break-words` stacks letter fragments. No screen renders rows yet; E6 (Epic 4, collection rows) decides the small-size placeholder, e.g. an outline only below a container width, using `@container`.
    location: >-
      src/app/(frontend)/components/Cover.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** No screen can show a cover yet. Saved covers have a URL (`coverUrl({ filename })`), but nothing renders it. A Book that is not saved yet has `coverUrl({ isbn13 })` = `/data/cover/<isbn13>`, but no handler answers that path. AD-14 forbids the browser from loading a source's image itself. So the server must record the source cover URL during a lookup and stream it from there.

**Approach:**
- `lookupBook` records the picked candidate's cover URL in process, keyed by user and ISBN-13.
- A `lib/catalogue` service fetches the recorded URL through the cover download's own fetch and checks.
- An authenticated route handler at `/data/cover/[isbn13]` streams the result.
- A `Cover` client component renders a plain `img` for a cover URL, or the placeholder.

## Boundaries & Constraints

**Always:**
- **`src/lib/catalogue/coverPreview.ts` (new):**
  - Holds the record in `processState('catalogue.coverPreviews', () => new Map<string, { url: string; expiresAt: number }>())`. The key is `` `${ctx.user.id}:${isbn13}` ``.
  - The record is bounded the way `lib/metadata/lookup.ts` bounds its cache: insertion order is recency, and past `PREVIEW_SIZE = 500` entries the oldest is dropped. Each entry lives `PREVIEW_TTL_MS = 60 * 60 * 1000`.
  - **`recordCoverPreview(ctx, isbn13, url: string | undefined): void`** stores `url`. With `undefined` it deletes the entry.
  - **`fetchCoverPreview(ctx, isbn13, policy = coverPolicy): Promise<{ bytes: Buffer; mimeType: DownloadedCover['mimeType'] } | undefined>`**:
    - It returns `undefined` with no request when the user has no live entry for that ISBN. An expired entry is deleted.
    - Otherwise it fetches the URL with exactly the cover download's checks: `policy.allows`, https only, `redirect: 'error'`, the timeout covering the body, a 2xx status, `maxBytes` on both `Content-Length` and the streamed body, and JPEG, PNG or WebP by sharp.
    - Any failure is one `payload.logger.warn` naming the ISBN, the URL's host and the reason, and returns `undefined`. It never throws for a fetch failure.
- **`src/lib/catalogue/covers.ts`:**
  - The URL parse, policy check, `fetchBytes` and `imageOf` move into one exported function. `downloadCover` and `fetchCoverPreview` both call it.
  - `downloadCover`'s behaviour, log line and signature are unchanged. `tests/int/covers.int.spec.ts` passes without edits.
- **`src/lib/catalogue/lookupBook.ts`:** in the `found` case, call `recordCoverPreview(ctx, isbn13, best.coverUrl)`, where `best` is the picked candidate. No other result kind touches the record.
- **`src/app/(frontend)/data/cover/[isbn13]/route.ts` (new):** `GET` only. It reads nothing from the request but `params.isbn13`.
  - The first call is `requireUserOrThrow()`. `UNAUTHENTICATED` answers 401 with an empty body.
  - `fetchCoverPreview(ctx, isbn13)` returning `undefined` answers 404 with an empty body.
  - Success answers 200 with the bytes and these headers: `Content-Type` = the checked `mimeType`, `Content-Length`, `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
  - Any other error is logged with `logger().error` from `@/lib/errors` and answers 500 with an empty body. The handler uses the status alone, never `ActionResult` JSON (spine, Errors).
- **`src/app/(frontend)/components/Cover.tsx` (new, `'use client'`):**
  - Exports `Cover({ src, title }: { src: string | null; title: string })`. `src` is a `coverUrl()` result, which callers compute on the server.
  - It fills its parent's width at `aspect-2/3`, with square corners.
  - With a `src` it renders one plain `<img src={src} alt="">` with `object-cover`, so `@next/next/no-img-element` is disabled on that line with a comment citing AD-10.
  - With `src` null, or after that `src` fired `error`, it renders the placeholder: a 1px `border-text-dim` outline with `title` inside in `text-text-muted` at `text-label`, clipped to the box. It is `aria-hidden`, because the title is always shown beside a cover. A new `src` tries the image again.
- **Tests:**
  - The int tests serve the cover from a local `node:http` fixture server, as `covers.int.spec.ts` does, and mock `lookupSources`.
  - The route test drives `GET` with a signed-in cookie, mocking `next/headers` as `undoAction.int.spec.ts` does. It mocks `coverPolicy` in `@/lib/catalogue/covers` (keeping the rest of the module) to allow the fixture origin.

**Never:**
- The handler never takes a URL from the client. No query parameter or header is read as a URL.
- No cover request from the browser to a source, and no `next/image`.
- No change to the allowlist, size limit or timeout values, and no redirects followed.
- No bytes cached on the server or in the browser.
- No screen uses `Cover` yet: the Answer (3.45), the edition picker (3.53) and the collection (Epic 4) do.
- No record from `searchBooks`: it does not exist yet (I10).
- No migration, collection change or new message key.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Preview after lookup | `lookupBook` as A; the picked candidate's `coverUrl` is the fixture JPEG. Then `GET /data/cover/<isbn13>` as A | 200 with the JPEG bytes and the four required headers | No error expected |
| Not recorded | A signed-in user, an ISBN that was never looked up | 404 with no fetch | — |
| Other user | Recorded by A; `fetchCoverPreview` as B | `undefined` with no fetch | — |
| Pick without cover | Lookup with `pick: 0` (has a cover), then `pick: 1` (none) | `undefined` with no fetch | — |
| Expired | Recorded, then `Date.now` past `PREVIEW_TTL_MS` | `undefined` with no fetch | — |
| Bad source | A recorded URL that answers 404, HTML, a body over `maxBytes`, a 302, or that the policy rejects | `undefined`, one warn. The rejected URL is never requested. | Logged, never thrown |
| Signed out | `GET` with no session cookie | 401 | — |
| Cover rendering | `Cover` with `src` null; with a `src`; with a `src` that fires `error` | Placeholder showing the title, with no `img`; an `img` with that `src`; the placeholder | — |

</intent-contract>

## Code Map

- `src/lib/catalogue/covers.ts:14-96` (`COVER_HOSTS`, `coverPolicy`, `CoverFailure`, `reasonOf`, `fetchBytes`, `imageOf`) and `:113-190` (`downloadCover`): the fetch and checks to share. Keep `downloadCover`'s log shape: `{ isbn13, host, err? }` and `Cover download failed: <reason>`. The preview logs `Cover preview failed: <reason>`.
- `src/lib/catalogue/lookupBook.ts:93-144`: `lookupBook`. `best` (`:131`) is the picked candidate. Insert the record call there.
- `src/lib/metadata/lookup.ts:24-47`: the bounded cache pattern (`cached` and `remember`) to copy for the record.
- `src/lib/processState.ts`: the only home for in-process state. Keys are namespaced, e.g. `catalogue.lookupLimit`.
- `src/lib/catalogue/lookupLimit.ts`: a sibling `processState` user in `lib/catalogue`, for style.
- `src/lib/books/coverUrl.ts`: already produces `/data/cover/<isbn13>`. Its doc comment says the handler arrives in D10; update it to point at the handler.
- `src/lib/payload/context.ts:56-60`: `requireUserOrThrow()`, which throws `DomainError('UNAUTHENTICATED')`.
- `src/lib/errors.ts:43-49,90-94`: `logger()` and `runRoute` (JSON only, so not used here).
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md:82-121`: `params` is a Promise, and the `RouteContext<'/data/cover/[isbn13]'>` helper.
- `src/proxy.ts`: its matcher includes `/data/...`. It only sets the path header and never redirects.
- `eslint.config.mjs:21-34,72-86,296-320`: `lib/catalogue` may import `books`, `metadata` and `payload`. A client component imports only types from `src/lib`. `(frontend)` imports only `requireUser`/`requireUserOrThrow` and types from `lib/payload`, and `react/jsx-no-literals` applies there (the title is a variable, so it passes).
- `src/app/(frontend)/styles.css:19-70`: the tokens `text-dim`, `text-muted` and `text-label`. The radius is 0 by default.
- `tests/int/covers.int.spec.ts:1-120`: the fixture server, the sharp-generated JPEG, `found()` and the `lookupSources` mock to reuse.
- `tests/int/undoAction.int.spec.ts:1-40`: `next/headers` mocked, and a login cookie for a signed-in request.
- `tests/int/lookupBook.int.spec.ts`: the existing lookup tests, which must stay green.
- `tests/unit/signOutButton.unit.spec.ts:1-20`: the jsdom component test style (`@testing-library/react`, `createElement`).
- `_bmad-output/implementation-artifacts/sprint-status.yaml:115`: `3-43-d10-cover-component-and-cover-preview`.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/covers.ts`: extract and export the shared fetch-and-check, leaving `downloadCover` unchanged in behaviour. Both callers must use one policy-checked fetch.
- `src/lib/catalogue/coverPreview.ts`: new, as in Always. This is the server-held record and the preview fetch.
- `src/lib/catalogue/lookupBook.ts`: record the picked candidate's cover URL. The lookup is the only writer of the record.
- `src/lib/books/coverUrl.ts`: update the doc comment to reference the handler.
- `src/app/(frontend)/data/cover/[isbn13]/route.ts`: new, as in Always.
- `src/app/(frontend)/components/Cover.tsx`: new, as in Always.
- `tests/int/coverPreview.int.spec.ts`: new. One test per matrix row except the last; the route rows go through `GET`, the others through `fetchCoverPreview` after `lookupBook`. Close the server in `afterAll`.
- `tests/unit/cover.unit.spec.ts`: new, jsdom. The last matrix row, as one test of the fallback (null, then image, then `error` to the placeholder).
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: set the 3.43 status.

**Acceptance Criteria:**
- Given `npx eslint src tests`, `npx tsc --noEmit`, `npm run test:unit` and `npm run test:int`, when they run, then all pass with 0 lint errors, and `covers.int.spec.ts` and `lookupBook.int.spec.ts` are unchanged and green.
- Given the route handler and `coverPreview.ts`, when inspected, then the only URL fetched is one `lookupBook` recorded for the same user, and the only network call goes through the function `downloadCover` also uses.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 27 findings — high 0, medium 4, low 13, false 10, maybe-false 0
- findings:
  - `[medium]` `[defer]` blind: one preview URL serves every edition of an ISBN, so after a pick change the old cover stays (React keeps the `img` with the same `src`), and a failed `src` keeps the placeholder. Real once picking exists; no screen picks yet. Grouped with the next three rows (root cause: the record and URL carry no pick). Deferred to 3.53 (C12), which owns `?pick=` and its cover preview.
  - `[medium]` `[defer]` blind: the record cannot serve the edition picker's per-candidate covers. Same root cause; deferred with it.
  - `[false]` `[reject]` blind: preview and save use different candidates, "and nothing tracks that". `saveCopy` does not exist yet, and 3.53's AC already says the save sends `{ isbn13, pick }` and takes the server-held candidate.
  - `[low]` `[reject]` blind: no limit on the route's outbound fetches (repeat GET or HEAD, a broken URL re-fetched). Only the signed-in user's own recorded ISBNs can be fetched, each Answer render loads one image, and the app is single-user on the tailnet. A limit adds a branch and state for a case not met in everyday use.
  - `[low]` `[defer]` blind: the placeholder's padding and 12px title do not fit the 16–44px row covers in DESIGN.md. Verified against the density table. No row renders yet; deferred to E6 (Epic 4), which decides the small-size look.
  - `[false]` `[reject]` blind: no recency on read and a 1 h lifetime vs the cache's 24 h. The image is requested right after the Answer renders, and every render (including a reload or a render after a restart) runs `lookupBook`, which records again. An entry is never read an hour after its write in the real flow.
  - `[low]` `[patch]` blind: the `coverUrl.ts` comment says "streamed" while the handler buffers. Patched: it now says "served by the handler". The spine wording half is rejected (a planning-doc edit, and the Design Notes record why).
  - `[low]` `[patch]` blind: `new Uint8Array(cover.bytes)` copies up to 5 MiB per response. Patched: a view over the same memory.
  - `[low]` `[reject]` blind: the route does not normalise `isbn13`. Only `coverUrl()` produces the path, from a normalised ISBN (ISBN convention: callers normalise); any other string correctly answers 404.
  - `[low]` `[reject]` edge: unthrottled repeated or concurrent preview requests. Same as the blind fetch-limit row; same disposition.
  - `[medium]` `[defer]` edge: a re-lookup with another pick keeps the same preview `src`. Same root cause as the first row; deferred with it.
  - `[medium]` `[defer]` edge: an interleaved second lookup re-records before the first Answer's image loads (last write wins). Same root cause; deferred with it.
  - `[low]` `[reject]` edge: a non-normalised `isbn13` gets 404. Same as the blind normalising row.
  - `[low]` `[patch]` verification-gap: the ref check for an image that failed before hydration is never exercised (jsdom `complete` is false). Patched: a unit case stubs `complete`/`naturalWidth` and expects the placeholder; it fails with the ref removed.
  - `[low]` `[patch]` verification-gap: the `PREVIEW_SIZE` eviction has no test, unlike the lookup cache it copies; without it the record grows without bound (AD-12). Patched: an int test records `PREVIEW_SIZE + 1` entries and expects the oldest gone with no fetch and the newest served; it fails with the eviction broken.
  - `[false]` `[reject]` intent: covers are not wired into any screen. The story's ACs ask for the component and the route; the consumers are 3.45, 3.53 and Epic 4.
  - `[false]` `[reject]` intent: the handler does not use `runRoute()`. The spine's Errors row says the cover handler streams bytes and uses the status alone; `runRoute()` answers JSON.
  - `[low]` `[patch]` intent: "streams" vs buffers. Same as the blind comment row; patched there.
  - `[false]` `[reject]` intent: search does not record a preview. `searchBooks` (I10) does not exist yet.
  - `[false]` `[reject]` intent: the preview follows `pick`, the save `candidates[0]`. Same refutation as the blind save row.
  - `[false]` `[reject]` intent: the real allowlist and https rule are not exercised on the preview path. The preview calls the same `fetchCover()` as the download, whose real `coverPolicy` (allowlist and https) is tested in `covers.int.spec.ts`.
  - `[false]` `[reject]` intent: the timeout is not tested on the preview path. Same shared `fetchCover()`; the timeout row in `covers.int.spec.ts` covers it.
  - `[low]` `[reject]` intent: the 500 path has no test. Only a coverage ask, for a two-line catch.
  - `[low]` `[reject]` intent: the 404 holds only through the record. Same as the blind normalising row.
  - `[false]` `[reject]` intent: square corners are not asserted. The theme's radius is 0 everywhere (DESIGN.md); a test would restate CSS.
  - `[false]` `[reject]` intent: `lookupBook` gains a side effect against "read-only". Read-only means no rows are written (FR-11); the record is bounded in-process state, as the rate limit already is.
  - `[low]` `[patch]` intent: the hydration branch is untested. Same as the verification-gap ref row; patched there.

## Design Notes

**Why buffer, then send.** The spine says the handler "streams" the cover. Piping the source's body straight through would send bytes before the size and format checks finish, and our origin would carry whatever `Content-Type` the source sent. Reading at most 5 MiB, checking it with sharp, and sending it with our own type and `nosniff` keeps a hostile or broken source from serving HTML at our origin. Covers are well under the limit.

**Why per user, and the picked candidate.** The Answer is rendered for one user, and the image request carries that user's session. Keying by user means one user's lookups are never visible to another, not even as 200 vs 404. Recording `candidates[pick]` means the preview shows the edition the Answer shows, which 3.53 relies on ("including its cover preview"). The save still downloads `candidates[0]` until 3.53 changes it.

**Why a client component.** A preview can fail after the Answer rendered (the source is down, or the record was lost on a restart). `onError` falling back to the placeholder avoids a broken-image icon. Keeping the failed `src` in state, rather than a boolean, lets a new `src` try again without an effect.

## Verification

**Commands:**
- `npx eslint src tests`: expected 0 errors.
- `npx tsc --noEmit`: expected clean.
- `npm run test:unit`: expected all pass, `cover` included.
- `npm run test:int`: expected all pass, `coverPreview` included. Uses the worktree's Postgres on `localhost:5434` through `.env`.

## Auto Run Result

**Summary.** Covers can now be rendered, including before a Book is saved (AD-10, AD-14).
- `Cover({ src, title })` shows a plain `img` from a `coverUrl()` result at 2:3, or the outlined placeholder with the title when there is no cover or the image fails (also when it fails before hydration).
- `lookupBook` records the picked candidate's source cover URL per user and ISBN-13, in process (500 entries, 1 h).
- `GET /data/cover/[isbn13]` (signed in) fetches that URL through the same `fetchCover()` as the save's cover download, with its allowlist, https only, no redirects, timeout, 5 MiB limit and JPEG/PNG/WebP check. It answers the checked bytes with our own type, `no-store` and `nosniff`; 401 signed out; 404 with nothing recorded or a failed fetch; 500 otherwise.

**Files changed.**
- `src/lib/catalogue/covers.ts`: `fetchCover()` extracted and exported; `downloadCover` uses it, behaviour unchanged.
- `src/lib/catalogue/coverPreview.ts`: new. `recordCoverPreview`, `fetchCoverPreview`, `PREVIEW_SIZE`, `PREVIEW_TTL_MS`.
- `src/lib/catalogue/lookupBook.ts`: records the picked candidate's cover URL.
- `src/lib/books/coverUrl.ts`: doc comment points at the handler.
- `src/app/(frontend)/data/cover/[isbn13]/route.ts`: new. The preview handler.
- `src/app/(frontend)/components/Cover.tsx`: new. The `Cover` client component.
- `tests/int/coverPreview.int.spec.ts`: new, 12 tests (matrix rows, eviction).
- `tests/unit/cover.unit.spec.ts`: new, 2 tests (fallbacks, failure before hydration).
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 3.43 is done.

**Review.** 27 findings: medium 4, low 13, false 10.

Patched 4 entries (all low, 6 rows):
- a test for the pre-hydration failure check
- a test for the record's eviction
- no copy of the bytes per response
- "served" instead of "streamed" in `coverUrl.ts`

Deferred 2 entries (see frontmatter `deferred`):
- **The preview carries no pick** (medium, 4 rows). It belongs to 3.53.
- **The placeholder at small row sizes** (low). It belongs to E6.

Rejected (false rows are refuted in the triage log):
- **Outbound fetch limit** (2 rows). Only the user's own recorded ISBNs are fetched, once per Answer render, in a single-user tailnet app.
- **No ISBN normalising in the route** (3 rows). Only `coverUrl()` builds the path, from a normalised ISBN.
- **500 path untested.** Only a coverage ask.
- **Spine "streams" wording.** A planning-document edit; the Design Notes explain the buffering.
- **False (10 rows):**
  - no screen uses `Cover`
  - `runRoute()` not used
  - search not recorded
  - preview vs save candidate (2 rows)
  - real allowlist and timeout on the preview path (2 rows)
  - square corners
  - `lookupBook` side effect
  - recency and lifetime

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 4.

**Verification.** Run in worktree `story-3-43-cover`, Postgres on `localhost:5434`, after the patches:
- `npx eslint src tests`: 0 errors (36 pre-existing warnings in `src/migrations`).
- `npx tsc --noEmit`: clean.
- `npm run test:unit`: 523 passed.
- `npm run test:int`: 35 files passed, 1 skipped (`migrationSchema`); 300 tests passed. `coverPreview` passed 12/12, and `covers` and `lookupBook` passed unedited.
- Matrix audit: every row has a passing test.
- Playwright not run (no screen uses the component yet). `next build` not run.

**Residual risks.**
- No screen renders `Cover` yet. 3.45 is the first user and will show it in a real page.
- When 3.53 adds picking, the preview URL must tell editions apart (deferred item 1). Until then the save downloads `candidates[0]` while the preview follows `pick`; no screen passes a pick today.
