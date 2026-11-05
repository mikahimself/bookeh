---
title: '9.9 G9 Tags, my genres and my themes in Settings'
type: feature
created: '2026-11-05'
status: done
baseline_revision: 264e27c6f31d0f26dd380294da5970b4856ceacb
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /Users/mika/development/bookeh/CLAUDE.md
  - /Users/mika/development/bookeh/_bmad-output/implementation-artifacts/epic-9-context.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Private tags, genres and themes can be renamed, merged and deleted only through services (Story 9.3); Settings has no group for them.

**Approach:** Add Tags, My genres and My themes groups to the Settings managed-list column, reusing ManagedList with one rename/merge/delete action set over `tagUse` counts. Labels are never added here.

## Boundaries & Constraints

**Always:** Follow Story 9.9 in epics.md and EXPERIENCE.md Settings. Each value is a List row with its copy count ("N books") and Rename, Merge, Delete. Rename edits in place, offers a merge dialog on NAME_TAKEN, and shows a field message on SYSTEM_NAME. Merge and Delete are confirmed by dialogs stating how many books are affected; no Undo, no toast. Actions authenticate first and validate ids with `isRowId`, then call renameTag/mergeTag/deleteTag. Read lists sequentially on the one context with `tagUse`. Groups sit in the second column after People and before Backup, in English and Finnish. Read the relevant installed Next docs before code.

