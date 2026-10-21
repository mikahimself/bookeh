---
title: 'Story 4.15 [K16]: Conventions for tests, story size and the spine'
type: 'chore'
created: '2026-10-21'
status: 'done'
baseline_revision: 'f1db913ae06f6d7fe5d2e1a84cdf3783673becbe'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      The new tests and story-size bullets in CLAUDE.md are not reconciled with the spine's Tests and Story size rows, and the spine wins where they disagree.
    evidence: |-
      ARCHITECTURE-SPINE.md Tests row (about line 311) says every service story ships integration tests and pure functions get *.unit.spec.ts; epics.md:188-189 repeats it. The new CLAUDE.md bullet allows a test only when the acceptance criteria name the behaviour or it guards a spine rule. Read with CLAUDE.md yielding to the spine, the Tests row either counts as a spine rule (cancelling the restriction) or overrides it. The Story size row measures about 300 hand-written lines, while the new bullet keys on review scannability and the oversized warning. Retro item 10 reconciles only the Tests row's "pure functions" wording. Settling it means editing the spine or CLAUDE.md, an owner decision.
    location: >-
      CLAUDE.md:69; ARCHITECTURE-SPINE.md:310-311; epics.md:188-189
    severity: medium
  - summary: >-
      The compact-stories bullet keys on the `oversized` warning, which measures spec length rather than diff size, fired on 50 of 54 Epic 3 specs, and does not stop bmad-build-auto.
    evidence: |-
      step-02-plan.md adds `oversized` when the spec exceeds 1600 tokens, then says "Continue either way". grep finds `oversized` in 50 of the 54 spec-3-*.md files. Read literally, the rule splits almost every story, and the unattended loop builds it anyway. Fixing it means changing the bullet (CLAUDE.md) or the skill, both agent context, and the wording is the owner's retro decision 10.
    location: >-
      CLAUDE.md:70; .claude/skills/bmad-build-auto step-02-plan.md
    severity: medium
  - summary: >-
      The memory note tests-functional-minimum.md still says test-only review findings are "rejected or deferred"; the new CLAUDE.md bullet says rejected unless they name the criterion or spine rule.
    evidence: |-
      The memory body's "How to apply" line predates story 4.15. The spec forbade the implementer touching memory files.
    location: >-
      ~/.claude/projects/-Users-mika-development-bookeh/memory/tests-functional-minimum.md
    severity: low
---

<intent-contract>

## Intent

**Problem:** The Epic 3 retrospective decided three conventions (action items 12, 13 and 19) that only live in the retrospective file, so story sessions, which read CLAUDE.md, do not follow them unless reminded.

**Approach:** Rewrite the tests bullet in CLAUDE.md's Conventions section to the retrospective's sharper wording and add two bullets: compact stories, and spine updates travelling with the story.

## Boundaries & Constraints

**Always:** Edit only the `## Conventions` list in `CLAUDE.md`. Keep the bullets' existing voice: short declarative sentences, no headings, no bold. The tests bullet carries every clause of action item 12's draft. Mark action items 12, 13 and 19 in the retrospective as applied by this story, and set the story to `done` in `sprint-status.yaml` at the end of the run, as prior stories did.

**Never:** Change any other part of CLAUDE.md (including the Next.js agent-rules block). Change ARCHITECTURE-SPINE.md, the PRD, the UX documents or any code. Add tests (nothing here is testable code). Touch the user's memory files.

</intent-contract>

## Code Map

- `CLAUDE.md:62-72` -- `## Conventions` list. Line 69 is the current tests bullet to replace; the new bullets go after it, before "Commit after each story" (line 70).
- `_bmad-output/implementation-artifacts/epic-3-retro-2026-10-20.md` (Action items 12, 13, 19) -- source wording. Item 12 holds a quoted draft of the tests bullet, marked "not applied".
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:311` -- the spine's Tests row, which the tests bullet points to; read only.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:129` -- `4-15-k16-conventions-for-tests-story-size-and-the-spine: backlog`.

## Tasks & Acceptance

