---
title: "7.4 [H15] People with wishlist entries can't be deleted"
type: 'feature'
created: '2026-10-27'
status: 'done'
baseline_revision: 'a7b93b625cd5ba9f9cfedd685472ee3b5c119a6c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
deferred:
  - summary: >-
      A wishlist entry for a Person committed concurrently with that Person's delete or merge silently becomes the owner's own wish.
    evidence: |-
      deletePerson and mergePerson check (or collect) entries, then delete the Person in one transaction without locking it; wishlist_entries.for_person_id is nullable with ON DELETE set null (migration 20261027_125540_wishlist_entries, Story 7.2), so an entry committed in between is cleared instead of failing as a loan does (loans.person_id NOT NULL). Single user in Phase 1 and no frontend writes entries until 7.6. Closed by the Epic 6 retro foreign-key rule (references restrict) when a story takes it on; documented in the people.ts doc comments.
    location: >-
      src/lib/people/people.ts deletePerson / mergePerson
    severity: low
---

<intent-contract>

## Intent

**Problem:** `lib/people` knows only loans: `deletePerson()` deletes a Person who is the recipient of a wishlist entry (the FK `wishlist_entries.for_person_id` is `ON DELETE set null`, so the gift silently turns into the owner's own wish), `mergePerson()` leaves entries on the deleted source, and `personUse()` and Settings → People show loans only (FR-34, AD-18).

**Approach:** Count, move and refuse on `wishlist-entries.forPerson` exactly as on `loans.person`: `PersonUse` gains `entries`, `deletePerson` fails `PERSON_IN_USE` when any entry (open or closed) names the Person, `mergePerson` repoints every entry's `forPerson` before deleting the source. Settings → People shows "2 loans, 1 wish" and treats a Person with entries as in use.

## Boundaries & Constraints

**Always:**
- Entries count open **and** closed (`closedAt` ignored) in delete, merge and `personUse`.
- Reads and writes through `gateway.*` on the caller's context, filtered on `owner = tx.user.id` as the loan reads are (the admin held to their own rows). `lib/people` still imports no other service: it reads the `wishlist-entries` collection directly, as it does `loans`.
- Merge: in the existing transaction, loans then entries moved one after the other (no `Promise.all`, AD-16), then the source deleted. Only `forPerson` changes; `wishlist`, `book`, `closedAt` untouched.
- Delete: the loan count first; the entry count only when there are no loans; `PERSON_IN_USE` before any write.
- `PersonUse = Named & { loans: number; entries: number }`; `entries` zero included. One `find` of the viewer's entries with `select: { forPerson: true }`; entries without `forPerson` count for no one.
- Settings → People: row meta lists the non-zero parts, loans first: "2 loans, 1 wish", "1 wish", "3 loans"; both zero shows "0 loans" (as today). The in-use rule fires when `loans + entries > 0`; its body and the merge confirmation name the same uses. English and Finnish strings, terse voice; user-typed names stay where they need no inflection.
- `errors.PERSON_IN_USE` (toast for a stale list) mentions wishes too, both languages.
- Spine: the `PersonUse` line in Shared shapes (`ARCHITECTURE-SPINE.md:514`) becomes `Named & { loans: number; entries: number }` without "Epic 7 adds entries", in this commit. Doc comments in `people.ts` that say "Epic 7 adds/moves entries" are rewritten.

**Never:**
- No migration, no FK change (the Epic 6 retro restrict/cascade rule is not applied in this story), no collection change.
- No `lib/wishlists`, no wishlist screens, no change to `ManagedList.tsx` behaviour (its generic `count` stays a number; PeopleGroup feeds it `loans + entries` and builds the text itself).
- No change to `lendingPeople()` (the Lend picker ranks by loans only).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Delete, open entry | A's Person P is `forPerson` of an open entry, no loans | `deletePerson(asA, P)` fails; P and the entry unchanged | `DomainError('PERSON_IN_USE')` |
| Delete, closed entry | P only on a closed entry | same refusal | `PERSON_IN_USE` |
| Delete, unused | P has no loans, no entries; an own-wish entry (no recipient) exists | deleted | — |
| Merge | Source S has a loan, an open and a closed entry; target T one entry; Person O one entry | S deleted; S's loan and both entries now T; T's and O's entries unchanged; `closedAt` kept | — |
| personUse | A: Antti 2 loans + 1 open + 1 closed entry, Liisa none, an own wish; B has entries for B's Person | A sees `[{Antti, loans: 2, entries: 2}, {Liisa, loans: 0, entries: 0}]`; B's rows never appear; admin sees only their own People | — |
| Settings row | Person with `loans: 2, entries: 1` | meta "2 loans, 1 wish"; Delete opens the in-use dialog | — |
| Settings row, wish only | `loans: 0, entries: 1` | meta "1 wish"; Delete opens the in-use dialog (not the delete confirmation) | — |

</intent-contract>

## Code Map

- `src/lib/people/people.ts:12-13` -- `PersonUse` type; add `entries`, rewrite comment. `:162-172` `loansOf` (pattern for an `entriesOf` reading `wishlist-entries` where `forPerson = id` and `owner = tx.user.id`, `select: { forPerson: true }`). `:174-204` `mergePerson`: add an entry loop after the loan loop (`gateway.updateByID(tx, { collection: 'wishlist-entries', id, data: { forPerson: targetId }, depth: 0 })`); update the doc comment (no longer "Epic 7 moves wishlist entries too"; a concurrently committed entry for the source would be cleared to the owner's own wish by the FK's `ON DELETE set null` — say so, as the loan race is described). `:206-229` `deletePerson`: after the loan count, a `gateway.count` on `wishlist-entries` with `forPerson = id` and `owner`; doc comment. `:231-261` `personUse`: a third `find` on `wishlist-entries` (`where: own`, `select: { forPerson: true }`), skip null `forPerson` (use `idOf` only when present); doc comment.
- `src/collections/WishlistEntries.ts` -- `forPerson` is `ownedRelation('people')`, optional; `closedAt` date. Read-only. Its doc already says a People merge repoints `forPerson` (7.4).
- `src/lib/payload/ref.ts` -- `idOf()` for relation values. Read-only.
- `src/app/(frontend)/(sections)/settings/PeopleGroup.tsx` -- map `count: loans + entries`; keep a `Map<id, PersonUse>` (or closure lookup) to build the uses text `uses(person)`; `count`, `mergeBody` and `inUse.body` use it; update the doc comment.
- `src/app/(frontend)/(sections)/settings/ManagedList.tsx:17,46-49,177-190` -- comments only if they say "a Person's loans"/"a Person with loans" (make them "loans or wishes"). No behaviour change.
- `src/app/(frontend)/(sections)/settings/actions.ts:105` -- doc comment: "any loan or wishlist entry".
- `src/app/(frontend)/(sections)/settings/page.tsx:70` -- calls `personUse(ctx)`; unchanged.
- `messages/en.json:58-64`, `messages/fi.json:58-64` -- settings strings. Proposed: `personCount` stays the loans part (`# loan`/`# loans`; fi `# laina`/`# lainaa`); new `personWishes` (`# wish`/`# wishes`; fi `# toive`/`# toivetta`); `personMergeBody` → "Moves to {target}: {uses}." (fi "Henkilölle {target} siirtyy: {uses}."); new `personMergeNone` "Nothing moves to {target}." (fi "Henkilölle {target} ei siirry mitään."); `personInUseBody` → "They have {uses}, returned and closed ones included, so they can't be deleted." (fi "Hänellä on {uses}, palautetut ja suljetut mukaan lukien, joten häntä ei voi poistaa."). `messages/*.json:348` `errors.PERSON_IN_USE` → "This person has loans or wishes, so they can't be deleted." (fi "Henkilöä ei voi poistaa, koska hänellä on lainoja tai toiveita.").
- `tests/int/peopleService.int.spec.ts` -- helpers `personAs`, `loanAs`, `stored`, `failure`, `shared` Book; `:295` delete test, `:313` personUse test (expected objects gain `entries`), `:261` merge test. Add a wishlist + entry helper modelled on `tests/int/wishlistEntries.int.spec.ts:40-64` (`wishlistAs`, `entryAs` through the gateway, `nameKey: 'ignored'`).
- `tests/unit/peopleGroup.unit.spec.ts` -- key-echo translator; fixtures `antti`/`leena` gain `entries`; update the `personCount`/`personInUseBody` expectations to the new values.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:514` -- `PersonUse` line.

## Tasks & Acceptance

**Execution:**
- `src/lib/people/people.ts` -- `PersonUse.entries`; entries in `deletePerson`, `mergePerson`, `personUse`; doc comments.
- `src/app/(frontend)/(sections)/settings/PeopleGroup.tsx` -- uses text, in-use on loans + entries, merge body; doc comment.
- `src/app/(frontend)/(sections)/settings/ManagedList.tsx`, `actions.ts` -- doc comments only.
- `messages/en.json`, `messages/fi.json` -- strings above.
- `tests/int/peopleService.int.spec.ts` -- delete refused for open and for closed entry (and an own wish does not block an unused Person); merge moves entries (open and closed) and leaves others' alone; `personUse` counts entries, other user and admin isolated.
- `tests/unit/peopleGroup.unit.spec.ts` -- updated expectations; one case: a wish-only Person shows its wish count and Delete opens the in-use dialog.
- `ARCHITECTURE-SPINE.md` -- `PersonUse` line.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `7-4-h15-people-with-wishlist-entries-can-t-be-deleted: done` when done.

**Acceptance Criteria:**
- Given a Person is the recipient of any entry, open or closed, when `deletePerson` runs, then it fails with `PERSON_IN_USE` and nothing is written.
- Given a merge of a Person with entries, when `mergePerson` runs, then every entry of the source names the target and the source is gone, in one transaction.
- Given People with loans and entries, when `personUse` runs, then each Person carries `loans` and `entries` counts, and Settings → People shows them as "2 loans, 1 wish".
- Given the matrix rows, then integration tests cover delete, merge and the count.

## Spec Change Log

## Review Triage Log

### 2026-10-27 — Review pass
- verdicts: 18 findings — high 0, medium 0, low 9, false 9, maybe-false 0
- findings:
  - `[low]` `[defer]` Edge: an entry committed between the entry count and the delete in `deletePerson` is cleared to an own wish by `ON DELETE set null` — real race; fix needs a row lock or the FK migration (the Epic 6 retro restrict rule), not a direct correction; FK predates this story (7.2). Recorded in `deferred`.
  - `[low]` `[defer]` Edge: same race in `mergePerson` between `entriesOf` and deleting the source — same root cause and route as above.
  - `[low]` `[patch]` Verification gap: the merge rollback test checks no entry (AD-16) — the test now creates an entry for the source and asserts `forPerson` is still the source after the rollback.
  - `[low]` `[reject]` Verification gap: the zero-use merge body ("Nothing moves to …") is untested — display text; no AC or spine rule names it (CLAUDE.md, tests at a functional minimum).
  - `[false]` `[reject]` Intent: "2 loans, 1 wish" is only checked through a key-echo unit test, never real strings — the project tests UI text this way throughout; rendered strings are reviewed in the messages files, and Playwright is limited to scan-to-save and shop check.
  - `[false]` `[reject]` Intent: the service returns separate `loans`/`entries`, not one combined count — the spine's `PersonUse` is the contract; the UI sums them for in-use and builds the "2 loans, 1 wish" text from the parts, which a single number could not.
  - `[false]` `[reject]` Intent: counting only entries with `owner = viewer` is narrower than "any entry" — `forPerson` is an `ownedRelation`, so only the Person's owner can have entries naming them.
  - `[low]` `[defer]` Intent: the "no entry ever points at a deleted Person" invariant holds only check-then-delete — same race as the Edge rows.
  - `[low]` `[patch]` Intent: merge atomicity for entries untested — same patch as the Verification gap rollback row.
  - `[false]` `[reject]` Intent: `epic-7-context.md` changes are unrelated to 7.4 — it is this run's recompile of the epic context (epics.md changed in 7.3), a workflow artifact committed with the run.
  - `[low]` `[patch]` Blind: uses joined with a bare comma inside the in-use and merge sentences — sentences now join with `Intl.ListFormat` (conjunction, "2 loans and 1 wish" / "2 lainaa ja 1 toive"); the row meta keeps ", ".
  - `[low]` `[patch]` Blind: "returned and closed ones included" is wrong for a loans-only or wish-only Person — `personInUseBody` is now "They have {uses}, so they can't be deleted." (fi "Hänellä on {uses}, joten häntä ei voi poistaa.").
  - `[low]` `[patch]` Blind: `personUse` fetches every own wish (no recipient) only to skip it — the entries `find` now also filters `forPerson exists`.
  - `[false]` `[reject]` Blind: the `epic-7-context.md` edit belongs to another story and the 7.15 hand-off is not an AC — the file is the recompiled context; the hand-off is already 7.15's AC in `epics.md` (committed with 7.3).
  - `[low]` `[defer]` Blind: the FK race is deferred to no story — same race as the Edge rows; now in `deferred` and the residual risks.
  - `[false]` `[reject]` Blind: sprint-status marks 7.4 done before review — the workflow sets done at finalization and commits the spec with it; nothing ships between.
  - `[low]` `[patch]` Blind: EXPERIENCE.md still gives "2 loans" as the People use example — Settings row example now reads "for a Person \"2 loans, 1 wish\"".
  - `[false]` `[reject]` Blind: `uses()` falls back to `''` for an unknown id — the items are built from the same `people` array as the lookup map, so the id is always present; the broken sentence cannot occur.
  - `[false]` `[reject]` Blind: the in-use body is matched with `exact: false` — the dialog renders the body and the merge offer in one text node; the JSON echo pins the uses value exactly.

## Design Notes

**Why not a `ManagedList` change.** The generic list needs one number for "in use" and the merge picker; PeopleGroup is the only place that knows a Person has two kinds of use, so it builds the text from its own `PersonUse` and passes `loans + entries` as `count`.

**Race.** As with loans, a check-then-delete in one transaction leaves a race with a concurrent entry create. For loans the NOT NULL column turns it into `INTERNAL`; `for_person_id` is nullable with `ON DELETE set null`, so the entry would silently become the owner's own wish. Single user, Phase 1; the Epic 6 retro FK rule (restrict) closes it when it lands. Recorded in the doc comment, not fixed here.

## Verification

**Commands:**
- `npx tsc --noEmit --incremental false` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass.
- `npm run test:reset && npm run test:int` -- expected: all pass, including `peopleService.int.spec.ts`.

## Auto Run Result

**Summary.** A Person who is the recipient of any wishlist entry, open or closed, can no longer be deleted (`PERSON_IN_USE`); merging People moves their entries' `forPerson` to the target in the same transaction; `personUse()` returns `entries` beside `loans`. Settings → People shows "2 loans, 1 wish", treats a wish-only Person as in use, and names the uses in the in-use and merge dialogs.

**Files changed.**
- `src/lib/people/people.ts` -- `PersonUse.entries`; `entriesOf`; entries in `mergePerson`, `deletePerson`, `personUse`; doc comments (race noted).
- `src/app/(frontend)/(sections)/settings/PeopleGroup.tsx` -- uses text (", " in row meta, `Intl.ListFormat` in sentences), in-use on loans + entries, merge body.
- `src/app/(frontend)/(sections)/settings/ManagedList.tsx`, `actions.ts` -- doc comments.
- `messages/en.json`, `messages/fi.json` -- `personWishes`, `personMergeNone`, reworded `personMergeBody`, `personInUseBody`, `errors.PERSON_IN_USE`.
- `tests/int/peopleService.int.spec.ts` -- delete (open, closed, own wish), merge (open/closed moved, others kept), rollback with an entry, `personUse` counts with other user and admin.
- `tests/unit/peopleGroup.unit.spec.ts` -- fixtures with entries, row meta and sentence text, wish-only Person in use.
- `ARCHITECTURE-SPINE.md` -- `PersonUse` line.
- `EXPERIENCE.md` -- Settings use example for a Person (review patch).
- `epic-7-context.md` -- recompiled at the start of the run (epics.md had changed in 7.3).
- `sprint-status.yaml` -- 7.4 done.

**Review.** One pass, 18 findings (low 9, false 9). Patched 5 entries, all low: rollback test with an entry, list conjunction in sentences, in-use wording, `forPerson exists` filter, EXPERIENCE.md example. Deferred 1 entry (low): concurrent entry vs delete/merge race through `ON DELETE set null`. Rejected: zero-use merge body test (no AC), and the false rows, each with its reason in the triage log.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 5.

**Verification.** After implementation and again after the review patches: `tsc --noEmit --incremental false` clean; lint 0 errors (56 pre-existing warnings); `test:unit` 969 passed; `test:reset && test:int` 615 passed (73 files). Matrix audit: all 7 rows covered by passing tests.

**Residual risks.**
- An entry for a Person committed concurrently with that Person's delete or merge becomes the owner's own wish (`for_person_id ON DELETE set null`) until the Epic 6 retro FK rule lands.
- "wish"/"toive" is the new user-facing count noun for entries for a Person, taken from the story's AC.

