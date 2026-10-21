---
title: 'Story 4.12: [D29] Cover upload service'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_revision: '1d0e834c54b698e56714812f547fe00ed56d9dbb'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      Promoting a private Book keeps its cover row, so a private cover uploaded through setCover would stay private on the shared Book (4.11's deferred item). Split out of 4.12 to keep it compact; it must land before or with Story 4.14, the first caller of setCover.
    evidence: |-
      promote() in sharePrivateBook.ts keeps own.cover; prepareShare() downloads only when cover == null. Proposed rule: the admin's private cover row becomes shared (AD-14: the admin's upload on a shared Book is shared; AD-4 flips rows in place); anyone else's is replaced by the candidate's cover and deleted when unreferenced (non-admin uploads on shared Books are Phase 3; AD-5 "source values replace its fields"). Until 4.14 nothing calls setCover, so no private cover can exist.
    location: >-
      src/lib/catalogue/sharePrivateBook.ts:271
    severity: medium
  - summary: >-
      Review (edge, intent) confirmed the promotion gap above; it is now an acceptance criterion of Story 4.14 in epics.md.
    evidence: |-
      promote() still passes 'shared' only for a downloaded cover and keeps own.cover otherwise. setCover has no caller until 4.14, so no private cover can reach a promoted Book before then. epics.md Story 4.14 gained the criterion in this commit.
    location: >-
      src/lib/catalogue/sharePrivateBook.ts:282
    severity: medium
---

<intent-contract>

## Intent

**Problem:** A Book can only get a cover by download, so a missing or wrong cover can't be fixed (FR-47 part, D-4).

**Approach:** `setCover(ctx, bookId, file, corners)` and `removeCover(ctx, bookId)` in `lib/catalogue`. `setCover` checks the file, warps the four-corner quad to a 2:3 JPEG with a hand-written Heckbert square-to-quad mapping on sharp's raw pixels, writes it atomically and swaps `books.cover` in one transaction.

## Boundaries & Constraints

**Always:** Access: `requireOwnBook()` first, then admin (`canEditShared`) for a shared Book, `createdBy = me` for a private Book; anything else is `NOT_FOUND`. Size and corner-shape checks run before any Book read. The type is sniffed by sharp (JPEG, PNG or WebP), never taken from `file.type`. Pipeline: `.rotate()` (EXIF orientation), shrink to 2000 px on the long side if larger (scale the corners with it), flatten onto white, raw RGB, warp straight to the output size (height `min(1200, longest side edge)`, width ⅔ of it), JPEG at quality 85 from the raw buffer, so no metadata survives. Media rows: `shared` for a shared Book, `private` for a private one (the field hook sets `createdBy`). A replaced or removed row is deleted only when `isUnreferenced()`; its file is left to the sweep (`deleteMediaRow`). Messages in English and Finnish.