**Execution:**
- `CLAUDE.md` -- replace the tests bullet with: "Tests at a functional minimum. Add a test only when the story's acceptance criteria name the behaviour or the test guards a spine rule (access, transactions, Undo, migrations, a stated order such as Finna before Google). One focused test per behaviour that can break; no tests that restate markup, class names, CSS, config or a mocked call sequence. Playwright covers only scan-to-save and shop check (spine, Tests convention). In review triage, a finding that only asks for a test is rejected unless it names the criterion or the spine rule the test would guard." -- action item 12.
- `CLAUDE.md` -- add after it: "Stories stay compact: a spec and diff Mika can scan in one review. A spec that warns `oversized` is split before building." -- action item 19.
- `CLAUDE.md` -- add after that: "A story that changes a spine contract updates ARCHITECTURE-SPINE.md in the same commit. The update is one of the story's acceptance criteria, never a deferral." -- action item 13.
- `_bmad-output/implementation-artifacts/epic-3-retro-2026-10-20.md` -- in items 12, 13 and 19, note "Applied in story 4.15." (item 12: replace "not applied" accordingly) -- so later retros do not re-flag them.

**Acceptance Criteria:**
- Given the Conventions section of CLAUDE.md, when the story is done, then the tests bullet says a story adds a test only when its acceptance criteria name the behaviour or the test guards a spine rule (access, transactions, Undo, migrations, a stated order such as Finna before Google); one focused test per behaviour that can break; no tests that restate markup, class names, CSS, config or a mocked call sequence; Playwright only for scan-to-save and shop check; and review triage rejects a finding that only asks for a test unless it names the criterion or the spine rule.
- Given the same section, when the story is done, then a bullet says stories stay compact, a spec and diff Mika can scan in one review, and a spec that warns oversized is split before building.
- Given the same section, when the story is done, then a bullet says a story that changes a spine contract updates ARCHITECTURE-SPINE.md in the same commit, as an acceptance criterion, never as a deferral.
- Given `git diff` of CLAUDE.md for this story, when inspected, then only lines inside the Conventions list change.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 19 findings — high 0, medium 7, low 4, false 8, maybe-false 0
- findings:
  - `[medium]` `[defer]` (edge) `oversized` warning does not stop the unattended loop, so the split-before-building rule is not enforced — step-02-plan.md adds the warning then says "Continue either way"; fix edits CLAUDE.md or the skill (agent context), deferred.
  - `[medium]` `[defer]` (edge) Tests bullet reads as "skip the test" against the spine Tests row's mandatory service and pure-function tests — spine row confirmed at ARCHITECTURE-SPINE.md:311; reconciling edits the spine or CLAUDE.md, deferred.
  - `[low]` `[reject]` (edge) Spine-update bullet does not cover PRD/UX contracts — out of scope: retro decision 6 and the epics.md 4.15 criteria name ARCHITECTURE-SPINE.md only.
  - `[false]` `[reject]` (edge) sprint-status marks 4.15 done while review is open — this run finalizes the spec to `done` in the same pass; the end state is consistent.
  - `[medium]` `[defer]` (blind) New tests bullet clashes with the spine Tests row — same root cause as the edge Tests finding; deferred with it.
  - `[medium]` `[defer]` (blind) Story changes conventions the spine records (Tests, Story size rows) without updating the spine — same root cause: spine rows and the new bullets are not reconciled; deferred with it.
  - `[medium]` `[defer]` (blind) `oversized` measures spec wordiness and fires on nearly every story — confirmed 50 of 54 spec-3-*.md carry it; grouped with the edge oversized finding, deferred.
  - `[false]` `[reject]` (blind) Story marks itself done before review — same refutation as the edge status finding.
  - `[low]` `[defer]` (blind) Memory note tests-functional-minimum.md still says "rejected or deferred" — confirmed; memory is agent context and outside the repo, deferred.
  - `[false]` `[reject]` (blind) "Migrations" in the parenthetical has no spine rule — AD-13 (ARCHITECTURE-SPINE.md:203-210) is a spine rule on migrations, with a CI check.
  - `[false]` `[reject]` (blind) Verification does not prove the bullet carries every clause of item 12 — the diff shows the bullet identical to the retro's quoted draft; no clause is dropped.
  - `[false]` `[reject]` (blind) New bullets name "Mika" instead of "the owner" — the epics.md 4.15 criteria and retro decision 10 word it with Mika; not a deviation.
  - `[false]` `[reject]` (intent) Nothing exercises the behavioural outcome — the change is prose for agents; the spec and CLAUDE.md call for no test here.
  - `[medium]` `[defer]` (intent) Precedence conflict with the spine Tests and Story size rows — same root cause as the edge Tests finding; deferred with it.
  - `[low]` `[patch]` (intent) epic-4-context.md says 4.15 writes the schema merge-one-at-a-time convention — fixed: the "Conventions (written by 4.15)" bullet now lists only what CLAUDE.md says; the schema sentence (spine AD-13) is gone.
  - `[low]` `[defer]` (intent) Memory note drift — same as the blind memory finding; deferred with it.
  - `[false]` `[reject]` (intent) Spec status and sprint-status disagree — same refutation as the edge status finding.
  - `[false]` `[reject]` (intent) Retro item 16 not marked applied — item 16 already reads "Decided, done" and points to item 19, which is marked.
  - `[medium]` `[defer]` (intent) epics.md:188-189 keeps the old Tests and Story size wording — same root cause as the spine reconciliation group; deferred with it.

