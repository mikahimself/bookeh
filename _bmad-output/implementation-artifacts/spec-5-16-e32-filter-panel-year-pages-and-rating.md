---
title: '5.16 [E32] Filter panel: year, pages and rating'
type: 'feature'
created: '2026-10-23'
baseline_revision: 'a8d8d8973ed3f0c7a3b78372c181e1502d4a6ac9'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Filter panel has no minimum rating and no year or pages range (FR-25, EXPERIENCE.md Filter panel). `lib/shelf`, `query.ts` and the count line already handle `ratingMin`, `year` and `pages`.

**Approach:** After Publisher, add Rating (a new shared Rating component meaning "at least", with its Clear Link), then Year and Pages (From and To). All three write the address through the panel's pending-tap path.

## Boundaries & Constraints

**Always:**
- Order: Rating, Year, Pages, inside the comboboxes' gate (`values.status` is not empty). Group headings look like the option lists' headings.
- `components/Rating.tsx` (5.23 reuses it) follows DESIGN.md, Rating: five 22px star outlines, no fill. Stars up to the value are `text`, the rest `text-dim`. Each star is a `button` named "{n} stars" (`aria-pressed` on the value's star), 44px on the phone. A tap sets that value; the current star does nothing. While a value is set, a "Clear" `ActionLink` in `meta` sits beside the stars.
- Year and Pages: "From" and "To" inputs side by side, each labelled as a Text field (label above, `fieldClass` underline). `inputMode="numeric"`, `maxLength={9}` (stays within int4), non-digits dropped as typed. They apply 300 ms after typing pauses, or at once on Enter or blur. Either end may be empty; both empty drops the field.
- from > to: a message under the pair, a danger underline and `aria-invalid` on both inputs, and no replace (the previous range stays). Editing hides the message until the next apply.
- The inputs follow the address's range when someone else changes it (Clear, Back). The field's own replace keeps what was typed since.
- Every write goes through one `go(update)` in `OptionLists`, which `tap` also uses. It keeps search, sort, dir, the other fields and `book`.

**Never:**
- No change to `lib/shelf`, `query.ts`, `countLine.ts`. No sort (5.17), no Book detail rating (5.23). No `type="number"`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Set rating | none, tap star 3 | `rating=3`, Clear shown | — |
| Same star | `rating=3`, tap 3 | no replace | — |
| Change | `rating=3`, tap 5 | `rating=5` | — |
| Clear | `rating=3`, tap Clear | `rating` gone | — |
| Open from | Year From "1990", Enter | `year=1990-` | — |
| Open to | Pages To "200", blur | `pages=-200` | — |
| Both empty | `year=1990-`, From emptied, Enter | `year` gone | — |
| Invalid | From "2000", To "1990", Enter | message, both danger | no replace |
| Outside change | `year=1990-`, Clear on count line | From empty | — |

</intent-contract>

## Code Map

- `(sections)/FilterPanel.tsx`: `OptionLists` has `pending`/`built`/`query`/`book` and `tap`. Pull out `go(update: (q) => ShelfQuery)`. Add `RatingField` and `RangeField` after the `AddedValues` map. For headings, reuse the `Field` markup (`h3` `text-heading-group text-text-muted ui-case`, `role="group"` with `aria-labelledby`).
- `(sections)/filterToggle.ts`: add `setFilter(query, 'ratingMin' | 'year' | 'pages', value | undefined)`, which sets the field or drops it.
- `(sections)/SearchField.tsx`: the pattern for pause, Enter and own versus outside replace. In `RangeField`, keep it in render-time state (`seen`/`written` keys, as `FilterPanelProvider` does with `seenBook`), not refs read in render.
- `components/TextField.tsx`: `fieldClass(error)`, and the label `text-label text-text-muted`. The message is `<p class="text-meta">` with `aria-describedby`.
- `components/Link.tsx`: `ActionLink`, sized by a `text-meta` parent.
- `styles.css`: add `--spacing-star: 22px` (DESIGN.md `rating.star-size`). The filter width is 220px, so stars are `size-tap` only under `max-wide:`, and smaller on wide so that Clear fits.
- `tests/unit/filterPanel.unit.spec.ts`: the harness (spied `router.replace`, `search`, `values` with a status).

`(sections)/` and `components/` are under `src/app/(frontend)/`.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/styles.css`: the `--spacing-star` token.
- `src/app/(frontend)/components/Rating.tsx`: props `value: number | null`, `onRate(n)`, `onClear()`, `aria-labelledby`.
- `src/app/(frontend)/(sections)/filterToggle.ts`: `setFilter`.
- `src/app/(frontend)/(sections)/FilterPanel.tsx`: `go`, `RatingField`, `RangeField`.
- `messages/en.json`, `messages/fi.json`, under `collection`:
  - `filterFields.rating`/`year`/`pages`: "Rating"/"Arvio", "Year"/"Vuosi", "Pages"/"Sivuja".
  - `rangeFrom`/`rangeTo`: "From"/"Alkaen", "To"/"Asti".
  - `rangeInvalid`: "From is greater than to."/"Alkaen on suurempi kuin asti."
  - `stars`: `{n, plural, one {# star} other {# stars}}` / `{n, plural, one {# tähti} other {# tähteä}}`.
  - `clear` already exists.
- `tests/unit/filterPanel.unit.spec.ts`: every matrix row (Outside change: rerender with a new `search`), driven by Enter or blur, not timers.

**Acceptance Criteria:**
- Given the Filter panel, when Mika taps a star, then the list shows that rating or higher. Another star changes it, the current star does nothing, and Clear removes it.
- Given Year or Pages, when Mika fills one end only, then the range is open at the other end and applies with no Apply button.
- Given from greater than to, then the message shows under the field and the list stays as it was.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 25 findings — high 0, medium 0, low 22, false 3, maybe-false 0
- findings:
  - `[false]` `[reject]` Intent: the invalid-range test starts from an empty address, so "the previous range stays" is not exercised — an invalid pair returns before `go`, so no replace happens whatever the address held; "no replace" is the whole behaviour.
  - `[low]` `[reject]` Intent: the 300 ms pause apply is untested — test-only; AC2 ("applies with no Apply button") is pinned by the Enter and blur tests (CLAUDE.md tests convention). Same as the verification-gap pause row.
  - `[low]` `[reject]` Intent: own replace keeping typed text is untested — test-only, as the verification-gap own-replace row.
  - `[low]` `[reject]` Intent: the "viewer has copies" gate is not tested — test-only; no criterion or spine rule names it.
  - `[low]` `[reject]` Intent: star size, strokes, 44px taps and Clear fitting in 220px are untested — CSS and markup are not tested by convention; listed as manual checks.
  - `[false]` `[reject]` Intent: not committed and sprint status still `backlog` — finalization commits both in this run.
  - `[low]` `[reject]` Verification gap: the pause apply has no timer test (mutation survives) — test-only; no criterion names the pause (AC2 is met by Enter/blur).
  - `[low]` `[reject]` Verification gap: editing after an invalid pair does not prove the message hides — test-only; a spec Always rule, not a criterion or spine rule.
  - `[low]` `[reject]` Verification gap: the `written` guard (own replace) is untested — test-only; the only visible loss would be normalised text such as "0199" → "199".
  - `[low]` `[patch]` Blind: the pause runs the from > to check mid-typing, flashing the message — the pause path now does nothing on an invalid pair; only Enter and blur show the message. Partial values applying on a pause is the search field's behaviour too and stays.
  - `[low]` `[reject]` Blind: blur from From to To applies a half-entered range first — the spec makes blur apply; skipping it for a sibling input adds a `relatedTarget` branch for one extra replace.
  - `[low]` `[patch]` Blind: Enter leaves focus and the phone keyboard up, unlike search — Enter now blurs the input (blur applies) and the inputs have `enterKeyHint="done"`.
  - `[low]` `[patch]` Blind: the invalid message is not announced — the message has `role="alert"`.
  - `[low]` `[reject]` Blind: after a refused pair the inputs show it while the list keeps the previous range, and the phone sheet's remount drops it — what the spec asks ("the previous range stays"); syncing back adds state for a pair the user is correcting.
  - `[low]` `[reject]` Blind: `Rating` reads `collection` messages though 5.23 reuses it — Book detail is part of the collection section and already sits under `(sections)/`; moving two keys later is trivial.
  - `[low]` `[reject]` Blind: `aria-pressed` on only the value's star, and toggle semantics that cannot un-press — "3 stars, pressed" reads the value; a correct radiogroup needs roving focus and arrow keys, more than this story's filter needs.
  - `[low]` `[patch]` Blind: two buttons named "Clear" (count line and Rating) — the Rating's Clear is labelled by itself and the Rating heading, reading "Clear Rating".
  - `[low]` `[reject]` Blind: pasting "1990-2000" into From gives 19902000 — rare; the list shows nothing and the user corrects it; splitting pastes adds a branch.
  - `[false]` `[reject]` Blind: `rangeKey` and `Range` duplicate `query.ts` and could drift from the address format — `rangeKey` is only a local compare key built the same way on both sides and never written to the address, so a format change cannot desync it.
  - `[low]` `[reject]` Blind: the matrix lacks rows for own replace, edit-after-invalid and the pause — the fix edits this build's spec.
  - `[low]` `[reject]` Blind: "From is greater than to." / "Alkaen on suurempi kuin asti." read awkwardly — the texts are as the spec gives them; listed under residual risks for Mika's wording.
  - `[low]` `[reject]` Blind: Year/Pages headings sit 4px further from content (`gap-1`) than Rating and the option lists — the same `gap-1` spaces the message from the inputs, as `TextField` does; the label row under the heading differs from an option line anyway.
  - `[low]` `[reject]` Edge: unmount within 300 ms of the last keystroke (Esc, Back gesture) drops the typed range — rare; a tap anywhere blurs and applies first; an unmount flush adds a ref and an effect.
  - `[low]` `[reject]` Edge: an outside change that leaves this field's range unchanged (Clear with no range on) keeps an unapplied invalid draft and its message — rare; resetting on every outside address change would also wipe drafts on other fields' changes.
  - `[low]` `[patch]` Edge: the pause flags invalid mid-typing and applies partial open-start values — same root cause as the Blind pause row, same fix; partial applies stay as in search.

## Design Notes

The range applies on a pause as well as on Enter or blur, as search does, because blur alone leaves the phone sheet stale until the keyboard closes. On an invalid range the previous range stays, which follows "does not apply" literally.

## Verification

**Commands:**
- `npm run typecheck`: clean.
- `npx eslint . --ignore-pattern '.claude/**'`: no new warnings.
- `npm run test:unit`: pass.

**Manual checks (if no CLI):**
- `next dev` at 1300px and 390px: stars, Clear, a paused Year From, the invalid message.

## Auto Run Result

Status: done

**Summary:** The Filter panel now has Rating, Year and Pages after Publisher, for a viewer with copies.
- **Rating** is a new shared `Rating` component (5.23 reuses it).
  - Five unfilled 22px star outlines; the stars up to the value are in `text`.
  - Tapping a star sets `rating=n` ("at least"). Another star changes it, and the current star does nothing.
  - A "Clear" Link, named "Clear Rating", removes it.
- **Year and Pages** have From and To inputs.
  - Digits only, at most 9.
  - A range applies after a 300 ms pause, or on Enter (which blurs) or blur. Either end may be empty, and both empty drops the field.
  - If from > to, Enter or blur shows an announced message with danger underlines and leaves the address as it was. On the pause path an invalid pair does nothing.
  - The inputs follow outside address changes (Clear, Back) and keep their own text across the field's own replace.
- All writes go through one `go(update)` with the existing pending-tap tracking. It skips no-op replaces.

**Files changed:**
- `src/app/(frontend)/components/Rating.tsx`: the shared Rating component.
- `src/app/(frontend)/(sections)/FilterPanel.tsx`: `go`, `RatingField`, `RangeField`.
- `src/app/(frontend)/(sections)/filterToggle.ts`: `setFilter` for `ratingMin`, `year` and `pages`.
- `src/app/(frontend)/styles.css`: the `--spacing-star` token.
- `messages/en.json`, `messages/fi.json`: field names, `rangeFrom`, `rangeTo`, `rangeInvalid` and `stars`.
- `tests/unit/filterPanel.unit.spec.ts`: one test per matrix row (9).

**Review findings:** 25 findings (low 22, false 3).
- **Patched (5 rows, 4 root causes, all low):**
  - The pause flagged an invalid pair while typing.
  - Enter left the keyboard up.
  - The message was not announced.
  - There were two buttons named "Clear".
- **Deferred:** nothing.
- **Rejected (20), each with its reason in the triage log:**
  - 8 test-only gaps: the pause, edit-after-invalid, own replace, the gate, and CSS.
  - 2 intent rows (false).
  - Blur between From and To applying a half range.
  - Inputs keeping a refused pair.
  - The Rating message namespace.
  - `aria-pressed` against a radiogroup.
  - Pasted ranges.
  - `rangeKey` duplication (false).
  - Matrix rows (a spec edit).
  - Message wording.
  - Heading gap.
  - Unmount inside the pause.
  - An invalid draft surviving an unrelated Clear.

**Follow-up review:** not recommended (`false`). Only low entries were patched: 4 entries.

**Verification:**
- `npm run typecheck`: clean.
- `npx eslint . --ignore-pattern '.claude/**'`: 0 errors, 40 warnings, all pre-existing.
- `npm run test:unit`: 59 files, 844 tests passed.
- `prettier --check` on the changed files: clean.
- Every matrix row has a passing `filterPanel` test.

**Residual risks:**
- Nothing has been checked in a real browser. The open checks:
  - the stars and Clear fitting in the 220px panel on wide;
  - 44px stars in the 390px sheet;
  - a paused Year From narrowing the list;
  - Enter closing the phone keyboard.
- The texts "From is greater than to." / "Alkaen on suurempi kuin asti." are as the spec gave them. Mika may want other wording.
- Tabbing from From to To applies a From-only range first. A range typed and then closed within 300 ms by Esc or the Back gesture is lost.
