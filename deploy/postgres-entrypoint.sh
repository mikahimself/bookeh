#!/bin/sh
# Refuses to start Postgres unless the NAS marker file is visible. The marker
# lives at ${BOOKEH_PG_DIR}/.bookeh-nas-mounted on the host and only exists
# when the NAS is actually mounted; without it the bind sources are empty
# auto-created local directories and the stock entrypoint would happily
# initdb a brand-new cluster there. Runs on every container start, including
# restart-policy restarts, which is why this is an entrypoint wrapper and not
# a one-time check.
set -eu

if [ ! -f /bookeh-nas/.bookeh-nas-mounted ]; then
  echo "bookeh: NAS marker /bookeh-nas/.bookeh-nas-mounted is missing —" \
    "the NAS is not mounted. Refusing to start Postgres on a local" \
    "directory. Mount the NAS (see deploy/README.md) and start again." >&2
  exit 1
fi

exec docker-entrypoint.sh "$@"
