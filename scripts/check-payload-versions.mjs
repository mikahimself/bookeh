// `.npmrc` keeps legacy-peer-deps (`npm ci` fails without it), which also
// hides a Payload peer mismatch, so CI checks the lockfile directly. Takes an
// optional lockfile path; default: ./package-lock.json.
import { readFileSync } from 'node:fs'

const lockfile = process.argv[2] ?? 'package-lock.json'
const { packages } = JSON.parse(readFileSync(lockfile, 'utf8'))

const byVersion = new Map()
for (const [key, { version }] of Object.entries(packages)) {
  if (!/(^|\/)node_modules\/(payload|@payloadcms\/[^/]+)$/.test(key)) continue
  byVersion.set(version, [...(byVersion.get(version) ?? []), key.replace(/^.*node_modules\//, '')])
}

if (byVersion.size !== 1) {
  process.stderr.write(
    `Payload packages must share one version; ${lockfile} has ${byVersion.size}:\n`,
  )
  for (const [version, names] of byVersion) {
    process.stderr.write(`  ${version}: ${names.join(', ')}\n`)
  }
  process.exit(1)
}

const [[version, names]] = byVersion
process.stdout.write(`${names.length} Payload packages at ${version}\n`)
