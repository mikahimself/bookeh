---
title: '7.16 [K22] Conventions builds read'
type: 'chore'
created: '2026-10-30'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rules the retrospectives taught live only in retro files and the action-item register, so builds never read them: Epic 6 item 72 (AD deferrals), Epic 4 item 47 (walkthrough after `followup_review_recommended`), Epic 7 item 77 (Playwright walk of a screen story), and triage A15 (Payload skips `validate` under a false `admin.condition`), C15 (bare Finna URL in CLAUDE.md), D22 (spine and `epics.md` say 300 lines, CLAUDE.md says 500).

**Approach:** Write each rule where builds read it: CLAUDE.md Conventions and its Finna line; the `persistent_facts` of `_bmad/custom/bmad-build.toml` and `bmad-build-auto.toml`; the spine's Story size row and `epics.md`'s Story size line. The spine's Tests row stays as it is, since the walk commits nothing. Docs only, no code.

</frozen-after-approval>

## Implementation Notes

- `CLAUDE.md` Conventions: three new bullets (AD deferral rule, `followup_review_recommended` walkthrough, Payload `admin.condition` / `beforeValidate` with its `7d34440` evidence). The Finna line now gives the adapter's request (`/api/v1/`, `limit=100`), names `FINNA_FIELDS` in `src/lib/metadata/sources/finna.ts` as the authority and `tests/fixtures/REPORT.md` as its generated record (re-run `npm run fixtures`), and warns that `isbn:` matches the whole work, so records are kept only when their own `isbns` normalise to the ISBN asked for.
- `_bmad/custom/bmad-build.toml`, `bmad-build-auto.toml`: one new `persistent_facts` entry each, same text: the uncommitted Playwright walk of a screen story's ACs against the e2e server, written as `tests/e2e/*.walk.spec.ts` and recorded under `## Auto Run Result` (bmad-build adds the section). `.gitignore` ignores `/tests/e2e/*.walk.spec.ts`, so the walk can use `playwright.config.ts` as is and still can't be committed. Re-rendering bmad-build-auto shows the fact in its workflow.
- Spine Story size row, `epics.md:188` and `STORY-SLICING.md` rule 2: 300 → about 500 hand-written changed lines. The slicing doc sits beside the spine and said 300 too.
- `sprint-status.yaml`: 7-16 → done; action items 72 and 77 → done with a resolution. Item 47 stays `in-progress`: its rule is written, but the owed phone checks belong to Story 7.27.
- Epic 7 context was compiled on 2026-10-28, before `epics.md` gained 7.16; not recompiled, since this story reads no code-facing context.

## Review Triage Log

Blind Hunter, one pass.

- `high` patch — spec file ended in stray tool-call text. Rewritten.
- `false` — spec status `in-progress` vs sprint `done`: finalize had not run yet; now `done`.
- `low` patch — Finna line lacked the endpoint the notes claimed. URL added.
- `medium` patch — `REPORT.md` is generated; the line now names `finna.ts` the authority and says to re-run `npm run fixtures`.
- `low` patch — matching rule omitted "binding text after a space ignored". Added.
- `medium` patch — the walk had no uncommitted home: `testDir` is `tests/e2e`, not ignored. Named `tests/e2e/*.walk.spec.ts` and ignored it; checked with `git status`.
- `medium` defer — the walkthrough bullet says nothing on what `bmad-build-auto` does when the previous story carries `followup_review_recommended: true`; a fix edits the auto rules, an owner decision (deferred-work.md).
- `low` reject — AD-deferral bullet overlaps the general deferral bullet: it adds the AD scope, the plan-time timing and the context ban the general one lacks.
- `low` reject — item 78 not annotated: it closes when 7.16–7.18 land, not on this story alone.
- `low` reject — item 47 has no partial note: the register has no partial-resolution field; this spec records the split.
- `low` patch — `STORY-SLICING.md` edit missing from notes. Added. The `.memlog.md` 300-line entry is history; rejected.
- `low` patch — Payload rule had no source. Cites `7d34440` and the collections that follow it.
