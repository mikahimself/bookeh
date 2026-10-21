---
title: 'Story 4.21: [A27] One helper for system privileges'
type: 'refactor'
created: '2026-10-21'
status: 'done'
baseline_revision: '0aa89e2ceb32fa94c249cb5f0200186dbc51a5a0'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      A Local API call that leaves out overrideAccess gets system privileges by Payload's default, and no lint rule sees it in the gateway-exempt modules or in hooks under src/collections, src/fields and src/access.
    evidence: |-
      Payload's Local API defaults overrideAccess to true (src/access/asRequestUser.ts:8). The AD-2 rules ban req.payload outside the exempt modules, but lib/catalogue, lib/payload, lib/shelf and the collection/field/access hooks are not covered; bookeh/system-privileges only sees a written overrideAccess property. Pre-existing; catching omissions needs call analysis.
    location: >-
      eslint.config.mjs (bookeh/system-privileges)
    severity: medium
  - summary: >-
      No automated check that bookeh/system-privileges still fires; CI lint passes over a clean tree whether the rule works or not.
    evidence: |-
      No RuleTester or ESLint-API spec exists for any custom rule. Story 4.25 adds the RuleTester spec for bookeh/client-lib-imports; the same spec should cover this rule (a literal in src/lib/copies errors, an import of system() from src/fields errors, system.ts passes).
    location: >-
      eslint.config.mjs
    severity: low
---

<intent-contract>

## Intent

**Problem:** `lib/catalogue` writes `overrideAccess: true` by hand at eleven sites (three `system` literals plus inline options), and nothing stops a feature story adding one elsewhere; AD-3's allowlist rests on review alone (Epic 3 retro decision 4, action item 8).

**Approach:** One `system(ctx)` helper in `lib/catalogue` returns the privileged Local API options; every site spreads it. A `bookeh/system-privileges` lint rule fails on an `overrideAccess: true` property anywhere in `src` except the helper's module and the first-user seed.

## Boundaries & Constraints

**Always:** Each call keeps exactly the options it passes today: same `req` (or none), `overrideAccess: true`, same `depth`. A call that needs another depth sets it after the spread (`...system(tx), depth: 1`). The lint rule matches a non-computed property named `overrideAccess` (identifier or string key) whose value is the literal `true`. ARCHITECTURE-SPINE.md AD-3 names the helper and the lint ban in this commit.

**Never:** No change to which calls are privileged, to the gateway, to `asRequestUser`, or to any test file. No lint on `tests/**` (tests build fixtures with system privileges). No `no-restricted-syntax` block for this: a later block's `no-restricted-syntax` replaces the roles and gateway selectors set earlier. No `eslint-disable` comments.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Call inside a transaction | `system(tx)` | `{ req: tx.req, overrideAccess: true, depth: 0 }` | — |
| Call with no request (onInit sweep) | `system(null)` | `{ overrideAccess: true, depth: 0 }` (no `req`, as today) | — |
| Literal outside the helper | `overrideAccess: true` in any `src` file but the helper and `seedFirstUser.ts` | `npm run lint` fails with the AD-3 message | — |
| Allowed forms | `overrideAccess: false`, or the literal in `system.ts` / `tests/**` | lint passes | — |

</intent-contract>

## Code Map

- `src/lib/catalogue/system.ts` -- new. The helper. `Context` from `@/lib/payload/context`. `null` (not optional) so a forgotten `tx` inside a transaction cannot silently drop `req`.
- `src/lib/catalogue/ensureSharedBook.ts:61` -- `const system = {...} as const` literal; the local name collides with the import, so drop it and use `system(tx)` at each `...system` spread. `:161` -- `deleteRow`'s inline `overrideAccess: true, req: tx.req, depth: 0`.
- `src/lib/catalogue/createPrivateBook.ts:80` -- same literal as ensureSharedBook:61.
- `src/lib/catalogue/findOrCreateByName.ts:49` -- `match()` inline with `ctx.req`; `:104` -- literal.
- `src/lib/catalogue/sharePrivateBook.ts:207` -- `findByID` with `depth: 1` and `populate`; keep `depth: 1` after the spread. `:276` -- the share `update`, depth 0.
- `src/lib/catalogue/covers.ts:203` -- `coverPreview` find with `ctx.req` (not a transaction). `:283` -- `attachCover` create with `tx.req`. `:326` -- `sweepOrphanMedia(payload)`, called from `onInit` (`src/payload.config.ts:52`) with no request: `system(null)`.
- `src/lib/catalogue/isUnreferenced.ts:34` -- `count` with `ctx.req`. `CountOptions` has no `depth`; the spread's extra one is ignored.
- `src/lib/account/seedFirstUser.ts` -- read only; no literal (Local API default), exempt anyway per the AC.
- `eslint.config.mjs` -- add the rule beside `clientLibImports` in the inline `bookeh` plugin (a plugin name can be defined only once), enable it in the `src/**` block that registers the plugin, and turn it off for `src/lib/catalogue/system.ts` and `src/lib/account/seedFirstUser.ts` in a following block.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:90-95` -- AD-3 rule list.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/system.ts` -- add `system(ctx: Context | null)` with a doc comment citing AD-3 -- the one privileged options source.
- `src/lib/catalogue/{ensureSharedBook,createPrivateBook,findOrCreateByName,sharePrivateBook,covers,isUnreferenced}.ts` -- replace every literal and inline `overrideAccess: true` with `...system(<ctx>)` -- the AC's replacement.
- `eslint.config.mjs` -- add `bookeh/system-privileges` as above, message citing spine AD-3 and naming `system()` -- the lint guard.
- `ARCHITECTURE-SPINE.md` -- AD-3: add a rule line that system privileges in `lib/catalogue` go through `system()` in `src/lib/catalogue/system.ts`, and that lint fails on `overrideAccess: true` elsewhere in `src` but the seed -- spine change travels with the story.

