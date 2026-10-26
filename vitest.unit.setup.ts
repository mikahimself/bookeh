// Setup for the `unit` project. A `findBy*` or `waitFor` gives up after 1 s
// by default, which the overlay tests in `collectionPage.unit.spec.ts`
// outgrow on a loaded CI runner: an open, an action and a close each wait
// on a transition. 5 s matches Vitest's test timeout, so a wait only fails
// when the test would anyway.
import { configure } from '@testing-library/dom'

configure({ asyncUtilTimeout: 5000 })
