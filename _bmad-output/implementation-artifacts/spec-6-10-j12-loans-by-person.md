---
title: '6.10 [J12] Loans by person'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_revision: '5583079c44a3548d9b10b41bf89423a9e90a9552'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `/loans` (6.9) only lists open loans by date. Mika cannot see everything one borrower has, such as all of Antti's books, at a glance (FR-37, EXPERIENCE.md Loans).

**Approach:** Add a by person / by date text switch above the loans. By person groups the open loans under each borrower's name as typed, and each row shows the copy and "Since {date}". The choice is a device preference in the existing `bookeh_prefs` cookie (`loans` key, default `person`). The page reads the cookie at render, so the first paint is right. The switch changes the view at once on the client and saves through `setDevicePrefsAction`, like the collection's layout and size.

## Boundaries & Constraints

**Always:**
- The page reads `devicePrefs()` and passes `loans` as the initial order. `DEFAULT_PREFS.loans` is already `'person'`, and a missing or unknown value falls back to it (`parseDevicePrefs`, unchanged).
- A new client component, `LoansOrder` (`(sections)/loans/LoansOrder.tsx`), takes `initial: DevicePrefs['loans']` and two server-rendered nodes, `byPerson` and `byDate`. It renders the `TextSwitch` and then only the chosen node. The order comes from `useSavedSwitch(initial, (loans) => setDevicePrefsAction({ loans }))`, so the switch changes at once, needs no server round trip, and reports a failed save the way the collection's switches do. Its options are written inline, because `prefs.ts` imports `next/headers` (as `CollectionTools` notes).
- Switch: `TextSwitch` with `label={t('order')}` and options `person` → `t('orders.person')`, `date` → `t('orders.date')`, in that order (as in the mock-up). It sits in a tools row (`pt-4`) above the list, and it is shown above the loans and above Nothing lent, but not with Load failed.
- By date: exactly the 6.9 list (the same `LoanRow`s and the same `loans.since` line).
- By person: one group per Person (`person.id`). Groups are ordered by `person.name` with `new Intl.Collator(await getLocale())`, which is the alphabetical order the mock-up shows (Antti before Leena, although Leena's loan is older). Inside a group, rows keep `openLoans()` order, longest out first. Each group is an `<h3 className="text-heading-group text-text-muted">` holding the name exactly as stored: no `ui-case`, never lowercased. A `<ul>` of `LoanRow`s follows, whose line is `loans.sinceDate` "Since {date}". The date is formatted as in 6.9 (`format.dateTime(new Date(`${since}T12:00:00Z`), { dateStyle: 'medium' })`).
- Both nodes are built from the same `items` (after the unreadable-Book filter). The row `href`, `replace` and `open` props are as in 6.9 in both orders.
- Strings in `messages/en.json` and `messages/fi.json`, namespace `loans`:
  - `order`: en "Order", fi "Järjestys"
  - `orders.person`: en "By person", fi "Henkilöittäin"
  - `orders.date`: en "By date", fi "Päivämäärän mukaan"
  - `sinceDate`: en "Since {date}", fi "{date} alkaen"
- Tokens only. The switch buttons are already tap-high on the phone (`max-wide:min-h-tap`).

**Never:**
- No returned group and no Returned Link on rows (6.11). No Lent before (6.12).
- No change to `openLoans`, `lib/loans`, `prefs.ts`, `actions/prefs.ts`, `TextSwitch`, `useSavedSwitch` or `LoanRow`.
- No schema change and no spine change: `DevicePrefs.loans` already exists in the spine's Device preferences convention.
- No URL parameter for the order, and no client fetch.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| By person, first paint | No cookie. Loans: Leena 2 Jul (Puhdistus), Antti 12 Sep (Sinuhe, two copies) | "By person" is pressed. Heading "Antti" with two rows, "Since Sep 12, 2026", then heading "Leena" with Puhdistus, "Since Jul 2, 2026" | — |
| By date cookie | `loans: 'date'` | "By date" is pressed. The 6.9 list: Puhdistus "Leena · since Jul 2, 2026", then the two Sinuhe rows | — |
| Switch | By person shown, tap "By date" | The list changes at once to by date. `setDevicePrefsAction({ loans: 'date' })` is called | Save fails → the existing failure toast and the switch returns to `person` |
| Name as typed | Person "de Vries" | Heading reads "de Vries" and is not lowercased by CSS | — |
| Finnish order | `fi`, People "Ähtäri", "Öhman", "Aalto" | Groups in Finnish order: Aalto, Ähtäri, Öhman | — |
| Nothing lent | No open loans | The switch, then "Nothing lent" and its remark | — |
| Read fails | `openLoans` throws | Load failed only, with no switch | Try again refreshes |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/loans/page.tsx`: the 6.9 Loans page. Add the `devicePrefs()` read (`import { devicePrefs } from '../../prefs'`), `getLocale` from `next-intl/server`, the by person grouping and `LoansOrder`. Update the header comment (by person and by date).
- `src/app/(frontend)/(sections)/loans/LoanRow.tsx`: reused as is. `line` is the second muted line.
- `src/app/(frontend)/(sections)/CollectionDisplay.tsx:38-41`: the `useSavedSwitch` and `setDevicePrefsAction` pattern to copy.
- `src/app/(frontend)/(sections)/CollectionTools.tsx:39-56`: the `TextSwitch` usage and the inline-options note.
- `src/app/(frontend)/components/TextSwitch.tsx`: `label`, `value`, `options`, `onChange`. It lowercases options through `ui-case` (the mock-up does the same).
- `src/app/(frontend)/components/useSavedSwitch.ts`: returns `[value, change]`.
- `src/app/(frontend)/actions/prefs.ts`: `setDevicePrefsAction(patch)` validates `{ loans }` already.
- `src/app/(frontend)/prefs.ts:14,36`: `LOANS_ORDERS`, `DEFAULT_PREFS.loans = 'person'`, `DevicePrefs['loans']`.
- `src/lib/shelf/filterValues.ts:61`: an `Intl.Collator(locale)` precedent.
- `messages/en.json:289-304`, `messages/fi.json:289-304`: the `loans` namespace. `tests/unit/messages.unit.spec.ts` checks key parity.
- `tests/unit/loansPage.unit.spec.ts`: the existing page tests. They mock next-intl (with `getLocale` → `'en'`), `next/navigation` and `next/link`. Add mocks for `@/app/(frontend)/prefs`, so `devicePrefs` can be set per test (see `tests/unit/collectionPage.unit.spec.ts:84-88`), and for `@/app/(frontend)/actions/prefs`. The existing 6.9 tests set `loans: 'date'`.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/(sections)/loans/LoansOrder.tsx`: a new client component as described under Always, with a doc comment (EXPERIENCE.md Loans, Text switch; spine Device preferences).
- `src/app/(frontend)/(sections)/loans/page.tsx`:
  - Read `devicePrefs()` and `getLocale()`.
  - Build `byDate` (the 6.9 `<ul>`) and `byPerson`, the groups as described under Always.
  - Wrap the list or Nothing lent in `LoansOrder`, and leave `LoadFailed` outside it.
- `messages/en.json`, `messages/fi.json`: the four `loans` strings.
- `tests/unit/loansPage.unit.spec.ts`:
  - The 6.9 tests run with `loans: 'date'`.
  - New: by person, the default: headings in name order, rows under each, and "Since {date}".
  - New: the heading is not `ui-case`.
  - New: tapping "By date" shows the by date rows and calls `setDevicePrefsAction({ loans: 'date' })`.
  - New: the cookie's `date` is pressed on first render.
  - Every I/O matrix row has a covering test. This includes the Finnish group order (make `getLocale` settable per test) and a failed save that returns the switch to `person`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: set `6-10-j12-loans-by-person: done` when the story is done.

**Acceptance Criteria:**
- Given open loans and the order set to by person, when `/loans` renders, then each borrower's name, as typed, heads a group, in alphabetical order. Each group's rows show the copy (cover, title, authors) and "Since {date}", longest out first.
- Given the switch, when I tap the other order, then the list changes at once, with no confirm, and the choice is saved on this device.
- Given a saved order, when `/loans` is rendered again, then the server renders that order and its switch state on the first paint.
- Given no saved order, when `/loans` renders, then it shows by person.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 16 findings — high 0, medium 0, low 11, false 5, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: the borrower headings are `<h3>` directly under the section's `<h1>` (`SectionNav.tsx:28`), skipping a level. Settings uses `<h2>` for its top-level groups. Fixed: `<h2>`, with the same classes. The spec's `<h3>` was wrong.
  - `[false]` `[reject]` Blind: two People with the same name give identical groups in no fixed order. This cannot happen: `nameKey` (`toNameKey`: NFC, trim, collapse, lowercase) is unique per owner, so no two of a viewer's People share a name, even with different case.
  - `[low]` `[reject]` Blind: the collator has no `numeric` option, so "Leena 10" sorts before "Leena 2". This is real but rare for given names. The case variant cannot happen because `nameKey` is unique. The named precedent, `filterValues.ts:61`, uses the defaults too.
  - `[low]` `[reject]` Blind: by person rows do not carry the borrower's name for assistive tech outside reading order. The heading comes before its list in reading order. Tying them with ids adds wiring for a rotor-only case.
  - `[false]` `[reject]` Blind: the switch over Nothing lent does nothing visible. The mock-up's nothing-lent frame (`mockups/key-loans.html`) shows the switch, and 6.11 puts returned loans below in both orders.
  - `[low]` `[reject]` Blind: both orders double the RSC payload, and 6.11's returned group would double it again. This is accepted in the Design Notes, and the list is a person's lent books. Noted for 6.11 in Residual risks.
  - `[low]` `[patch]` Blind: the "name as typed" test asserts the class name has no `ui-case`, which CLAUDE.md's Tests convention rules out. Fixed: the class assertion is removed and the `textContent` check stays.
  - `[low]` `[reject]` Blind: the `groups()` test helper depends on DOM structure. This is test-only brittleness, with no behaviour at stake.
  - `[low]` `[reject]` Blind: the Finnish-order test formats dates in English. The test covers the collation it is named for. Strings are covered by key parity (CLAUDE.md, Tests).
  - `[low]` `[reject]` Blind: the Finnish labels "Henkilöittäin" and "Päivämäärän mukaan" are not parallel in form. Both are idiomatic. "Päivittäin" means "daily" and "päivämäärittäin" is stilted. Wording is the owner's call.
  - `[false]` `[reject]` Blind: `sprint-status.yaml` says done while the spec is in-review. Finalization sets both together.
  - `[low]` `[reject]` Blind: `open` and `replace` are untested in by person. Both orders build their rows through one `row()` helper, and no AC names it (CLAUDE.md, Tests).
  - `[low]` `[patch]` Verification gap: the only multi-row group has two identical loans, so "longest out first" inside a group is unobservable. Fixed: one borrower now has two loans with different dates and books, and the test asserts their order.
  - `[false]` `[reject]` Intent: "remembered per device" is tested only by proxy. The cookie round trip of the `loans` key is covered by `tests/unit/prefs.unit.spec.ts` (parse, serialize, patch), and this story does not change it.
  - `[false]` `[reject]` Intent: "first paint" is not shown in SSR HTML. `LoansOrder` renders `initial` on its first render, and the page reads the cookie at render. The test shows the saved `date` chosen with no interaction.
  - `[low]` `[reject]` Intent: "never lowercased" is asserted only by class name. jsdom cannot compute `text-transform`. The heading has no `ui-case` and the `heading-group` token sets none. To be checked in a browser (Residual risks).

## Design Notes

**Both orders are rendered on the server, and the client picks one.** The rows are hook-free server components, so the page hands both trees to `LoansOrder`. Switching is then instant and needs no `router.refresh()`. It costs one extra copy of a short list in the RSC payload. Refreshing the page instead would wait on a server round trip after every tap. Re-grouping on the client would move the Book hydration into a client component.

**Group order is alphabetical.** The planning docs do not state it. The mock-up's order, Antti before Leena although Leena's loan is older, also fits "most recent loan first" and "most loans first". Alphabetical is chosen for these reasons:
- A list headed by names is found by name.
- Settings lists People by name (`personUse`).
- The mock-up is consistent with it.

The collator follows the interface locale, so Finnish puts Å, Ä and Ö after Z. Mika can redirect this in review.

```tsx
// page.tsx: group sketch
const collator = new Intl.Collator(await getLocale())
const groups = new Map<number, { person: Named; items: LoanItem[] }>()
for (const item of items) { /* push into groups by item.loan.person.id */ }
const sorted = [...groups.values()].sort((a, b) => collator.compare(a.person.name, b.person.name))
```

## Verification

**Commands:**
- `npm run typecheck`: expected clean.
- `npm run lint`: expected 0 errors.
- `npm run test:unit`: expected all pass.

**Manual checks (if no CLI):**
- On the phone and wide, in light and dark: switch between the orders and reload to check the first paint. Check that names keep their case in the headings.

## Auto Run Result

Status: done

**Summary.** `/loans` has a by person / by date switch. By person is the default. It groups the open loans under each borrower's name as typed, with the groups in alphabetical order for the interface locale. Each group lists its rows longest out first, each showing the cover, title, authors and "Since {date}". By date is the 6.9 list. The choice is saved in the `bookeh_prefs` cookie (`loans`) and read at render, so the first paint is right. A failed save is reported and puts the switch back. The switch also shows above Nothing lent, but not with Load failed.

**Files changed.**
- `src/app/(frontend)/(sections)/loans/LoansOrder.tsx`: new client switch. It takes both server-rendered orders and saves through `setDevicePrefsAction`.
- `src/app/(frontend)/(sections)/loans/page.tsx`: reads `devicePrefs()` and `getLocale()`, adds the `byBorrower` grouping, and adds group headings (`<h2>`) with "Since {date}" rows.
- `messages/en.json`, `messages/fi.json`: `loans.order`, `loans.orders.person`, `loans.orders.date`, `loans.sinceDate`.
- `tests/unit/loansPage.unit.spec.ts`: the prefs mocks; the 6.9 tests now run with `date`. New tests:
  - by person as the default, with the order inside a group;
  - the name as typed;
  - the Finnish group order;
  - the saved order on first render;
  - switching and saving;
  - a failed save.
- `sprint-status.yaml`: 6.10 is done.

**Review.** One pass found 16 findings: 11 low and 5 false.
- **Patched (all low):**
  - The heading is now `<h2>`. The intent contract says `<h3>`, which skipped a level below the section's `<h1>`.
  - The class-name test assertion is removed.
  - The order inside a group is now observable in the tests.
- **Deferred:** none.
- **Rejected, with reasons in the triage log:**
  - Same-named People (impossible because of `nameKey`).
  - The collator's `numeric` option.
  - Group labelling for assistive tech.
  - The switch over Nothing lent (it is in the mock-up).
  - The doubled payload.
  - Test helper brittleness.
  - English dates in the Finnish-order test.
  - The Finnish label form.
  - The status mismatch.
  - `open` / `replace` in by person.
  - Three proxy-coverage notes from the intent auditor.

**Follow-up review:** not recommended (`false`). Patched by verdict: 0 high, 0 medium, 3 low.

**Verification.**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (the 48 warnings were already there).
- `npm run test:unit`: 65 files passed.
- No schema or spine change.
- Not run in a browser.

**Residual risks.**
- **Group order is a judgement call.** The planning docs do not state it. The mock-up fits alphabetical order, newest loan first and most loans first. Alphabetical was chosen; Mika can redirect.
- **Not checked in a browser:** phone and wide, light and dark, reload for the first paint, and headings keeping their case.
- **Payload:** both orders go to the client on every render. 6.11 should render the returned group once, outside the switch.
- **Finnish switch labels** ("Henkilöittäin" / "Päivämäärän mukaan") are worth a look by Mika.