**Acceptance Criteria:**
- Given the services in `lib/catalogue`, when one needs system privileges, then it spreads `system(tx)` and `grep -rn "overrideAccess: true" src` lists only `src/lib/catalogue/system.ts`.
- Given an `overrideAccess: true` property added to any other `src` file (e.g. `src/lib/copies/` or a catalogue service), when `npm run lint` runs, then it fails with the AD-3 message; removing it makes lint pass.
- Given the change, when the unit and integration lanes run, then they pass with no test file changed.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 23 findings — high 0, medium 6, low 16, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: any file outside `lib/catalogue` (`src/fields`, `src/access`, the frontend) can import `system()` and spread it lint-clean — the rule also reports an import resolving to `src/lib/catalogue/system` from outside `src/lib/catalogue/`.
  - `[low]` `[patch]` Blind: the lint message tells code outside `lib/catalogue` to import the helper, which AD-3 forbids — reworded: privileges only in `lib/catalogue` through `system()`; elsewhere the gateway or `asRequestUser(req)`.
  - `[medium]` `[defer]` Blind: a Local API call that leaves `overrideAccess` out is privileged by Payload's default and lint-clean (exempt dirs, hooks in `src/collections`/`src/fields`/`src/access`) — pre-existing; the AD-2 rules cover the rest of `src`; catching omissions needs call analysis beyond this story's literal ban.
  - `[low]` `[patch]` Blind: the new AD-3 line says "every call" spreads `system()`, but `ensureSharedBook.ts:139`'s restore uses `payload.db.deleteMany` — spine line now says "every Local API call".
  - `[low]` `[patch]` Blind: shorthand `{ overrideAccess }`, a variable, `!0` pass the rule — rule now reports every `overrideAccess` property whose value is not the literal `false`. Assignments (`opts.overrideAccess = true`) and computed keys stay unreported: deliberate workarounds, not everyday code.
  - `[low]` `[reject]` Blind: `system(null)` can be passed inside a transaction — needs a deliberate wrong argument; a second export adds surface for a rare mistake.
  - `[low]` `[reject]` Blind: the `seedFirstUser.ts` exemption covers nothing today — the story's AC names the seed as exempt; the doc comment in `system.ts` stays true.
  - `[low]` `[defer]` Blind: no automated check that the rule still fires — names AD-3 and the lint AC, so a test is allowed; Story 4.25 builds the `RuleTester` spec for `bookeh/client-lib-imports`, and this rule belongs in it.
  - `[low]` `[patch]` Edge: `overrideAccess: true as const` passes — same root as the shorthand row; fixed there.
  - `[low]` `[reject]` Edge: computed key `['overrideAccess']: true` passes — deliberate obfuscation, not everyday code; extra branches for it.
  - `[low]` `[patch]` Edge: non-literal truthy value passes — same root as the shorthand row; fixed there.
  - `[medium]` `[defer]` Edge: call omitting `overrideAccess` inherits the default — same as the Blind default row.
  - `[low]` `[reject]` Edge: `system(null)` inside a transaction — same as the Blind `system(null)` row.
  - `[low]` `[reject]` Edge: return type is a union, so a ctx call is not typed with `req` — no caller reads `req` from the result; overloads add surface for nothing.
  - `[low]` `[reject]` Edge: `depth: 0` reaches `payload.count`, which has no `depth` — Payload ignores it; recorded in the Code Map.
  - `[low]` `[patch]` Edge (claim): `payload.db.deleteMany` is a second privileged path the spine line misses — same as the Blind spine row.
  - `[low]` `[patch]` Edge (claim): spine says lint fails on the property, but other spellings pass — spine line rewritten with the stricter rule.
  - `[low]` `[defer]` Verification gap: the rule has no automated check, CI lint passes over a clean tree whether it works or not — same as the Blind test row; Story 4.25.
  - `[medium]` `[defer]` Verification gap (other): omitted `overrideAccess` is privileged and lint-silent — same as the Blind default row.
  - `[medium]` `[defer]` Intent: the purpose reading (no privileged call outside the allowlist) also covers calls that omit the option — same as the Blind default row.
  - `[medium]` `[patch]` Intent: the frontend and `src/fields` can import and spread `system(null)` — same as the Blind import row.
  - `[false]` `[reject]` Intent: `system(ctx | null)` differs from the AC's `system(tx)` — the AC's options are what `system(tx)` returns; `null` exists only to keep the onInit sweep's no-`req` call unchanged, as the AC's "behaviour does not change" requires.
  - `[low]` `[reject]` Intent: existing tests check service results, not each call's options — the options were checked call by call in the diff; a test of the options passed would be the mocked call sequence the tests convention forbids.

