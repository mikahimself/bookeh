const KEY = Symbol.for('bookeh.processState')

type Registry = Map<string, unknown>

// On `globalThis`, not in a module variable: pages, server actions and route
// handlers can each load their own copy of this module, and HMR or
// `vi.resetModules()` load a fresh one. All of them find this one registry, so
// in `next dev` a changed `init` takes effect only after a restart.
// `src/proxy.ts` must not use it: Proxy runs apart from render code and must not
// rely on shared modules or globals (bundled Next docs, proxy.md).
const registry = ((globalThis as Record<symbol, unknown>)[KEY] ??= new Map()) as Registry

/**
 * Spine, AD-12. The only home for in-process state (lookup cache, circuit
 * breaker, rate limit, `requestId` memory, Undo receipts). Returns the value
 * stored under `key`, calling `init()` only the first time. There is no setter:
 * the value is a mutable container (object, Map, ...) the caller changes in
 * place, hence `T extends object`. Lost on restart, one app instance. The
 * registry never evicts: each caller bounds its own state.
 * Keys are namespaced by the caller, e.g. `'metadata.cache'`.
 */
export function processState<T extends object>(key: string, init: () => T): T {
  if (registry.has(key)) return registry.get(key) as T
  const value = init()
  registry.set(key, value)
  return value
}
