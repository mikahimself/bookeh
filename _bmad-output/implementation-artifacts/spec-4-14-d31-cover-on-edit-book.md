---
title: 'Story 4.14: [D31] Cover on Edit book'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_revision: '5f4f218c4d431b5a4130e33c3b0526978778e422'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['multiple-goals', 'oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `setCover` / `removeCover` (4.12) and `CornerCrop` (4.13) have no caller, so covers still can't be fixed on Edit book (D-4, UX-DR47a). Separately, once `setCover` has a caller, promoting a private Book would carry its private uploaded cover onto the shared Book (deferred from 4.12).

**Approach:** Edit book's first screen gets cover controls for the admin on a shared Book and the creator of a private Book. Choosing a file opens `CornerCrop`; Use shows a straightened 2:3 preview, warped in the browser with the server's own `squareToQuad`. Save sends `cover: { image, corners } | null` with the edits; the action calls `editBook()` and then `setCover()` / `removeCover()`. `promote()` shares the admin's cover row in place and replaces anyone else's with the source's cover.

## Boundaries & Constraints

**Always:**
- Controls only where `genresEditable` holds (a private Book, which only its creator holds, or `canEditShared`); `setCover`'s gate stays the server's check.
- "Add cover" shows when no cover is shown. "Replace cover" and a destructive "Remove cover" (no dialog) show when one is shown: the saved cover or an upload preview. Remove on an upload over no saved cover just drops the upload.
- File input `accept="image/*"`, no `capture` (the phone offers camera and library).
- The cover change is part of `dirty`, so X and Back ask "Discard changes?". It lives in memory only; a Blob doesn't go to `sessionStorage`.
- Save sends the Blob inside the action's argument (React 19 encodes Blobs). The action accepts `cover` absent, `null` or `{ image: Blob, corners: array }`, else `VALIDATION` with `fields.cover`, and runs `editBook()` before the cover call (Design Notes).
- `NOT_AN_IMAGE`, `IMAGE_TOO_LARGE`, `INVALID_CORNERS` and `COVER_FAILED` from Save show under the cover, with no toast. `onReject('NOT_AN_IMAGE')` shows there too. Choosing a new file clears the message.
- Preview: `warpPreview()` draws 400×600 with `squareToQuad` on a canvas, shown through `Cover`; its object URL is revoked when replaced or unmounted. A failed warp counts as `NOT_AN_IMAGE`.
- Promote: the admin's existing private cover row becomes `shared` in place (its `createdBy` clears through the hook), and any downloaded cover is discarded. For anyone else, an existing cover is replaced by the candidate's downloaded cover, or by none, and `removeOrphans()` deletes the old row. `prepareShare()` downloads unless the Book has a cover and the user is the admin.
- Interface text in English and Finnish. Tokens only. Buttons use the existing `Button` variants.

**Never:**
- No Undo. No cover in `EditBookInput` or `editBook()`. No crop or warp library. No change to the merge path, which already deletes the cover row when nothing references it.
- No client-side size limit. `IMAGE_TOO_LARGE` comes from the server.
- No uploads by other users on shared Books (Phase 3).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Upload | choose file → crop Use → Save | preview replaces the cover; action gets `cover: { image, corners }`; `setCover` stores it; "Saved" | No error expected |
| Remove | saved cover → Remove cover → Save | placeholder shown; action gets `cover: null`; `removeCover` clears it | No error expected |
| Undecodable | crop calls `onReject('NOT_AN_IMAGE')` | "Not an image." under the cover; no change | No error expected |
| Server rejects | Save answers `IMAGE_TOO_LARGE` | "Image too large." under the cover; task and change stay | no toast |
| Not allowed | user on a shared Book | no cover controls | server `NOT_FOUND` if forced |
| Admin promote | admin's private Book with an uploaded cover, source found | same `media` row, now `shared`, no `createdBy` | No error expected |
| User promote | user's private Book with an uploaded cover, source has a cover | Book takes the source cover (shared row); old row deleted | source has no cover → Book has none |

</intent-contract>

## Code Map

- `src/app/(frontend)/books/[bookId]/edit/page.tsx:83-101` -- `genresEditable`.
- `.../edit/EditBookScreen.tsx:128-197,232-243` -- `dirty`, `update`, `save`, `marks`; the cover header block.
- `.../edit/actions.ts:62-81` -- validation pattern (`fields`, `isPlainObject`).
- `src/lib/catalogue/setCover.ts` -- `setCover(ctx, bookId, file: Blob, corners)` and `removeCover(ctx, bookId)`, each in its own `withTransaction`.
- `src/app/(frontend)/components/cornerCrop/CornerCrop.tsx:20-31` -- props `file`, `onUse`, `onCancel`, `onReject`; the caller clears `file` on every outcome.
- `src/lib/catalogue/warpCover.ts:16-50` -- `squareToQuad` and `QuadMap`, pure; move them to `corners.ts`. `tests/unit/warpCover.unit.spec.ts:5` imports it.
- `src/lib/catalogue/sharePrivateBook.ts:50-77` (`prepareShare`, cover download only when `cover == null`), `:290-330` (`promote`, `coverId`), `:360-380` (`removeOrphans` already deletes `own.cover` when unreferenced).
- `src/lib/catalogue/covers.ts` -- `attachCover(tx, cover, visibility)`, `discardCover`. `src/fields/visibility.ts` clears `createdBy` on a flip to shared. `eslint.config.mjs` `clientLibImports` allows `corners` by path.
- `tests/unit/editBookScreen.unit.spec.ts` -- jsdom template with `editBookAction` mocked. `tests/int/sharePrivateBook.int.spec.ts` -- promote fixtures, `heldOutcome` mock, `COVER_URL`, `exists('media', id)`. `tests/int/saveCopyAction.int.spec.ts` -- how an action is called in int tests.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/corners.ts`, `warpCover.ts`, `tests/unit/warpCover.unit.spec.ts` -- move `QuadMap` and `squareToQuad` into `corners.ts`; update imports.
- `src/app/(frontend)/components/cornerCrop/warpPreview.ts` -- new: `warpPreview(image: Blob, corners: Corners): Promise<Blob | null>`, 400×600 canvas, nearest sampling via `squareToQuad`, JPEG; null on failure.
- `src/app/(frontend)/books/[bookId]/edit/CoverField.tsx` -- new client component: `Cover` (preview, placeholder when removed, or saved), the message under it, the buttons beside it, a hidden file input and `CornerCrop`. Exports `CoverChange = { image: Blob; corners: Corners; preview: string } | null`.
- `.../edit/EditBookScreen.tsx` -- `coverEditable` prop, `coverChange` state in `dirty`, `marks.cover`; Save adds `cover` (without `preview`) when changed; the four cover codes set `marks.cover` with no `reportFailure`.
- `.../edit/page.tsx` -- pass `coverEditable={genresEditable}`.
- `.../edit/actions.ts` -- validate `cover`; after `editBook`, `setCover` or `removeCover`.
- `src/app/(frontend)/components/Cover.tsx` -- doc: `src` may also be a local `blob:` preview.
- `src/lib/catalogue/sharePrivateBook.ts` -- `prepareShare` and `promote` as in Always; doc comments.
- `messages/{en,fi}.json` -- `editBook.addCover` "Add cover"/"Lisää kansi", `replaceCover` "Replace cover"/"Vaihda kansi", `removeCover` "Remove cover"/"Poista kansi".
- `tests/unit/editBookScreen.unit.spec.ts` -- `CornerCrop` and `warpPreview` mocked: no controls when not editable; upload → preview shown → Save sends `cover: { image, corners }`; Remove → Save sends `cover: null`; `onReject` and a Save `IMAGE_TOO_LARGE` show their messages under the cover.
- `tests/int/editBookAction.int.spec.ts` -- new: the admin's Save with an edit and a cover sets both; `cover: null` removes it.
- `tests/int/sharePrivateBook.int.spec.ts` -- one test per promote rule: the admin's row is shared in place; a user's row is replaced by the source's and deleted.
- `ARCHITECTURE-SPINE.md:64` (corners also exports `squareToQuad`), `:119` (promote cover rule).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `4-14-d31-cover-on-edit-book: done`.

**Acceptance Criteria:**
- Given Edit book for a Book whose cover I may change, when the first screen renders, then "Add cover" or "Replace cover" and "Remove cover" sit beside the cover; for anyone else they are absent.
- Given an upload or a removal, when Save succeeds, then the Book's cover is changed through `setCover` / `removeCover` with no Undo, and "Saved" shows.
- Given the spine, when the story is done, then lines 64 and 119 state the new export and the promote cover rule, and `package.json` gains no dependency.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 30 findings — high 0, medium 4, low 22, false 4, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) The edits commit before the cover checks, which need no database. The cover is the client's own 2000 px JPEG with corners already checked by `checkCorners`, so a refusal after the edits is rare. Splitting `setCover` into a pre-check adds public surface. Design Notes record the order.
  - `[medium]` `[patch]` (blind) After a cover code, the edits are saved but the draft and the stale `effective` remain, so typing a field back to its old value drops the key and the server keeps the edit. Fixed: on a cover code, the Book draft is cleared and the route refreshed; the cover change and its message stay.
  - `[low]` `[reject]` (blind) `isCover` checks only `Array.isArray(corners)`, so a malformed array saves the edits and then fails `INVALID_CORNERS`. Only a forged request sends that, and the fix adds a shape guard the server already applies in `setCover`.
  - `[low]` `[patch]` (blind) Activating Remove cover unmounts the focused button and focus drops to the body. Fixed: Remove moves focus to the Add cover button.
  - `[low]` `[reject]` (blind) There is no way back to the saved cover after Replace except Discard. EXPERIENCE.md defines exactly Add, Replace and Remove, and the fix is a new control.
  - `[low]` `[patch]` (blind) The cover buttons stay live while Save is pending, so a change made then is lost when the task closes. Fixed: the buttons are disabled while pending. The warp-in-flight half is rejected with the edge rows below.
  - `[false]` `[reject]` (blind) A failed promote download deletes a user's upload. The criterion requires that a private upload never reaches the shared Book; with no source cover the only alternative is no cover, which the code and its doc state ("or by none").
  - `[low]` `[patch]` (blind) The spine doesn't record that Edit book's Save commits the edits before the cover, in separate transactions. Fixed: AD-14 states the order.
  - `[low]` `[reject]` (blind) Built despite the `oversized` and `multiple-goals` warnings, and sprint-status says `done` while the spec says `in-review`. The workflow continues on both warnings (4.18 precedent), 4.12 bound the promote rule to this story, and the fix would edit this spec. Finalize sets `done` in the same commit.
  - `[medium]` `[patch]` (blind) No test covers the order in which edits and cover are saved. Same root as the verification-gap row; fixed by the same test.
  - `[low]` `[patch]` (blind) `warpPreview` never releases its canvases, and iOS Safari's total canvas memory can run out after a few picks. Fixed: both canvases are set to 0×0 in `finally`.
  - `[low]` `[reject]` (blind) A failed warp reads "Not an image.". The spec chose this, and the fix would edit the spec.
  - `[medium]` `[patch]` (edge) A cover failure after saved edits leaves them shown as unsaved. Same root as the blind row; same fix.
  - `[low]` `[reject]` (edge) A Save tapped while `warpPreview` runs sends no cover. The warp of a 400×600 preview takes about 100 ms after Use, and the fix adds a pending state.
  - `[low]` `[reject]` (edge) A second Use or a Remove before the first warp resolves is overwritten. A second Use needs the crop step reopened within that time; the fix is a sequence guard.
  - `[low]` `[reject]` (edge) The admin's cover is removed between `prepareShare` and the promote, so the shared Book ends up with none. That needs a concurrent removal on the admin's own Book during their own save.
  - `[medium]` `[patch]` (verification-gap) Nothing checks that `editBook()` runs before the cover call. Fixed: `editBookAction.int.spec.ts` sends a blank title with a valid cover and expects `VALIDATION` with the cover unchanged.
  - `[low]` `[reject]` (verification-gap) Remove on an upload with no saved cover is untested. Test-only, naming a spec rule rather than a criterion or spine rule (CLAUDE.md, Tests).
  - `[low]` `[reject]` (verification-gap) A failed preview warp and the real canvas warp are untested. Test-only; jsdom has no canvas, and `squareToQuad` is tested through `warpCover`.
  - `[low]` `[reject]` (verification-gap) The page's `coverEditable={genresEditable}` is untested. The component half of criterion 1 is tested, the repo doesn't render server pages in tests, and `setCover`'s gate guards the server.
  - `[low]` `[reject]` (verification-gap) The Blob's trip through the real server-action transport is untested. Playwright is limited to scan-to-save and shop check; the bundled React client encodes Blobs (verified by the reviewer).
  - `[low]` `[reject]` (verification-gap, other) `isCover` shape check. Same as the blind row.
  - `[low]` `[reject]` (intent) "The same save" as two transactions. Same as the first blind row.
  - `[false]` `[reject]` (intent) "Image too large." is reachable only in theory. It shows whenever the server's limit refuses an upload, which is where the criterion's size limit lives; the 6 MB body limit is above anything a 2000 px JPEG reaches.
  - `[low]` `[reject]` (intent) The preview and the stored cover come from two pipelines. Both use the same `squareToQuad`; the preview is only a preview.
  - `[low]` `[reject]` (intent) Page-level permission wiring is untested. Same as the verification-gap row.
  - `[low]` `[reject]` (intent) Crop, HEIC and camera are mocked in the tests. Test-only; 4.13 owns the crop step and its tests.
  - `[false]` `[reject]` (intent) The epic context says form data while the diff sends a Blob in an object. React encodes an argument holding a Blob as a multipart form-data body, so the file does arrive as form data.
  - `[false]` `[reject]` (intent) A non-admin promote replaces any existing cover and always writes `cover`. A private Book's cover only comes from `setCover`, so this is the criterion's rule; writing `null` equals the old omission when there was none.
  - `[low]` `[reject]` (intent) Two goals in one oversized story. Same as the blind row.

## Design Notes

Edits run first because they are the likely failure (a blank title, an ISBN clash), and they then write nothing. A cover rejected after saved edits leaves those edits saved and the draft still on screen. Saving again resends the same edits, which is harmless. One transaction would need a new `lib/catalogue` entry point, and the spine keeps the cover out of `EditBookInput`.

```ts
// actions.ts, after validation
await editBook(ctx, { bookId, edits, copy })
if (cover === null) await removeCover(ctx, bookId)
else if (cover) await setCover(ctx, bookId, cover.image, cover.corners)
```

## Verification

**Commands:**
- `npm run typecheck` -- no errors
- `npm run lint` -- no errors
- `npm run test:unit` -- all pass
- `npx vitest run tests/int/editBookAction.int.spec.ts tests/int/sharePrivateBook.int.spec.ts tests/int/setCover.int.spec.ts` (with the test Postgres) -- all pass
- `npm run build` -- succeeds

## Auto Run Result

Status: done

**Summary:** cover controls on Edit book (D31) and the promote cover rule deferred from 4.12.
- The admin on a shared Book, or the creator of a private Book, gets "Add cover", or "Replace cover" with a destructive "Remove cover", beside the cover. Everyone else gets none.
- A chosen file (`accept="image/*"`, no `capture`) opens the 4.13 crop step. Use shows a 400×600 straightened preview, warped in the browser with the server's own `squareToQuad`.
- Save sends `cover: { image, corners } | null` with the edits. `editBookAction` runs `editBook()` and then `setCover()` / `removeCover()`, each in its own transaction.
- Cover codes show under the cover with no toast. After one, the already-saved edits leave the draft and the route refreshes.
- The cover change lives in memory, counts toward "Discard changes?", and has no Undo.
- Promote: the admin's private cover row becomes shared in place, with no download. Anyone else's is replaced by the source's cover, or by none, and the old row is deleted.

**Files changed:**
- `src/lib/catalogue/corners.ts`, `warpCover.ts`: `squareToQuad` and `QuadMap` moved into the pure module.
- `src/app/(frontend)/components/cornerCrop/warpPreview.ts`: new. The client preview warp; its canvases are released afterwards.
- `src/app/(frontend)/books/[bookId]/edit/CoverField.tsx`: new. The cover, its buttons, the file input, the crop step and the message under the cover.
- `.../edit/EditBookScreen.tsx`: `coverEditable`, the cover change in `dirty`, the `cover` mark, Save's `cover`, and the clean-up after a cover code.
- `.../edit/page.tsx`: `coverEditable={genresEditable}`.
- `.../edit/actions.ts`: validates `cover`, then runs `editBook()` and the cover call.
- `src/app/(frontend)/components/Cover.tsx`: doc comment says `src` may be a `blob:` preview.
- `src/lib/catalogue/sharePrivateBook.ts`: the `prepareShare` download rule, the promote cover rule and `shareCoverRow`.
- `messages/en.json`, `messages/fi.json`: `editBook.addCover`, `replaceCover`, `removeCover`.
- Tests:
  - `tests/unit/editBookScreen.unit.spec.ts`: four cover tests.
  - `tests/int/editBookAction.int.spec.ts`: new. Set and remove; failing edits write no cover.
  - `tests/int/sharePrivateBook.int.spec.ts`: the admin's row shared in place; a user's row replaced by the source cover or by none.
  - `tests/unit/warpCover.unit.spec.ts`: import moved.
- `ARCHITECTURE-SPINE.md`:
  - line 64: `corners.ts` also exports `squareToQuad` and `QuadMap`;
  - AD-5 auto-share: the promote cover rule;
  - AD-14: Save's edits-then-cover order.
- `sprint-status.yaml`: 4.14 is done.
- `epic-4-context.md`: regenerated, since the planning docs had changed since it was compiled.

**Review findings:** 30 in total (high 0, medium 4, low 22, false 4).
- 6 patched entries:
  - medium: the edits stayed on screen as unsaved after a cover code (blind and edge rows);
  - medium: the edits-before-cover order test (verification-gap and blind rows);
  - low: focus after Remove;
  - low: buttons disabled while Save is pending;
  - low: canvas release;
  - low: the order recorded in AD-14.
- 0 deferred.
- 20 rejected. The reasons are in the Review Triage Log:
  - the two-transaction order (Design Notes);
  - the `isCover` shape check, which only forged requests reach;
  - no "keep the saved cover" control (not in EXPERIENCE.md);
  - races while the preview warps (about 100 ms);
  - a concurrent removal during the admin's promote;
  - test-only asks: remove-on-upload, the canvas warp, page wiring, Blob transport, crop and HEIC;
  - "Not an image." for a failed warp (spec);
  - preview and stored cover from two pipelines;
  - oversized and multiple-goals;
  - false findings: a promote download failure dropping the upload (required by the criterion), "Image too large." reachability, form data versus Blob, the non-admin cover write.

**Follow-up review recommended:** true. Two medium entries and four low entries were patched (high 0, medium 2, low 4). The named unverified risk: the flow has never run in a real browser. The Blob upload through the server-action transport, the canvas preview warp on iOS Safari (HEIC from the camera included) and the 4.13 crop step mounted on Edit book are checked only in jsdom with mocks. Upload a cover from the phone before relying on it.

**Verification:**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors; the 40 warnings were there before.
- `npm run test:unit`: 47 files, 741 tests passed.
- `editBookAction`, `sharePrivateBook`, `setCover` int specs: 3 files, 34 tests passed. The full `test:int` lane passed during implementation.
- `npm run build`: compiled successfully, with `DATABASE_URL` on `bookeh_test`. Against the schema-pushed dev database, the build stops at Payload's migration prompt.
- Every matrix row is covered by a test that ran.

**Residual risks:**
- If the cover is refused after the edits were saved, the edits stay saved, and the screen clears them from the draft and refreshes.
- A non-admin's promote now downloads the source cover even when the Book had one. If that download fails, the upload is dropped and the shared Book has no cover.
- The cover change doesn't survive a trip through sign-in, unlike the text draft.