## Design Notes

```ts
/** Spine, AD-3: the Local API options for a call with system privileges. `null` only outside any request (onInit). */
export function system(ctx: Context | null) {
  return ctx
    ? ({ req: ctx.req, overrideAccess: true, depth: 0 } as const)
    : ({ overrideAccess: true, depth: 0 } as const)
}
```

## Verification

**Commands:**
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors
- `grep -rn "overrideAccess: true" src` -- expected: only `src/lib/catalogue/system.ts`
- `npm run test:unit && npm run test:int` -- expected: all pass (re-run `scanScreen.unit.spec.ts` once if it times out under load)

**Manual checks:**
- Add `overrideAccess: true` to an object in `src/lib/copies/` and in `src/lib/catalogue/saveCopy.ts`, run `npx eslint` on each: both report `bookeh/system-privileges`. Revert.

## Auto Run Result

Status: done

**Summary:** `system(ctx)` in `src/lib/catalogue/system.ts` is the one source of privileged Local API options; all eleven sites in `lib/catalogue` spread it with their options unchanged (`system(null)` for the onInit media sweep, `depth: 1` after the spread in `readBook`). The new lint rule `bookeh/system-privileges` fails on any `overrideAccess` property but `false` in `src` outside `system.ts` and the first-user seed, and on a value import of `system()` from outside `src/lib/catalogue`. AD-3 in the spine says so.

**Files changed:**
- `src/lib/catalogue/system.ts` -- new helper.
- `src/lib/catalogue/{covers,createPrivateBook,ensureSharedBook,findOrCreateByName,isUnreferenced,sharePrivateBook}.ts` -- literals and inline options replaced by `...system(...)`.
- `eslint.config.mjs` -- `systemPrivileges` rule in the `bookeh` plugin, enabled for `src/**`, off for the helper and the seed; `resolveSource`/`isTypeOnly` moved to module scope and shared with `clientLibImports` (unchanged behaviour).
- `ARCHITECTURE-SPINE.md` -- AD-3 rule line for the helper, its import limit and the lint ban.
- `_bmad-output/implementation-artifacts/epic-4-context.md` -- recompiled (stale after b38db51).

**Review findings:** 23 — 7 patched (1 medium entry: helper importable outside `lib/catalogue`; low: lint message, stricter property check covering `true as const`/shorthand/variables, spine wording "Local API call"), 2 deferred (omitted `overrideAccess` inherits Payload's privileged default — medium, pre-existing; a `RuleTester` check for the rule — belongs in Story 4.25's spec), 14 rejected: `system(null)` misuse (rare, more surface), seed exemption (the AC names it), computed keys and assignments (deliberate workarounds), union return type (no caller needs it), `depth` on `count` (ignored), `system(ctx | null)` vs `system(tx)` (false: keeps the sweep unchanged), options-level tests (would be mocked-call tests).

**Follow-up review recommended:** false — patched entries: high 0, medium 1, low 6.

**Verification:** `npm run lint` 0 errors (36 pre-existing migration warnings); `npm run typecheck` clean; `npm run test:unit` 670 passed; `npm run test:int` 396 passed, 1 skipped (port 5447 container), no test file changed. `grep -rn "overrideAccess: true" src`: only `system.ts` plus a pre-existing comment in `src/access/asRequestUser.ts:8`. Lint probes via `eslint --stdin`: `true`, `'overrideAccess': true`, `true as const` and shorthand error in `src/lib/copies`; a literal in `saveCopy.ts` errors; `false` passes; importing `system` from `src/fields` errors, from `src/lib/catalogue` passes; the literal in `system.ts` passes.

**Residual risks:** 4.17–4.19 edit `ensureSharedBook.ts`, `createPrivateBook.ts` and `sharePrivateBook.ts` in parallel worktrees; whichever merges after 4.21 resolves small conflicts and must spread `system(tx)` in any new privileged call (lint will flag a literal). 4.25's `RuleTester` spec will sit on the now module-scope `resolveSource`.