**Never:** Add an "Add" link or create action for these groups (labels are created from a Book), change services or schema, add Undo or toasts, touch admin Genres group (9.14), match names in the UI, mutate development data, commit the browser walk.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Rename | New name, any kind | Row renamed, list refreshed | - |
| Name in use | Another own label of the kind | Field stays open, "already in use" with Merge link opening the merge dialog | NAME_TAKEN conflictId |
| System name | Genre/theme named like a system value | Field stays open with the system-name message | VALIDATION name SYSTEM_NAME |
| Merge / Delete | Label with N copies | Dialog says N books; success refreshes | NOT_FOUND refreshes, others reported |
| Empty kind | No labels | Empty text and no Add link | - |
| Hostile input | Non-id or foreign id | VALIDATION or NOT_FOUND, no write | - |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/settings/ManagedList.tsx` — shared list; make `actions.create` and `strings.add` optional (no Add link when absent); `NameField.fieldFailure` shows `errors.SYSTEM_NAME` for VALIDATION name SYSTEM_NAME instead of "Enter a name".
- `src/app/(frontend)/(sections)/settings/LocationsGroup.tsx`, `PeopleGroup.tsx` — pattern for a group wrapper (strings, rich titles via `typed`).
- `src/app/(frontend)/(sections)/settings/TagsGroup.tsx` (new) — one wrapper for all kinds; takes `items` and a `kind` for its strings.
- `src/app/(frontend)/(sections)/settings/actions.ts` — add rename/merge/delete tag actions beside the location and People ones, using its `name`/`id` guards and `requireUserOrThrow`.
- `src/app/(frontend)/(sections)/settings/page.tsx` — read `tagUse(ctx, kind)` three times in sequence, map `copies` to `count`, render three Groups in the second column; update its doc comment and the "tags arrive later" comment.
- `src/lib/tags/tags.ts` — renameTag, mergeTag, deleteTag, tagUse; read-only.
- `messages/en.json`, `messages/fi.json` — `settings` keys for the three headings, empty texts, counts, merge/delete strings.
- `tests/unit/peopleGroup.unit.spec.ts` — pattern for a jsdom group test.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story 9-9 to done.

## Tasks & Acceptance

**Execution:**
- `ManagedList.tsx` -- optional create/add; SYSTEM_NAME field message -- tag groups have no Add
- `actions.ts` -- renameTagAction, mergeTagAction, deleteTagAction -- strict, auth-first boundary
- `TagsGroup.tsx`, `page.tsx` -- three groups with copy counts -- UX-DR50
- `messages/en.json`, `messages/fi.json` -- strings for the groups
- `tests/unit/tagsGroup.unit.spec.ts` -- one focused test: no Add link, system-name message beneath the field, delete dialog states the book count
- Spec and `sprint-status.yaml` -- record result

**Acceptance Criteria:**
- Given `/settings`, when it renders, then Tags, My genres and My themes each list own labels with "N books" and Rename, Merge (with another label), Delete, and no Add link.
- Given a rename onto a system name, when saved, then the field stays open with the system-name message; onto an own label's name it offers the merge dialog.
- Given Merge or Delete, when opened, then the dialog states the affected book count; confirming refreshes the list with no toast or Undo.

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass
- verdicts: 22 findings — high 0, medium 0, low 3, false 6, maybe-false 0 (13 more rejected as low or spine-settled, below)
- findings:
  - `[low]` `[patch]` Blind hunter: Finnish `genreEmpty` "Ei lajeja" differs from heading "Omat genret" — changed to "Ei genrejä".
  - `[false]` `[reject]` Blind hunter: `errors.SYSTEM_NAME` missing from the diff — the key already exists in `messages/en.json` and `fi.json` (lines 414) and is checked by `messages.unit.spec.ts`.
  - `[false]` `[reject]` Blind hunter: sequential `tagUse` reads should be `Promise.all` — the spine requires gateway calls on one context to run one after the other.
  - `[false]` `[reject]` Blind hunter: spine update needed for optional `create`/`add` — a component prop, not a spine contract.
  - `[false]` `[reject]` Blind hunter: cross-kind/cross-user merge untested — `tagManagement.int.spec.ts` (9.3) covers it; the UI lists only same-kind items.
  - `[false]` `[reject]` Intent auditor and edge-case hunter: count is copies, dialogs say books — epic 9 context and the AD-7 amendment define label usage counts as copy counts; the UX shows them as "N books".
  - `[low]` `[reject]` Edge-case hunter: wishlist-only Books change though the count says 0 — same AD-7 copy-count rule; the fix would add a second counting path.
  - `[low]` `[reject]` Blind hunter, edge-case hunter: reuse of `locationCount`/`deleteTitle`, `${kind}Empty` template key, per-kind `SYSTEM_NAME_GENRE/THEME`, whole-page failure on a tag read, weak `/add/i` assertion, no tests for actions or pages, missing pending/delete-error tests — each is cosmetic or restates mocks/markup, and the fix adds surface; the walk covers the add-link absence.
  - `[low]` `[reject]` Remaining intent-auditor observations (readings A–F) are descriptive and name no defect; no verification-gap findings.

## Verification

**Commands:**
- `npm run typecheck` -- passes
- `npm run test:unit -- tests/unit/tagsGroup.unit.spec.ts tests/unit/peopleGroup.unit.spec.ts` -- passes
- Scoped `npx eslint` on changed files and `git diff --check` -- clean

**Manual checks:**
- Ignored Playwright walk `tests/e2e/settings-tags.walk.spec.ts` on the e2e server (`bookeh_test`) at phone and wide widths: groups, counts, rename, system-name and in-use messages, merge and delete dialogs.

## Auto Run Result

Status: done

Settings now shows Tags, My genres and My themes after People, each value a List row with its copy count ("N books") and Rename, Merge and Delete. There is no Add link. Rename edits in place, offers the merge dialog on a name in use and shows the system-name message; Merge and Delete dialogs state the book count; no Undo or toast.

Files changed:
- `ManagedList.tsx`: `create`/`add` optional; SYSTEM_NAME field message.
- `settings/actions.ts`: rename, merge and delete tag actions (auth first, strict ids).
- `TagsGroup.tsx` (new), `settings/page.tsx`: three groups over sequential `tagUse` reads.
- `messages/en.json`, `messages/fi.json`: strings.
- `tests/unit/tagsGroup.unit.spec.ts`: one focused test.

Review: four layers; one low patch (Finnish empty-genre wording), no deferrals, all other findings rejected with reasons in the triage log. Follow-up review recommended: false.

Verification: typecheck passed; 41 unit tests passed (tagsGroup, peopleGroup, messages); scoped ESLint and `git diff --check` clean. Ignored walk `tests/e2e/settings-tags.walk.spec.ts` passed at 1300px and 390px against `bookeh_test`: headings, counts (2 and 0 books), no Add link in the label groups, system-name rejection, merge offer on a taken name with "No books move to" dialog, delete dialog with "No books lose it." and no Undo; phone screenshot inspected, no overflow. Walk remains uncommitted and ignored; fixture data cleaned.

Residual risks: Finnish wording ("Tunnisteet", "Omat genret", "Omat teemat", "kohteeseen") is unreviewed by Mika. Dialog counts are copy counts, so a wishlist-only Book that loses a label is not counted. Chromium only. No parallel worktrees; no push.
