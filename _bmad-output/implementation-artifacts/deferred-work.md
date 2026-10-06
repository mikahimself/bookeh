# Deferred Work

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-a1-bump-next-js-payload-and-node.md`
  summary: Encode the patched Node version for host development (a `.nvmrc`/`.node-version` with 22.23.3 and a tighter `engines.node` than `>=20.9.0`).
  evidence: Host dev runs `npm run dev` on the host, whose Node is v22.16.0, older than both the old and new Dockerfile pins; nothing outside the Dockerfile states the minimum.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-a1-bump-next-js-payload-and-node.md`
  summary: Pin the Compose `payload` service image (`node:22-alpine`, floating) to `node:22.23.3-alpine` and use `npm ci` instead of `npm install`, or remove the service if host dev is the only dev mode.
  evidence: `docker-compose.yml` names a second, drifting Node version, and `npm install` against the bind-mounted lockfile can rewrite `package-lock.json` from inside the container.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-a1-bump-next-js-payload-and-node.md`
  summary: Stop `.npmrc` `legacy-peer-deps=true` from hiding peer mismatches between the exact-pinned `@payloadcms/*` packages (drop it, or have CI from Story 1.2 fail on `npm ls --all`).
  evidence: `@payloadcms/*` 3.90.2 peer on `payload: "3.90.2"` exactly; with the flag, a partial bump of one package installs silently.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-a1-bump-next-js-payload-and-node.md`
  summary: Decide whether to keep `lexicalEditor()` and `@payloadcms/richtext-lexical` (no collection has a `richText` field); candidate for Story 1.5's clean-up.
  evidence: The 3.90.2 bump pulls `lexical`/`@lexical/*` from 0.41.0 to 0.50.0, a breaking 0.x jump carried for a dependency nothing uses.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-a1-bump-next-js-payload-and-node.md`
  summary: Account in Story 1.8 (`users` collection and its first migration) for Payload 3.90's new auth column `resetPasswordRequestedAt`, and note that its forgot-password rate limit applies only when email is enabled, so token-link resets (FR-5) get none from it.
  evidence: Regenerated `src/payload-types.ts` adds the field; Payload's `forgotPassword` only checks the interval when `!disableEmail && minRequestInterval > 0` (maybe-false for FR-5 until Story 1.8 checks how resets are issued).
