# Google Books volumes

Real Google Books volume records for books on the shelf, one file per volume, named by its volume id. The Google Books adapter tests (`tests/unit/google.unit.spec.ts`) read them.

**Why they exist.** On 2026-10-11 Google's `volumes?q=isbn:<isbn13>` search answered 503 or a spurious `totalItems: 0` all day, so `npm run fixtures` (story 3.2) could not record any search responses. These volumes stand in until it can.

**How they were recorded.** Each volume id was found through the canonical link of `books.google.fi/books?vid=ISBN<isbn>`, then fetched once with `GET https://www.googleapis.com/books/v1/volumes/<volumeId>` using an API key (2026-10-11). The files are the responses unchanged; none contains the key.

**How tests use them.** A by-id volume is not a search answer, so tests wrap volumes in a search body, `{ kind: 'books#volumes', totalItems, items: [volume, …] }`. A by-id volume carries more than a search item (`printedPageCount`, `dimensions`, full BISAC categories, HTML descriptions); the adapter reads only fields search items also have.

The search responses from `npm run fixtures` will sit beside this directory as `tests/fixtures/google/<isbn13>.json`. Do not write files there by hand: capture skips any ISBN whose file already exists.
