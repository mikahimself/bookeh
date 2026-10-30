---
title: '7.20 [K26] Scan and collection leftovers'
type: 'bugfix'
created: '2026-10-30'
status: 'blocked'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
deferred: []
---

# 7.20 [K26] Scan and collection leftovers

Planning stopped before the build. The story's text is in `epics.md` (Story 7.20); triage items B31, C21, C32, D14, D15.

## Auto Run Result

Status: blocked
Blocking condition: intent gap. The first criterion says the place and wording of the partial-lookup line on the Not in library Answer "are picked from a rendered mock-up and recorded in EXPERIENCE.md before the build, as for Story 7.14". That pick is Mika's, EXPERIENCE.md records none, and an unattended run must not make it.

Unanswered question: which option, A, B or C, in `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/.working/answer-partial-lookup.html`?

Evidence gathered:
- `EXPERIENCE.md`, Answer: names only the source and new-record notes under the Book, and Couldn't look it up's line; nothing for `found` with a failed source.
- `src/lib/metadata/lookup.ts:149-155`: `found` is built without `failed`; a partial outcome is only cached for `PARTIAL_TTL_MS`.
- `src/app/(frontend)/scan/AnswerLayout.tsx`: the notes block and the `editions` slot are the places A/C and B would use. `UnavailableActions.tsx`: Try again is `router.refresh()` in a transition with the progress line, reusable here.
- No `error.tsx` under `src/app`; `CoverTile.tsx` and `ShelfRows.tsx` as the triage says.

No code changed. Re-dispatching after the pick is recorded replans from this file's status once it is set back to `draft`.
