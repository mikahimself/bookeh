#!/bin/sh
# Nightly backup for bookeh (story 2.3). Dumps Postgres in custom format and
# copies the media directory into a fresh dated directory under
# ${BOOKEH_BACKUP_DIR}, verifies the dump with `pg_restore --list`, prunes
# runs older than the retention, and records the outcome in
# ${BOOKEH_STATUS_DIR}/last-backup.json (which the app container mounts
# read-only at /app/backup-status).
#
# Runs on the LXC as root, driven by bookeh-backup.timer; systemd captures
# stdout/stderr into the journal, a manual run prints to the terminal.
# Postgres is reached only through `docker compose exec -T postgres`
# (local-socket trust inside the container) — no client install and no
# password handling on the LXC.
set -eu
umask 077

# Configuration comes from the deploy .env (EnvironmentFile= in
# bookeh-backup.service); the defaults match the production paths. For a
# local rehearsal point BOOKEH_COMPOSE_FILE at docker-compose.yml and the
# directories at scratch paths.
BOOKEH_BACKUP_DIR="${BOOKEH_BACKUP_DIR:-/mnt/nas/bookeh/backups}"
BOOKEH_STATUS_DIR="${BOOKEH_STATUS_DIR:-/mnt/nas/bookeh/backup-status}"
BOOKEH_BACKUP_RETENTION_DAYS="${BOOKEH_BACKUP_RETENTION_DAYS:-30}"
BOOKEH_COMPOSE_FILE="${BOOKEH_COMPOSE_FILE:-compose.prod.yml}"
BOOKEH_MEDIA_DIR="${BOOKEH_MEDIA_DIR:-/mnt/nas/bookeh/media}"

compose() {
  docker compose -f "$BOOKEH_COMPOSE_FILE" "$@"
}

# Atomic status write (tmp + mv), world-readable so the app user can read it
# through the read-only mount. $1 = success|failure, $2 = dump size in bytes.
write_status() {
  _tmp="${BOOKEH_STATUS_DIR}/.last-backup.json.tmp"
  printf '{"time":"%s","outcome":"%s","dumpSizeBytes":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" > "$_tmp"
  chmod 644 "$_tmp"
  mv "$_tmp" "${BOOKEH_STATUS_DIR}/last-backup.json"
}

dump_size() {
  if [ -f "${run_dir}/bookeh.dump" ]; then
    wc -c < "${run_dir}/bookeh.dump" | tr -d '[:space:]'
  else
    echo 0
  fi
}

run_dir=''
ok=0

# Any failure lands here (set -e): record it, keep the evidence as
# <ts>.failed — never mistakable for a restorable backup, still matching the
# prune pattern so it ages out — and never touch older runs.
on_exit() {
  rc=$?
  if [ "$ok" -eq 1 ]; then
    return 0
  fi
  _size=0
  if [ -n "$run_dir" ] && [ -d "$run_dir" ]; then
    _size="$(dump_size)"
    mv "$run_dir" "${run_dir}.failed" || true
  fi
  write_status failure "$_size" || true
  echo "bookeh-backup: FAILED (exit $rc) — see messages above" >&2
}
trap on_exit EXIT
# An untrapped signal kills the shell without running the EXIT trap, which
# would leave a partial dump under a restorable-looking dated name and a
# stale success status. Route signals through exit so on_exit still runs.
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# --- Guards: refuse before touching anything -------------------------------

# Never create the backup root: when the NAS is not mounted the directory is
# missing, and a backup onto a local directory would be worse than none.
if [ ! -d "$BOOKEH_BACKUP_DIR" ]; then
  echo "bookeh-backup: backup directory $BOOKEH_BACKUP_DIR does not exist" \
    "(NAS not mounted?). Refusing to run." >&2
  exit 1
fi

if [ ! -d "$BOOKEH_STATUS_DIR" ]; then
  echo "bookeh-backup: status directory $BOOKEH_STATUS_DIR does not exist." >&2
  exit 1
fi

if [ ! -d "$BOOKEH_MEDIA_DIR" ]; then
  echo "bookeh-backup: media directory $BOOKEH_MEDIA_DIR does not exist." >&2
  exit 1
fi

case "$BOOKEH_BACKUP_RETENTION_DAYS" in
  '' | *[!0-9]*)
    echo "bookeh-backup: BOOKEH_BACKUP_RETENTION_DAYS must be a number," \
      "got '$BOOKEH_BACKUP_RETENTION_DAYS'." >&2
    exit 1
    ;;
esac

# Empty-database guard: a dump of a bookeh with no users is a dump of the
# wrong (fresh/misconfigured) database. Refuse before dumping.
users="$(compose exec -T postgres psql -U bookeh -d bookeh -tAc \
  'select count(*) from users')"
case "$users" in
  '' | *[!0-9]*)
    echo "bookeh-backup: could not count users (got '$users')." >&2
    exit 1
    ;;
esac
if [ "$users" -eq 0 ]; then
  echo "bookeh-backup: users table is empty — refusing to back up what" \
    "looks like a fresh or wrong database." >&2
  exit 1
fi

# --- Backup -----------------------------------------------------------------

ts="$(date -u +%Y%m%d-%H%M%S)"
run_dir="${BOOKEH_BACKUP_DIR}/${ts}"
mkdir "$run_dir"

echo "bookeh-backup: dumping database to ${run_dir}/bookeh.dump"
compose exec -T postgres pg_dump -U bookeh -Fc bookeh > "${run_dir}/bookeh.dump"

# Self-verification: a dump pg_restore cannot read is not a backup.
compose exec -T postgres pg_restore --list > /dev/null < "${run_dir}/bookeh.dump"

echo "bookeh-backup: copying media from ${BOOKEH_MEDIA_DIR}"
cp -a "$BOOKEH_MEDIA_DIR" "${run_dir}/media"

# --- Prune (only after a fully successful backup) ---------------------------

echo "bookeh-backup: pruning runs older than ${BOOKEH_BACKUP_RETENTION_DAYS} days"
find "$BOOKEH_BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' \
  -mtime "+${BOOKEH_BACKUP_RETENTION_DAYS}" -exec rm -rf {} +

size="$(dump_size)"
write_status success "$size"
ok=1
echo "bookeh-backup: OK — ${run_dir}/bookeh.dump (${size} bytes) + media copy"
