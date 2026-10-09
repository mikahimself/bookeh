import type { Page } from '@playwright/test'

export type Recorded = {
  types: string[]
  ready: boolean
  animations: {
    pseudo: string
    /** The CSS animation's keyframes name; empty for a non-CSS animation. */
    name: string
    direction: string
    duration: number
    state: string
  }[]
}

/**
 * Records every view transition the page starts: its types, and once its
 * pseudo-elements exist, the animations running on them. Pass it to
 * `page.addInitScript`; it runs in the page, so it closes over nothing.
 */
export function probeViewTransitions() {
  const w = window as unknown as { __vt: Recorded[] }
  w.__vt = []
  const start = Document.prototype.startViewTransition
  Document.prototype.startViewTransition = function (
    this: Document,
    arg?: Parameters<typeof start>[0],
  ) {
    const transition = start.call(this, arg)
    const types = (transition as unknown as { types?: Iterable<string> }).types
    const record: Recorded = { types: [...(types ?? [])], ready: false, animations: [] }
    w.__vt.push(record)
    const settle = () => {
      record.animations = document
        .getAnimations()
        .filter((a) =>
          (a.effect as KeyframeEffect | null)?.pseudoElement?.startsWith('::view-transition'),
        )
        .map((a) => ({
          pseudo: (a.effect as KeyframeEffect).pseudoElement ?? '',
          name: (a as CSSAnimation).animationName ?? '',
          direction: a.effect?.getTiming().direction ?? 'normal',
          duration: Number(a.effect?.getComputedTiming().duration ?? 0),
          state: a.playState,
        }))
      record.ready = true
    }
    transition.ready.then(settle, settle)
    return transition
  } as typeof start
}

/** The settled record of the view transition that carried `type`. */
export async function transitionOfType(page: Page, type: string): Promise<Recorded> {
  const handle = await page.waitForFunction(
    (t) =>
      (window as unknown as { __vt: Recorded[] }).__vt.find((r) => r.types.includes(t) && r.ready),
    type,
  )
  return (await handle.jsonValue()) as Recorded
}

/** Every running view-transition animation longer than 0 ms, across all transitions. */
export const longAnimations = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __vt: Recorded[] }).__vt.flatMap((r) =>
      r.animations.filter((a) => a.state === 'running' && a.duration > 0),
    ),
  )