**Never:** No server action or UI (4.14 calls `setCover` from Edit book's Save; 4.13 is the crop). No promotion change (deferred). No Undo. No crop library or general linear solver. No re-fetch code: it is Epic 5, AD-5 already treats an uploaded cover as an existing value, and no current path replaces a Book's cover.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admin, shared Book | held shared Book, JPEG, valid corners | new `shared` media row, `books.cover` set, old row deleted if unreferenced | No error expected |
| Creator, private Book | own private Book, PNG | `private` media row, `createdBy` = creator | No error expected |
| Not allowed | non-admin on a held shared Book; anyone on another user's private Book | nothing written | `NOT_FOUND` |
| Bad file | > 5 MiB / not JPEG, PNG or WebP (e.g. GIF, text) | nothing written | `IMAGE_TOO_LARGE` / `NOT_AN_IMAGE` |
| Bad corners | crossed, concave, three collinear, counter-clockwise, non-finite or outside the image | nothing written | `INVALID_CORNERS` |
| Write fails | write or rename throws | no file (temp removed), no row, cover unchanged | `COVER_FAILED`, logged |
| Remove | allowed caller, Book with a cover | `cover` null, row deleted if unreferenced; no cover is a no-op | as `setCover` access |

</intent-contract>

## Code Map

- `src/lib/catalogue/covers.ts` -- `storeCover()`'s temp-write + rename block becomes `writeMediaFile(payload, bytes, ext): Promise<string>` (removes its temp on failure, rethrows), used by both; `attachCover(tx, cover)` gains a `visibility` argument (callers in `ensureSharedBook.ts`, `sharePrivateBook.ts` pass `'shared'`); `deleteMediaRow`, `discardCover` reused.
- `src/lib/catalogue/editBook.ts` -- pattern for the gate (`requireOwnBook` in `withTransaction`, `gateway.findByID` of `visibility`, system `payload.update`).
- `src/lib/catalogue/system.ts`, `isUnreferenced.ts`, `src/lib/payload/transaction.ts` (`withTransaction`, `onRollback`, `assertLive`) -- reuse.
- `src/fields/visibility.ts` -- `createdBy` from `req.user` on a private create.
- `src/lib/errors.ts`, `messages/{en,fi}.json` (`errors.*`) -- add codes.
- `next.config.ts` -- `experimental.serverActions.bodySizeLimit` (bundled doc `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`; `src/proxy.ts`'s 10 MB `proxyClientMaxBodySize` default already suffices).
- `tests/int/editBook.int.spec.ts`, `tests/int/media.int.spec.ts` -- `createUser`/`as`, Book and media fixtures to copy.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/warpCover.ts` -- `Point`, `Corners` (TL, TR, BR, BL in the uploaded image's pixels), `squareToQuad(corners)` (Heckbert closed form, affine when a parallelogram), `checkCorners()` (finite, inside the image, every consecutive edge cross product strictly positive), `warpCover(bytes, corners)` (pipeline above, bilinear sampling at pixel centres, clamped at edges) -- the warp, pure.
- `src/lib/catalogue/setCover.ts` -- `setCover`, `removeCover` per the matrix; the file is written inside the transaction with `onRollback` discarding it -- the service.
- `src/lib/catalogue/covers.ts` -- as in the Code Map.
- `src/lib/errors.ts`, `messages/*.json` -- `NOT_AN_IMAGE` "Not an image." / "Ei kuva.", `IMAGE_TOO_LARGE` "Image too large." / "Kuva on liian suuri.", `COVER_FAILED` "Couldn't save cover." / "Kannen tallennus ei onnistunut.", `INVALID_CORNERS` "Corners don't form a cover." / "Kulmat eivät muodosta kantta.".
- `next.config.ts` -- `bodySizeLimit: '6mb'` (a 5 MiB file plus form overhead).
- `ARCHITECTURE-SPINE.md` -- Shared shapes (`src/lib/catalogue`) gain `Point` and `Corners`.
- `tests/unit/warpCover.unit.spec.ts` -- the four corners map to the rectangle's corners for a non-parallelogram quad; output from a JPEG carrying EXIF and GPS has neither; `checkCorners` rejects each bad shape and accepts a convex one.
- `tests/int/setCover.int.spec.ts` -- two-user access (both allowed cases with their visibility, both `NOT_FOUND` cases); replace deletes the unreferenced old row; `removeCover`; `NOT_AN_IMAGE`/`IMAGE_TOO_LARGE`; a failing `fs.rename` gives `COVER_FAILED` and leaves no file, row or cover change.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `4-12-d29-cover-upload-service: done`.

**Acceptance Criteria:**
- Given an allowed caller, when `setCover` succeeds, then the stored file is a JPEG of at most 800×1200 in 2:3, under a random name, with no EXIF or GPS data.
- Given the spine, when the story is done, then its Shared shapes declare `Corners`.
- Given `next.config.ts`, when the story is done, then `serverActions.bodySizeLimit` is `'6mb'` and `npm run build` succeeds.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 31 findings — high 0, medium 9, low 13, false 9, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) Two concurrent `setCover` calls on one Book both read the same old cover, so the first upload's row stays unreferenced. It needs two uploads to the same Book at once in a one-user app, and 4.14's Save will be pending-guarded. The fix is row locking, which Payload's Local API doesn't offer directly.
  - `[low]` `[reject]` (blind) Called inside 4.14's edit transaction, `setCover` would warp with the transaction open. Nothing calls it yet, and "same action" does not require the same transaction; 4.14 can call it outside `editBook`'s transaction. Splitting it now would add public surface for a caller that doesn't exist.
  - `[medium]` `[patch]` (blind) No limit on decoded pixels: a highly compressible PNG under 5 MiB can decode to hundreds of megapixels and exhaust memory on the single instance. Fixed: `orientedSize()` reads the header and answers `IMAGE_TOO_LARGE` above 50 MP, before any decode; a new unit test sends an 8000×8000 PNG.
  - `[low]` `[reject]` (blind) Every sharp failure maps to `NOT_AN_IMAGE` without a log. Header and decode failures are almost always bad files; the pixel-limit case is now `IMAGE_TOO_LARGE`. Telling libvips errors apart would add branches for a rare case.
  - `[false]` `[reject]` (blind) The refactor loses which step failed in the log. Both log calls pass `err`, and Node's fs errors carry `syscall` (`rename`, `open`) and a message naming it, so the step is still logged.
  - `[medium]` `[patch]` (blind) The deferred promotion fix is not tied to Story 4.14. Fixed: epics.md Story 4.14 gains the criterion.
  - `[medium]` `[patch]` (blind) No test for the server's EXIF orientation guard. Same root as the verification-gap geometry row: fixed by one unit test.
  - `[low]` `[reject]` (blind) A tiny or near-degenerate convex quad is accepted. 4.13 starts the corners as a centred 2:3 rectangle, so a user would have to drag them together on purpose. The fix is a new minimum-size guard.
  - `[low]` `[reject]` (blind) A replaced cover's file stays on disk until the next start's sweep. This is the existing `deleteMediaRow()` contract (AD-14, 4.19). The file isn't served without its row, and every deploy restarts the app.
  - `[low]` `[reject]` (blind) A body over 6 MiB is refused by Next before the action, so it never shows `IMAGE_TOO_LARGE`. 4.13's browser step uploads a JPEG of about 2000 px, far below either limit, and `next.config.ts` already notes the relation in a comment.
  - `[low]` `[reject]` (edge) Concurrent covers orphan a row. Same as the first blind row.
  - `[medium]` `[defer]` (edge) Promoting a private Book keeps a private cover on a shared Book. Already deferred in planning; now an acceptance criterion of 4.14, and appended to `deferred`.
  - `[false]` `[reject]` (edge) A held but unreadable Book throws Payload `NotFound` rather than `DomainError`. `mapError()` in `errors.ts` maps `NotFound` to `NOT_FOUND`, the same as `editBook`.
  - `[medium]` `[patch]` (edge) No pixel limit before decoding. Same root and fix as the blind pixel-limit row.
  - `[low]` `[reject]` (edge) Near-zero-area quads are accepted. Same as the blind tiny-quad row.
  - `[false]` `[reject]` (edge) A failed final JPEG encode reaches the caller with no code and no log. It surfaces as `INTERNAL`, and `runAction()` logs it.
  - `[false]` `[reject]` (edge) The refactor loses the rename stage in the log. Same refutation as the blind logging row.
  - `[medium]` `[patch]` (verification-gap) The warp's pixel geometry is never checked: the fixtures are single-colour and the corners are the full frame. Fixed: a unit test warps a quadrant-coloured 2400×3600 photo, stored turned with EXIF orientation 6, through a trapezoid, and checks each output quadrant's colour. Dropping `.rotate()` or swapping `u`/`v` each fail it.
  - `[medium]` `[patch]` (verification-gap) The 800×1200 cap is asserted only on inputs that can't reach it. Fixed: the same test asserts exactly 800×1200 from an input over 2000 px.
  - `[low]` `[reject]` (verification-gap) No test proves `onRollback` discards the file after a later step fails. The sweep is a backstop, and the same `onRollback` pattern is tested for downloads in `covers.int.spec.ts`. This is a test-only finding with no criterion behind it.
  - `[low]` `[patch]` (verification-gap) The `isUnreferenced` guard on the replaced row is untested; the matrix names "old row deleted if unreferenced". Fixed: the admin test points a second Book at the current cover, replaces it, and asserts the row survives.
  - `[false]` `[reject]` (verification-gap) The log loses the step. Same refutation as the blind logging row.
  - `[low]` `[reject]` (verification-gap) No test proves the file checks run before the Book read. Test-only, and it names no acceptance criterion or spine rule.
  - `[false]` `[reject]` (intent) The user-visible outcome isn't reachable in 4.12. STORY-SLICING types D29 as "Service"; 4.13 and 4.14 own the crop and the UI.
  - `[false]` `[reject]` (intent) No server action takes FormData. 4.14's criterion "Save uploads through setCover in the same save" places the action there. 4.12 delivers its prerequisites: `setCover` takes the `Blob` that FormData yields, and the body limit is raised.
  - `[false]` `[reject]` (intent) There is no code for "re-fetch never replaces an uploaded cover". No re-fetch exists (Epic 5), AD-5 already states the rule, and no current path replaces a Book's cover.
  - `[medium]` `[patch]` (intent) The orientation guard is untested. Same root and fix as the verification-gap geometry row.
  - `[low]` `[reject]` (intent) `INVALID_CORNERS` is tested only at unit level. `setCover` calls `warpCover()` before any read, and the unit test covers the throw. Test-only.
  - `[low]` `[reject]` (intent) The `writeFile` failure branch is untested. It shares one `catch` with the tested `rename` failure. Test-only.
  - `[medium]` `[defer]` (intent) Promotion keeps a private cover. Same as the edge promotion row.
  - `[false]` `[reject]` (intent) A refused caller can see a file error before `NOT_FOUND`. That is the spec's stated order, and those errors reveal nothing about the Book.

## Design Notes

Heckbert, unit square (u,v) → quad: `x = (a·u + b·v + c)/(g·u + h·v + 1)`, same denominator for `y = (d·u + e·v + f)/…`; `g`, `h` come from the two diagonal sums and a 2×2 determinant, and are 0 for a parallelogram.

## Verification

**Commands:**
- `npm run typecheck` -- no errors
- `npm run lint` -- no errors
- `npm run test:unit` -- all pass
- `npm run test:reset && npm run test:int` -- all pass
- `npm run build` -- succeeds

## Auto Run Result

Status: done

**Summary:** `setCover(ctx, bookId, file, corners)` and `removeCover(ctx, bookId)` in `lib/catalogue` are the cover upload service (AD-14).
- `setCover` checks the file before reading the Book:
  - at most 5 MiB and 50 MP;
  - JPEG, PNG or WebP by its bytes;
  - a convex clockwise quad inside the oriented image.
- It then warps the quad with a hand-written Heckbert square-to-quad map and bilinear sampling on sharp's raw pixels, giving a 2:3 JPEG of at most 800×1200 with no metadata.
- In one transaction it gates access, writes the file atomically (`COVER_FAILED` on failure, discarded on rollback), creates the `media` row with the Book's visibility, sets `books.cover`, and deletes the replaced row when unreferenced.
- Access: the admin may change a shared Book's cover, the creator a private Book's. Anyone else gets `NOT_FOUND`.
- `removeCover` sits behind the same gate.
- Server actions accept a 6 MB body.
- The promotion fix is deferred, now as a criterion on Story 4.14.

**Files changed:**
- `src/lib/catalogue/warpCover.ts`: new. `Point`, `Corners`, `squareToQuad`, `checkCorners`, `warpCover`.
- `src/lib/catalogue/setCover.ts`: new. `setCover`, `removeCover`, the cover gate.
- `src/lib/catalogue/covers.ts`: `writeMediaFile()` extracted from `storeCover()`; `attachCover()` takes `visibility`; `discardCover()` needs only `filename`.
- `src/lib/catalogue/ensureSharedBook.ts`, `sharePrivateBook.ts`: pass `'shared'` to `attachCover()`.
- `src/lib/errors.ts`, `messages/en.json`, `messages/fi.json`, `src/app/(frontend)/components/toast/flashCookie.ts`, `tests/unit/messages.unit.spec.ts`: add `NOT_AN_IMAGE`, `IMAGE_TOO_LARGE`, `INVALID_CORNERS`, `COVER_FAILED`.
- `next.config.ts`: `experimental.serverActions.bodySizeLimit: '6mb'`.
- `ARCHITECTURE-SPINE.md`: Shared shapes gain `Point` and `Corners`.
- `_bmad-output/planning-artifacts/epics.md`: Story 4.14 gains the promotion criterion.
- `tests/unit/warpCover.unit.spec.ts`: new tests:
  - the corner mapping;
  - each bad corner shape;
  - EXIF and GPS stripped;
  - an upright 800×1200 result from an oriented, oversized quadrant photo;
  - the pixel limit;
  - `INVALID_CORNERS`.
- `tests/int/setCover.int.spec.ts`: new tests:
  - two-user access;
  - visibility and `createdBy`;
  - replacement, with a still-referenced row kept;
  - `removeCover`;
  - file errors;
  - `COVER_FAILED` leaving nothing behind.
- `tests/int/covers.int.spec.ts`: `attachCover` call updated.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 4.12 is done.

**Review findings:** 31 in total (high 0, medium 9, low 13, false 9).
- 5 patch entries:
  - pixel limit (medium);
  - promotion criterion on 4.14 (medium);
  - geometry and orientation test (medium);
  - 800×1200 cap test (medium);
  - referenced-row test (low).
- 1 deferred entry (medium): promotion keeps a private cover. It is owned by 4.14.
- 13 rejected as `low`:
  - concurrent-upload race (twice);
  - warp inside 4.14's transaction;
  - every sharp failure as `NOT_AN_IMAGE`;
  - tiny quads (twice);
  - files left until the sweep;
  - over 6 MiB never reaching `IMAGE_TOO_LARGE`;
  - test-only gaps: the `onRollback` discard, the check order, `INVALID_CORNERS` at service level, and the `writeFile` branch.
  - The reasons are in the Review Triage Log.
- 9 rejected as `false`:
  - lost log stage (four times): `err` carries the syscall;
  - `NotFound` mapping;
  - encode failure as `INTERNAL`;
  - no UI or server action (4.14's job);
  - re-fetch not in the code (Epic 5);
  - check order (as the spec states).

**Follow-up review recommended:** false. 4 medium and 1 low entries were patched (high 0, medium 4, low 1). Each patch is covered by a test that ran, and the geometry test was mutation-checked, so no specific unverified risk remains.

**Verification:** run against the worktree Postgres on 5460.
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors. The 40 warnings were all there before.
- `npm run test:unit`: 706 passed.
- `npm run test:reset && npm run test:int`: 48 files, 444 tests passed.
- `npm run build`: compiled successfully.
- Mutation checks: removing `.rotate()`, or swapping `u`/`v` in the sampling loop, each fail the geometry test.
- Every matrix row is covered by a test that ran.

**Residual risks:**
- Promotion still keeps a private cover until 4.14 lands its criterion. Nothing calls `setCover` before then.
- Two concurrent uploads to one Book can leave one unreferenced media row.
- The 50 MP limit refuses a photo larger than that sent unshrunk. The browser path (4.13) shrinks to about 2000 px first.
