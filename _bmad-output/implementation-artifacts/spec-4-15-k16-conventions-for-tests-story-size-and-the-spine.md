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
deferred: []
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

## Verification

**Commands:**
- `git diff --stat` -- expected: only `CLAUDE.md`, the retrospective, `sprint-status.yaml` and this spec change.
- `git diff -U0 CLAUDE.md` -- expected: hunks only within the `## Conventions` list (one replaced line, two added lines).