## Verification

**Commands:**
- `git diff --stat` -- expected: only `CLAUDE.md`, the retrospective, `sprint-status.yaml` and this spec change.
- `git diff -U0 CLAUDE.md` -- expected: hunks only within the `## Conventions` list (one replaced line, two added lines).

## Auto Run Result

**Summary.** CLAUDE.md Conventions now carries the Epic 3 retrospective's sharper tests rule (action item 12, verbatim), a compact-stories bullet (item 19) and a spine-updates-travel-with-the-story bullet (item 13). The retrospective and sprint status record the three items as applied.

**Files changed**
- `CLAUDE.md` -- tests bullet replaced, two bullets added; only the Conventions list changes.
- `_bmad-output/implementation-artifacts/epic-3-retro-2026-10-20.md` -- items 12, 13, 19 marked "Applied in story 4.15".
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 4.15 `done`, `epic-4` `in-progress`, retro action items 29, 30 and 36 `done` with resolutions.
- `_bmad-output/implementation-artifacts/epic-4-context.md` -- new epic context cache; its 4.15 conventions bullet patched in review.
- this spec.

**Review findings.** 19 findings: 1 patch applied (low: epic-4-context.md schema sentence), 3 deferred entries covering 10 findings (spine Tests/Story size reconciliation, medium; `oversized` trigger, medium; memory drift, low), 1 low rejected as out of scope (PRD/UX contracts; the decision names the spine only), 8 rejected as false (refutations in the triage log).

**Follow-up review:** `false`. Patched this pass: high 0, medium 0, low 1.

**Verification.** `git diff -U0 CLAUDE.md` from baseline: one hunk at line 69 (one line replaced, two added), inside Conventions. `git diff --stat` from baseline: CLAUDE.md, the retrospective, sprint-status.yaml and this spec, plus epic-4-context.md. `sprint_plan.py validate` returned `valid: true` (verification-gap layer). Spec frontmatter parses as YAML with three deferred items.

**Residual risks.** Until the spine Tests row and the new tests bullet are reconciled, a story session can read "guards a spine rule" as covering every service and pure-function test, so the restriction may not bite. The `oversized` rule, read literally, would split nearly every story; the unattended loop does not enforce it.

**Owner follow-up (2026-10-21).** Deferred item 1: Mika had the spine Tests row (and its copy in `epics.md`) rewritten to the new tests rule; resolved. Deferred item 2: Mika dismissed it; the stories are designed small, and the `oversized` warning is not acted on. Deferred item 3: the memory note now defers to the CLAUDE.md rule; resolved.
