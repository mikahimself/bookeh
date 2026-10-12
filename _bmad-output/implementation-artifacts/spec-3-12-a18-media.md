---
title: 'Story 3.12: [A18] Media'
type: 'feature'
created: '2026-10-12'
baseline_revision: '3a5f6ca4a9d3b2566bfa2479a89dee15011b14ad'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      next.config.ts still allows /api/media/file/** for next/image, whose optimiser fetches without credentials and now gets a 403 from the signed-in read rule.
    evidence: |-
      node_modules/next/dist/server/image-optimizer.js fetchInternalImage builds the internal request with no headers; Media read is Boolean(req.user). Spine line 185 already rules out next/image for covers (plain img in Cover), so the pattern is scaffold config to delete when D10 builds the Cover component.
    location: >-
      next.config.ts:13-19
    severity: low
  - summary: >-
      The int lane and the dev database share the ./media directory, so AD-14's planned onInit orphan sweep run on bookeh_test would delete the dev database's cover files.
    evidence: |-
      Media has no staticDir, so every Payload instance writes to path.resolve('media'); tests/int/media.int.spec.ts writes there against bookeh_test. AD-14: "onInit removes files without a media row that are older than an hour". The story that adds the sweep (D2 cover download) must give the test lane its own staticDir or scope the sweep.
    location: >-
      src/collections/Media.ts (upload config)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `src/collections/Media.ts` is the scaffold's: `read: () => true`, every other operation open to any signed-in user, and the uploaded name kept as the stored filename. Any signed-out request can load a cover at `/api/media/file/<name>`, a user can create, replace or delete media rows, and a filename can carry a book title or a person's name (AD-14, spine "Known scaffold gaps").

**Approach:** Give `media` AD-14's access: read for any signed-in user, create, update and delete for the admin only, so other writes need system privileges (`overrideAccess`, used only by `lib/catalogue`). A `beforeOperation` hook replaces the uploaded file's name with a random UUID before Payload stores it. Only JPEG, PNG and WebP are accepted. An int spec proves it through the REST file route and the gateway.

## Boundaries & Constraints

**Always:** Access functions take the role from `isAdmin()` in `src/access/roles.ts` (AD-2), never from `roles` directly. `read` is `Boolean(req.user)`. This also gates the static file route, because Payload's `checkFileAccess` runs `access.read`. The rename runs for `create` and `update` whenever `req.file` is set, so it also covers system writes and the admin's replacement file. The new name is `randomUUID()` plus the lower-cased extension of the incoming name, or no extension when there is none. For images Payload replaces the extension with the detected type anyway. `upload.mimeTypes` is `['image/jpeg', 'image/png', 'image/webp']` (AD-14's upload formats; downloaded covers are JPEG). Keep the `alt` field and the admin group. Strict TS, no `any`.

**Never:** No `visibility` or `createdBy` on `media` (story 4.11, D28). No `lib/catalogue` code, no cover download or upload service (D2, D29), and no `Cover` component (D10). No `staticDir` change: the Dockerfile and backups rely on `./media` under the working directory. No change to `next.config.ts`. No new access helper in `src/access`. The admin-only rule stays local to `Media.ts`, as it does in `Users.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Random filename | system create (`overrideAccess`) of a PNG named `Tove Jansson - Muumipeikko.png` | `filename` matches `^[0-9a-f-]{36}\.png$`, contains no part of the original name; file exists under `media/` | No error expected |
| Signed-out file | `GET /api/media/file/<filename>` without credentials (`REST_GET(config)`) | 403, no image bytes | Forbidden |
| Signed-in file | same request with `Authorization: JWT <token>` of a `user` | 200, `content-type` `image/png` | No error expected |
| User reads row | `gateway.findByID` as a `user` | the row | No error expected |
| User creates | `gateway.create` with a PNG `file` as a `user` | nothing created, no new file under `media/` | `Forbidden` |
| User updates / deletes | `gateway.updateByID` (`alt`) and `gateway.deleteByID` as a `user` | row unchanged and still present | `Forbidden` |
| Admin | gateway create, update and delete with a PNG as an admin | allowed; the created `filename` is random | No error expected |
| Wrong type | system create of a plain-text file named `cover.png` | nothing created | Payload's file-type error |

</intent-contract>

## Code Map

- `src/collections/Media.ts` -- the collection to change. Currently it has `read: () => true`, `upload: true` and an optional `alt`.
- `src/collections/Users.ts:5-15` -- the local `Access` style to copy (`adminOnly`, `({ req: { user } }) => isAdmin(user)`).
- `src/access/roles.ts` -- `isAdmin()`.
- `node_modules/payload/dist/uploads/checkFileAccess.js` -- the file route runs `access.read` with `isReadingStaticFile: true`. If the result is `false`, it throws `Forbidden` (403).
- `node_modules/payload/dist/collections/operations/create.js:73-135` -- `beforeOperation` runs, then create access (line 127), then `generateFileData` (line 135). So a refused create writes no file, and a hook that changes `req.file.name` decides the stored name. `updateByID.js:59,95,157` has the same order.
- `node_modules/payload/dist/uploads/generateFileData.js:180-218` and `getFileTypeIdentity.js:11-17` -- the stored name is `getSanitizedUploadFilename(file.name, ext)`. For an image, `ext` is the detected type.
- `node_modules/payload/dist/collections/operations/local/create.js:13` -- the Local API `file` option becomes `req.file`. Its shape is `{ data: Buffer, mimetype, name, size }`.
- `src/lib/payload/gateway.ts` -- `create`, `findByID`, `updateByID` and `deleteByID`, run as the context user. The create options include `file`.
- `tests/int/config.int.spec.ts:19-43` -- the way to call `REST_GET(config)` with a `Request` and `{ params: Promise.resolve({ slug }) }`. For files, the slug is `['media', 'file', filename]`.
- `tests/helpers/harness.ts` -- `createUser()` (the password is `test-password`) and `contextFor(user)`. For a JWT, use `payload.login({ collection: 'users', data: { email, password } })`, which returns a `token`.
- `src/migrations/20261009_092900_users.ts:7,109` -- `media` and its unique `filename` index exist already. This story changes no columns.

## Tasks & Acceptance

**Execution:**
- `src/collections/Media.ts` -- Set access to `read: signedIn` and `create`/`update`/`delete: adminOnly`. Add `hooks.beforeOperation: [randomFilename]` and `upload: { mimeTypes: [...] }`. Add a doc comment that cites AD-14: other writes come only from `lib/catalogue` with system privileges, and per-Book visibility arrives with D28. -- Closes the scaffold gap.
- `tests/int/media.int.spec.ts` -- new. Build PNGs with `sharp` (`create: { width: 2, height: 3, channels: 3, background }`). Write one test per matrix row. Delete every created row in `afterAll` with `overrideAccess`, so Payload removes the files. Check the "no new file" rows by listing `media/` before and after. -- The access test the epic asks for.
- `src/payload-types.ts`, `src/migrations/` -- run `npm run generate:types` and `npm run payload -- migrate:create media --skip-empty`. Commit whatever they write. Expect no migration file, because no column changes. -- Keeps CI's drift check honest.

**Acceptance Criteria:**
- Given the changed `media` config, when `npm run payload -- migrate:create media --skip-empty` runs, then it writes no file (or the written migration is committed), and CI's drift check passes.
- Given `npm run test:int` (also with `DATABASE_PUSH=false`), when it runs, then `media.int.spec.ts` passes, and the other int specs still pass.
- Given the changed files, when lint and typecheck run, then both are clean.

## Spec Change Log

## Review Triage Log

### 2026-10-12 — Review pass
- verdicts: 22 findings — high 0, medium 4, low 12, false 6, maybe-false 0
- findings:
  - `[low]` `[defer]` blind: `next.config.ts` still lists `/api/media/file/**` under `images.localPatterns`. Next's optimiser fetches it without cookies, so it now gets a 403. Nothing renders media yet, and the spine (line 185) already rules out `next/image` for covers, so this scaffold config was already out of line. Deferred for D10 to remove.
  - `[low]` `[reject]` blind: an admin upload in the back office stores the original bytes, with no metadata strip and no size limit. AD-14 gives that processing to `setCover()` (D29), and the back office is admin-only and temporary. Adding `formatOptions` and a size limit is new processing, not a direct correction.
  - `[medium]` `[defer]` blind: the int lane writes into the same `./media` directory as the dev database. AD-14's planned `onInit` sweep removes files that have no `media` row, so a Payload started on `bookeh_test` would delete the dev covers. This is the existing `staticDir` setup, and no sweep exists yet. Deferred to the sweep story.
  - `[medium]` `[patch]` blind: the wrong-type test accepts any error and never sends a real image of a disallowed type. Grouped with the verification-gap MIME gap. Patched: the test now asserts `ValidationError`, and a GIF case was added.
  - `[medium]` `[patch]` blind: the rename on a replacement file is never tested. Grouped with the verification-gap update gap. Patched: the admin test now makes an update with a new file.
  - `[low]` `[reject]` blind: rows uploaded before this change keep their names. The dev `media` table has 0 rows (checked). Production has no save flow yet. A rename script would add new code for rows that do not exist.
  - `[low]` `[reject]` blind: the `payload-token` cookie path is untested. Payload's JWT strategy reads the token for both the cookie and the header, and this change touches only `access.read`. The only gain would be more tests, with no regression named.
  - `[low]` `[reject]` edge: an admin JSON create with `{ url, filename }` and no file keeps `data.filename`, because Payload fetches it as `externalUploadSource` after the hook. Only a hand-crafted admin REST call reaches this. The admin UI's paste-URL uploads a multipart file, and system writes (`overrideAccess`) skip `externalUploadSource`. The fix is a new branch.
  - `[low]` `[patch]` edge: a JPEG named `x.png` is stored as `.png`, and a name without an extension is stored as a bare UUID. The doc comment wrongly says Payload swaps in the detected extension (`generateFileData.js:138-145`: only on the sharp path). Grouped with the verification-gap "other" finding. Patched: the comment is corrected. The file is still served with the right content type (`getFile` detects it from the bytes).
  - `[low]` `[reject]` edge: a name with a query-like tail (`Show?id=x.123&size=large`) gives an odd extension. Only D2's downloads would produce such names, and D2 sets the name. An allow-list for extensions is a new branch.
  - `[low]` `[patch]` edge: the hook mutates the caller's own `file` object, even when the create is refused. Patched: it now assigns a copy, `req.file = { ...req.file, name }`.
  - `[medium]` `[patch]` verification-gap: the MIME allow-list is unproven, because the junk-bytes case rejects even without `mimeTypes`. Patched together with the blind wrong-type finding.
  - `[low]` `[patch]` verification-gap: the update branch of the rename is unexercised. Patched together with the blind update finding.
  - `[low]` `[patch]` verification-gap (other): the doc comment's claim about the extension is wrong. Patched together with the edge extension finding.
  - `[false]` `[reject]` intent: "only `lib/catalogue`" is not enforced, so any `overrideAccess` caller gets through. The collection cannot see who calls it. AD-3 limits system privileges to `lib/catalogue` through the layer rules. Access functions never run under `overrideAccess`.
  - `[false]` `[reject]` intent: update is admin-only too, which widens the rule. Design Notes give the reason: user update would get around the create and delete rules. Nothing in the intent contradicts it.
  - `[false]` `[reject]` intent: no migration is committed. `migrate:create --skip-empty` was run after the change and wrote nothing, and `media` has existed since `20261009_092900_users`.
  - `[false]` `[reject]` intent: the spec and sprint status are not committed. Finalisation commits both.
  - `[low]` `[reject]` intent: the JWT header, not the cookie, is tested. This duplicates the blind cookie finding and is rejected for the same reason.
  - `[low]` `[defer]` intent: covers loaded through `next/image` would get a 403. This duplicates the blind `localPatterns` finding and is deferred with it.
  - `[false]` `[reject]` intent: the rename on update is untested. This duplicates the patched update gap, so it needs no separate action.
  - `[false]` `[reject]` intent: there is only one MIME probe. This duplicates the patched MIME gap, so it needs no separate action.

## Design Notes

**Why `beforeOperation` and not `beforeChange`.** Payload computes `filename` from `req.file.name` in `generateFileData`. That runs after `beforeOperation` and before `beforeChange`, so renaming `data.filename` in `beforeChange` would store a name that differs from the file on disk. In `beforeOperation`, the hook renames the incoming file itself:

```ts
const randomFilename: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if ((operation === 'create' || operation === 'update') && req.file) {
    req.file.name = `${randomUUID()}${path.extname(req.file.name).toLowerCase()}`
  }
  return args
}
```

**Update is admin-only too.** AD-14 names only create and delete. A user who could update could still replace a cover's file or edit `alt`, which bypasses both of them, so update follows them.

## Verification

**Commands:**
- `npm run test:int` -- expected: all pass, including `media.int.spec.ts`
- `DATABASE_PUSH=false npm run test:int -- media migrationSchema` -- expected: pass on the migration-built schema
- `npm run test:unit` -- expected: all pass
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors

## Auto Run Result

**Summary.** `media` now follows AD-14's Phase 1 rules.
- **Read:** any signed-in user can read a media row or its file. `/api/media/file/<name>` checks `access.read`, so a signed-out request gets 403.
- **Writes:** create, update and delete are admin-only, through `isAdmin()`. Every other write has to come from `lib/catalogue` with system privileges.
- **Filenames:** a `beforeOperation` hook gives every incoming file (create or update) a random UUID name, with the incoming name's extension lower-cased. It copies `req.file` rather than changing the caller's object.
- **File types:** uploads are limited to JPEG, PNG and WebP.
- **No schema change:** `migrate:create --skip-empty` wrote nothing, and `payload-types.ts` is unchanged.

**Files changed.**
- `src/collections/Media.ts`: the access rules, the random-filename hook and the MIME allow-list.
- `tests/int/media.int.spec.ts`: new, with 9 tests. They cover each row of the I/O matrix through `REST_GET`, the gateway and system writes. They also cover an admin's replacement file and a GIF, which the allow-list must refuse.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: story 3.12 set to `done`.

**Review findings.** There were 22: medium 4, low 12, false 6. Each has its own row in the Review Triage Log.
- **Patched (4 entries):**
  - Medium: the wrong-type test accepted any error, so nothing proved the MIME allow-list. It now asserts `ValidationError`, and a GIF case was added. Both new assertions fail when `mimeTypes` is removed.
  - Medium: the rename on a replacement file was never run. An admin `updateByID` with a new file is now tested.
  - Low: the doc comment claimed Payload swaps in the detected extension. It now says the stored extension is the incoming name's.
  - Low: the hook changed the caller's own file object. It now assigns a copy.
- **Deferred (2):**
  - Low: the `next/image` `localPatterns` for media is dead config. It should go when D10 builds the Cover component.
  - Medium: the int lane and dev share `./media`. The planned orphan sweep in the D2 story must not delete the dev covers.
- **Rejected:**
  - The back office stores upload bytes unprocessed: that processing is D29 `setCover()`'s job, and the back office is admin-only.
  - Rows from before this change keep their names: the dev table has 0 rows.
  - The cookie path is untested: it is the same JWT strategy, and no regression is named.
  - An admin JSON `{ url, filename }` create keeps its filename: only a hand-crafted admin REST call reaches it, and the fix is a new branch.
  - A query-like tail on the name gives an odd extension: only D2 would produce such names, and D2 sets the name.
  - "`lib/catalogue` only" is not enforced in the collection: the layer rules enforce it (AD-3).
  - Update is admin-only too: the reason is in Design Notes.
  - There is no migration: none is needed.
  - The bookkeeping is missing: this finalisation does it.
  - Two other rows repeat findings above.

**Follow-up review recommendation:** true. Two medium entries were patched, and there were no high ones. Patched by verdict: high 0, medium 2, low 2. The risk nobody has checked is the hook on the multipart REST path that the Payload admin form uses. Every test goes through the Local API, where `req.file` is the caller's object. No test or reviewer has uploaded through `POST /api/media` or the admin UI and checked that the stored name is random. The first story that uploads from the admin, or D29, should do that once.

**Verification.**
- `npm run test:int`: 133 tests pass, 1 skipped as before. `media.int.spec.ts` passes 9 of 9.
- `DATABASE_PUSH=false npm run test:int -- media migrationSchema`: 10 tests pass.
- `npm run test:unit`: 471 tests pass.
- `npm run lint`: 0 errors. The 8 warnings are in old migrations.
- `npm run typecheck`: clean. Prettier: clean.
- `npm run payload -- migrate:create media_check --skip-empty`: no file written.
- `media/` is empty after the runs.
- Matrix audit: every row has a test that passes. Before the patches, the spec failed 5 of its 8 tests against the old `Media.ts`.

**Residual risks.**
- A file uploaded under a wrong extension keeps it, for example a JPEG named `.png`. The file is still served with the right content type, because Payload detects it from the bytes.
- A name without an extension is stored as a bare UUID. D2 should name downloads with their extension.
- Back-office uploads keep their EXIF metadata until D29's `setCover()` becomes the upload path.
