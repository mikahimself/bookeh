---
title: '10.2 Reading switch and dates on Book detail'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_revision: '3b7da7105b074469cf7010f696e2df3de0f319dc'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Book detail still shows a two-way read / unread switch over 10.1's boolean compatibility action, so a user cannot start a Book, see how long they have been reading it, or fix its dates.

**Approach:** Replace the switch with unread / reading / read on top of `setRead()`, add the muted dates line and the reading-dates Picker on top of `setReadingDates()`, toast only the finish, and retire the boolean Book-detail action contract in the spine.

## Boundaries & Constraints

**Always:** FR-53/FR-54 and EXPERIENCE.md → Book detail (Reading and rating) and the Picked section of `mockups/reading-options.html`. Saves happen in place with no Undo; every result goes to `afterAction` (AD-7) so the shelf and server render follow. The Rating shows only while the switch shows read (FR-29). Dates are formatted by next-intl (`dateStyle: 'medium'`, as Book detail's other dates); "today" and day counts are `helsinkiToday()` / `finishedDays()` from `src/fields/readingDates.ts`. The Picker is `PickerFrame` (sheet on phone, dialog on wide; one overlay over Book detail, as Lend). Client checks the three rejections before sending; a server field error the client did not predict shows `errors.VALIDATION` under that field. Every new string in `messages/en.json` and `messages/fi.json`. The spine's "Until 10.2" line is replaced by the built contract in the same commit.

**Never:** Change select mode's Read (`toggleCopiesReadAction`, its toast and Undo), the services' transition rules, the collection, the schema, Currently reading, the Read filter or row endings (10.4). No Undo on Book detail's reading changes or date edits. No new Playwright spec committed.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Start | unread → tap Reading | saved; line "Since {today} · 1 day"; no toast; no Rating | Failure: `afterAction`, switch falls back |
| Finish | reading since S → tap Read | saved; toast "Finished {title} · {n} days" (no Undo); line "{S} – {today} · {n} days"; Rating shows | — |
| Direct read | unread → tap Read | saved; line only "Add dates"; no toast | — |
| Resume / stop | read → Reading; any → Unread | per FR-53; no toast; Unread shows no line | — |
| One date | read with only Started / only Finished | "Started {date}" / "Finished {date}"; the date is a Link | — |
| Dates edit | Link → Picker, change dates, Save | Picker closes; line and switch show the stored state; no toast | — |
| Finish via Picker | reading; fill Finished, Save | stored read; switch shows read; finish toast with n from the two dates | — |
| Rejections | finish < start; any date > today; Started cleared while reading | message under the field, Picker stays open, nothing sent | Server field error: shown under that field |
| Cancel | Picker Cancel / Back | closes, nothing saved | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/ReadAndRating.tsx` -- current two-way `TextSwitch` + `Rating` via `useSavedSwitch`, remount on toast Undo (`generation`), `useClaimUndoRefresh`. Becomes the three-way switch, dates line and Picker host. Takes `initial: Pick<UserBookState, 'state' | 'readingSince' | 'finishedAt' | 'rating'>` and the Book `title` (toast, Picker description).
- `src/app/(frontend)/(sections)/BookDetail.tsx:124` -- mounts `<ReadAndRating key={bookId} bookId initial={state} />`; `state` is the full `UserBookState` from `getUserBookState`; add `title={book.title}`. Its `day()` at :114 is the date-format idiom to copy client-side with `useFormatter`.
- `src/app/(frontend)/(sections)/actions.ts:93` -- `setReadAction` maps boolean ↔ `read|unread`; change to `{ bookId, state: ReadState }` → `{ state: UserBookState; finishedDays: number | null }` (call `setRead`, then `getUserBookState`). Add `setReadingDatesAction({ bookId, readingSince, finishedAt })` → `UserBookState` over `setReadingDates` (null or string inputs; the service checks the format). `toggleCopiesReadAction` stays as it is.
- `src/lib/books/setRead.ts`, `setReadingDates.ts` -- 10.1 services; read-only here. `setReadingDates` throws `VALIDATION` with `fields.readingSince` when Started is cleared on a Book being read; the collection hook throws field errors for future dates and finish-before-start / finish-without-read.
- `src/fields/readingDates.ts` -- `helsinkiToday()`, `finishedDays(start, finish)` (min 1), `isCalendarDate`; client-safe pure functions.
- `src/app/(frontend)/components/useSavedSwitch.ts` -- returns `[value, change]`; needs a way to take a stored value from outside (a Picker save that turns reading into read) without a remount that would reset the Rating.
- `src/app/(frontend)/(sections)/LendPicker.tsx` -- golden example: `PickerFrame` with a form, `TextField type="date" max={today}`, errors under fields, `settleAction`, toast/afterAction after `onClosed`, reset on each open. Picker gets Cancel from `PickerFrame`/Dialog.
- `src/app/(frontend)/components/Link.tsx` -- `ActionLink` for the date and "Add dates" Links.
- `src/app/(frontend)/components/TextSwitch.tsx` -- options as words, lowercased unless `properNames`.
- `messages/en.json`, `messages/fi.json` -- `detail.read` ("Read"/"Luettu") labels the switch; `collection.read`/`unread` exist; add the reading option and every new string.
- `tests/unit/readAndRating.unit.spec.ts` -- mocks `setReadAction`/`setRatingAction` and asserts the two-way switch; adapt to the three-way shape and new action input. `tests/unit/loansPage.unit.spec.ts:82` mocks the actions module (add the new action). `tests/int/toggleCopiesReadAction.int.spec.ts:77` executes `setReadAction` with booleans; adapt to states.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:473` -- "Until 10.2 …" line to replace with the built action contract.
- `playwright.config.ts` -- `webServer` on `bookeh_test` with `BOOKEH_SOURCES=fixture`; the uncommitted walk goes in `tests/e2e/*.walk.spec.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/(frontend)/(sections)/actions.ts` -- three-state `setReadAction` returning the stored state and `finishedDays`; new `setReadingDatesAction`; doc comments in the file's style.
- [x] `src/app/(frontend)/components/useSavedSwitch.ts` -- let the caller set the stored value (e.g. a third tuple element) so a Picker save updates the switch.
- [x] `src/app/(frontend)/(sections)/readingLine.ts` -- pure function from `{ state, readingSince, finishedAt }` and today to the line's case (none / since / range / started / finished / addDates) with its day count.
- [x] `src/app/(frontend)/(sections)/ReadingDatesPicker.tsx` -- Picker titled "Reading dates", title muted under it, Started and Finished Date fields (`max` today, seeded with stored dates or empty), Cancel and Save; client rejections under fields; reset at each open; result handed back after the close.
- [x] `src/app/(frontend)/(sections)/ReadAndRating.tsx` -- three-way switch, Rating only when read, dates line with Links opening the Picker, finish toast (switch: from `finishedDays`; Picker: reading → read, n from its dates), no other toast.
- [x] `src/app/(frontend)/(sections)/BookDetail.tsx` -- pass `title`.
- [x] `messages/en.json`, `messages/fi.json` -- reading option, line wordings, Picker title/labels/Save, rejection messages, finish toast.
- [x] `tests/unit/readAndRating.unit.spec.ts`, `tests/unit/loansPage.unit.spec.ts`, `tests/int/toggleCopiesReadAction.int.spec.ts` -- adapt to the new contract; add one focused unit test of `readingLine` covering the five cases (the case selection and day counts are logic).
- [x] `ARCHITECTURE-SPINE.md` -- replace the "Until 10.2" line with `setReadAction` / `setReadingDatesAction` shapes.
- [x] Uncommitted `tests/e2e/reading.walk.spec.ts` -- phone and desktop walk of each transition, the Picker's three rejections, Picker finish and the finish toast; result under `## Auto Run Result`.

**Acceptance Criteria:**
- Given Book detail (sheet and panel) on a held Book, when it renders, then the Reading and rating group shows an unread / reading / read Text switch, and the Rating only while read.
- Given each FR-53 transition tapped on the switch, when it saves, then the state persists with no Undo, and only Reading → Read toasts "Finished {title} · {n} days".
- Given each reading state, when the group renders, then the muted line reads exactly as FR-54 says (nothing when unread), each date and "Add dates" being a Link.
- Given the Picker open, when Save is pressed with a finish before the start, a date after today, or Started cleared on a Book being read, then the message shows under that field and nothing is saved; with valid dates it saves, closes and the line follows; filling Finished on a Book being read saves it as read and toasts.
- Given select mode, when Read is used on a selection, then its existing toast and Undo show and no finish toast.
- Given the strings, when the UI is in Finnish, then every new string is translated.
- Given the spine, when this story is committed, then its Book-detail Read action contract matches the code.

## Spec Change Log

## Review Triage Log

### 2026-11-06 — Review pass
- verdicts: 27 findings — high 0, medium 6, low 15, false 6, maybe-false 0
- findings:
  - `[medium]` `[patch]` Verification: Picker save success path (switch to read, finish toast, close) untested — pre-verified; added "finishes via the Picker" unit case (switch read, Rating, range line, one toast, no toast on a later edit).
  - `[medium]` `[patch]` Verification: `setReadingDatesAction` and the Picker's server field-error branch never run — pre-verified; added a unit case resolving `fields.finishedAt` (message under Finished, Picker open). The action-wrapper int test is not added: thin wrapper over the tested service, no AC names it.
  - `[false]` `[reject]` Intent: Rating only while read diverges from "as now" — PRD FR-29/FR-54 say the Rating shows once the Book is read; the PRD wins over the epic's wording.
  - `[false]` `[reject]` Intent: line test checks case selection, not wording — the AC asks for a test only of logic beyond markup; the wording is markup, the case choice and day counts are the logic tested.
  - `[false]` `[reject]` Intent: overlay mocked in unit tests — the sheet/dialog is the shared `PickerFrame`; the uncommitted walk is the sanctioned check (spine Tests row) and exercised both widths.
  - `[medium]` `[patch]` Intent: server field-error path has no evidence — same root as the verification finding above; same patch.
  - `[medium]` `[patch]` Intent: Picker finish has no committed test — same root as the Picker success finding; same patch.
  - `[low]` `[reject]` Intent: Unread → Read and Read → Reading `finishedDays` not exercised at the action — the action passes the service's value through; 10.1's setRead matrix covers it; another case adds nothing a regression would hit.
  - `[false]` `[reject]` Intent: select mode not re-tested — its code is unchanged in the diff; existing toggleCopiesReadAction cases still run and pass.
  - `[false]` `[reject]` Intent: spine update — descriptive confirmation, no defect.
  - `[low]` `[patch]` Intent: switch group still labelled "Read" — same root as the blind finding below; same patch.
  - `[low]` `[patch]` Intent: `readingLine` branch for reading without a start — same as blind finding; comment corrected.
  - `[false]` `[reject]` Intent: day count uses today at render — the designed behaviour (Design Notes); server/client agree except across midnight.
  - `[low]` `[patch]` Blind: spine says `finishedDays` drives the only finish toast — the Picker toasts too; spine lines corrected to name both toasts.
  - `[medium]` `[patch]` Blind: Picker-finish AC has no committed test — same root as the verification finding; same patch.
  - `[low]` `[patch]` Blind: int loop lost the `readingSince` assertion — confirmed in the diff; restored `readingSince: state === 'unread' ? null : expect.any(String)`.
  - `[low]` `[patch]` Blind: line and switch can disagree while a call is in flight; Picker/switch overlap; Rating flash on failed Read — the in-flight window and optimistic Rating are the switch's designed behaviour; the overlap needs a switch tap and a Picker save within one round trip. Only the wrong comment ("never lags the switch") was patched; a guard would add branching for a sub-second case.
  - `[low]` `[reject]` Blind: stale `onSettled` closure when the Picker closes mid-save — needs a close during a save plus a switch change before it settles; unlikely, fix adds a ref.
  - `[medium]` `[patch]` Blind: focus drops to body when the opening Link unmounts after a save — confirmed ("Add dates" → "Started {date}"); the group is now a `tabIndex={-1}` target focused after the close, as CopyLine does.
  - `[low]` `[reject]` Blind: both range Links open the Picker without focusing the tapped field; Link names are bare dates — the surrounding line names them; focusing per field adds a parameter. Not worth it under the low rule.
  - `[low]` `[patch]` Blind: switch group labelled "Read" — new `detail.reading` "Reading" / "Lukeminen"; tests and the walk query it.
  - `[low]` `[reject]` Blind: `setReadAction` reads the state after the transaction — a concurrent write would make the answer the current stored state, which is what the line should show; no harm named.
  - `[low]` `[patch]` Blind: `readingLine` comment describes an impossible case — comment now says the branch exists only for the type.
  - `[low]` `[reject]` Edge: `set()` while a newer switch call is in flight lets the Picker value win — needs a switch tap and a Picker save overlapping; guard adds state.
  - `[low]` `[reject]` Edge: Picker closed mid-save, switch tapped, then `storeState` — same overlap; unlikely, guard adds state.
  - `[low]` `[reject]` Edge: Picker open past Helsinki midnight keeps the old today — the deliberate LendPicker rule (today fixed at open, Epic 6 retro decision 4).
  - `[low]` `[reject]` Edge: Picker reopened while an earlier closed save still runs shows old dates — needs reopen inside one round trip; the fields reseed from the stored dates once it lands.

## Design Notes

The line's day count while reading is `finishedDays(readingSince, helsinkiToday())`, computed on render; the server and client agree except across midnight, which is acceptable for a muted label.

After any successful save the Group sets its local reading values from the returned `UserBookState` (the line reads from them, not from props, so it never lags the switch), sets the switch's stored value, and calls `afterAction` so the server render and shelf follow. The toast-Undo remount (`generation`) stays: a bulk Undo elsewhere still reseeds from the refreshed props.

Messages, en / fi (days as ICU plural `{n, plural, one {# day} other {# days}}` / `{# päivä} {# päivää}`):
- option: "reading" / "kesken"
- line: "Since {date} · {days}" / "{date} alkaen · {days}"; "{start} – {finish} · {days}" (both); "Started {date}" / "Aloitettu {date}"; "Finished {date}" / "Luettu {date}"; "Add dates" / "Lisää päivät"
- Picker: "Reading dates" / "Lukupäivät"; "Started" / "Aloitettu"; "Finished" / "Luettu"; "Save" / "Tallenna"
- errors: "Can't be before the start." / "Ei voi olla ennen aloitusta."; "Can't be in the future." / "Ei voi olla tulevaisuudessa."; "A book being read has a start date." / "Kesken olevalla kirjalla on aloituspäivä."
- toast: "Finished {title} · {days}" / "{title} luettu · {days}"

## Verification

**Commands:**
- `npm run typecheck` -- passes.
- `npm run test:unit -- --maxWorkers=2` -- full suite passes (shared fixtures and action mocks changed).
- `npm run test:int -- toggleCopiesReadAction setRead` -- passes on `bookeh_test`, push disabled.
- scoped `npx eslint` on changed files, `git diff --check` -- clean.
- `npx playwright test tests/e2e/reading.walk.spec.ts` -- walk passes on phone and desktop projects; not committed.

## Auto Run Result

`npx playwright test tests/e2e/reading.walk.spec.ts` (uncommitted, chromium at 1300px panel and 390px sheet, fixture server on `bookeh_test`): 1 passed (17.5 s). Walked per width on a fresh Book: unread shows no line and no Rating; Reading → "Since {today} · 1 day", stored start today, no toast; Read → toast "Finished {title} · 1 day" with no Undo, range line, Rating shown; Read → Reading keeps start and clears finish; Unread clears both, no line; Unread → Read stores no dates, line "Add dates", no toast; "Add dates" → Picker (title muted) → Started only → "Started {date}"; finish before start and a future finish rejected under Finished with nothing stored; valid finish → range line, no toast; Esc cancels without saving; on a Book being read, clearing Started rejected with "A book being read has a start date."; filling Finished saves read, switch shows read, Rating shows, toast "Finished {title} · 15 days". Screenshots: /private/tmp/bookeh-reading-{1300,390}-{finished,picker-finish}.png.

Status: done

**Summary.** Book detail's two-way read switch is now unread / reading / read on `setRead()` (FR-53), with the Rating only while read, a muted dates line in FR-54's five wordings whose dates and "Add dates" are Links, and a reading-dates Picker (sheet on phone, dialog on wide) on `setReadingDates()`. Only Reading → Read toasts "Finished {title} · {n} days", from the switch or the Picker, with no Undo. Select mode is unchanged. The spine's "Until 10.2" line is replaced by the built action contracts.

**Files changed.**
- `src/app/(frontend)/(sections)/actions.ts` — `setReadAction({ bookId, state })` → `{ state: UserBookState; finishedDays }`; new `setReadingDatesAction`.
- `src/app/(frontend)/(sections)/ReadAndRating.tsx` — three-way switch, dates line, Picker host, finish toast, focus target after the Picker closes.
- `src/app/(frontend)/(sections)/ReadingDatesPicker.tsx` — new Picker: Started/Finished Date fields, client rejections, server field errors, result after close.
- `src/app/(frontend)/(sections)/readingLine.ts` — pure case selection and day counts for the line.
- `src/app/(frontend)/components/useSavedSwitch.ts` — third tuple element sets the stored value from another control.
- `src/app/(frontend)/(sections)/BookDetail.tsx` — passes the title.
- `messages/en.json`, `messages/fi.json` — every new string in both languages.
- `ARCHITECTURE-SPINE.md` — Book-detail and select-mode Read action contracts, both finish-toast sources.
- Tests: `readAndRating.unit.spec.ts` (three-way switch, Picker finish, rejections, server field error), new `readingLine.unit.spec.ts`, `toggleCopiesReadAction.int.spec.ts` (states, `readingSince` restored), action mocks in `loansPage`, `collectionList`, `tests/helpers/collectionPage.ts`.
- `epic-10-context.md` — recompiled after 10.1's spine changes.

**Review.** 27 findings from four layers (log above): 12 patched across 9 entries (3 medium entries: Picker success test, server field-error test, focus after close; 6 low: spine toast wording, switch label, int `readingSince`, two comments), 15 rejected with reasons in each row, none deferred.

**Follow-up review recommendation: true** (first pass, 3 medium entries patched). The unverified risk: focus landing on the reading group after a Picker save is checked only in jsdom with a mocked `PickerFrame`; the walk does not assert focus on the real Base UI sheet/dialog. A walkthrough on the real surface should also settle the phone sheet having no Cancel button (closes by Back, Esc or tapping outside, as Lend), against EXPERIENCE.md's "Cancel and Save".

**Verification (parent, after patches).**
- `npm run typecheck` — passed.
- `npm run test:unit -- --maxWorkers=2` — 102 files / 1,350 tests passed (the logged "boom" trace is `saveEntryAction.unit.spec.ts`'s deliberate error).
- `npm run test:int -- toggleCopiesReadAction setRead` — 2 files / 10 tests passed on `bookeh_test`, push disabled.
- Scoped ESLint and `git diff --check` — clean.
- Uncommitted `tests/e2e/reading.walk.spec.ts` — passed at 1300px and 390px after the patches (16.9 s); what it saw is recorded above.
- Matrix audit — every row covered: Start/Finish/Direct read/Resume-stop/One date by `readingLine` and `readAndRating` units plus the walk; Dates edit and Finish via Picker by the new unit case and the walk; Rejections by the unit rejection and server-field cases and the walk; Cancel by the walk (Esc).

**Residual risks.** The phone sheet has no Cancel button (see above). Overlapping switch and Picker saves within one round trip can leave the line briefly out of step (rejected as low). No schema change, so no production-dump rehearsal applies.
