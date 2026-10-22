#!/bin/sh
# Restore rehearsal for bookeh (story 4.10, NFR-6). Restores a backup.sh run
# (the latest one, or the dated directory given as $1) into a throwaway
# Postgres initialised with the Finnish ICU collation and a scratch copy of
# its media, starts the production app image on them, and checks:
#
#   collation  the restore target was created ICU fi-FI, as any real
#              restore must be (README, "Collation and restore")
#   counts     the tables in TABLES (users and roles, the catalogue, its
#              links, copies, user-books, locations) hold as many rows as
#              production
#   sign-in    the restored users can sign in (POST /api/users/login)
#   covers     every book cover loads through the app (the admin reads all)
#
# then prints the time taken and OK. Everything it creates (two containers,
# a network, a mktemp directory) is removed on exit, whatever the outcome.
#
# Runs on the LXC as root, from /opt/bookeh, by hand (README, "Restore
# rehearsal"). Read-only towards production: the database is only queried
# through `docker compose exec -T postgres psql`; the backup and media are
# only read. No secret is taken from production's .env (compose reads it only
# for interpolation): the scratch database password and PAYLOAD_SECRET are
# random per run (Payload salts each password hash,
# so sign-in does not depend on the secret).
set -eu
umask 077

BOOKEH_BACKUP_DIR="${BOOKEH_BACKUP_DIR:-/mnt/nas/bookeh/backups}"
BOOKEH_COMPOSE_FILE="${BOOKEH_COMPOSE_FILE:-compose.prod.yml}"
BOOKEH_RESTORE_PORT="${BOOKEH_RESTORE_PORT:-3001}"

TABLES='users users_roles books books_rels books_texts authors series genres media
  copies user_books user_books_rels locations'

compose() {
  docker compose -f "$BOOKEH_COMPOSE_FILE" "$@"
}

say() {
  echo "restore-rehearsal: $*"
}

# Names the failed check and exits; the EXIT trap cleans up.
fail() {
  echo "restore-rehearsal: FAILED: $*" >&2
  reported=1
  exit 1
}

step='guards'
reported=0
echo_off=0
scratch=''
started=0
suffix="$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')"
net="bookeh-restore-${suffix}"
pg="bookeh-restore-pg-${suffix}"
app="bookeh-restore-app-${suffix}"

cleanup() {
  rc=$?
  if [ "$echo_off" -eq 1 ]; then
    stty echo 2>/dev/null || true
    echo
  fi
  if [ "$started" -eq 1 ]; then
    docker rm -fv "$app" "$pg" >/dev/null 2>&1 || true
    docker network rm "$net" >/dev/null 2>&1 || true
  fi
  if [ -n "$scratch" ]; then
    rm -rf "$scratch" || true
  fi
  if [ "$rc" -ne 0 ] && [ "$reported" -eq 0 ]; then
    echo "restore-rehearsal: FAILED: ${step} (exit $rc)" >&2
  fi
}
trap cleanup EXIT
# Untrapped signals skip the EXIT trap; route them through exit.
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

scratch_psql() {
  docker exec "$pg" psql -U bookeh -d bookeh -tAc "$1"
}

# Reads one line from the terminal with echo off into the variable named $1.
read_hidden() {
  echo_off=1
  stty -echo
  printf '%s' "$2"
  IFS= read -r "$1"
  stty echo
  echo_off=0
  echo
}

# JSON string escaping for the sign-in body. Pure shell, so the credentials
# never become a command's argument.
json_escape() {
  _rest=$1
  _out=''
  while [ -n "$_rest" ]; do
    _c=${_rest%"${_rest#?}"}
    _rest=${_rest#?}
    case $_c in
      \\ | \") _out="${_out}\\${_c}" ;;
      *) _out="${_out}${_c}" ;;
    esac
  done
  printf '%s' "$_out"
}

# Waits up to $1 seconds for the command in the remaining arguments.
wait_for() {
  _tries=$1
  shift
  while ! "$@" >/dev/null 2>&1; do
    _tries=$((_tries - 1))
    [ "$_tries" -gt 0 ] || return 1
    sleep 1
  done
}

# --- Guards: refuse before creating anything --------------------------------

has_backup() {
  [ -f "$1/bookeh.dump" ] && [ -d "$1/media" ]
}

if [ "$#" -gt 1 ]; then
  fail "usage: $0 [backup-dir]"
fi

if [ "$#" -eq 1 ]; then
  backup=${1%/}
  case "$backup" in
    *.failed) fail "backup: $backup is a failed run" ;;
  esac
  has_backup "$backup" || fail "backup: $backup holds no bookeh.dump and media/"
else
  [ -d "$BOOKEH_BACKUP_DIR" ] ||
    fail "backup: $BOOKEH_BACKUP_DIR does not exist (NAS not mounted?)"
  backup=''
  # Dated names sort chronologically; `<ts>.failed` never matches.
  for d in "$BOOKEH_BACKUP_DIR"/[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]; do
    if has_backup "$d"; then backup=$d; fi
  done
  [ -n "$backup" ] || fail "backup: no successful backup under $BOOKEH_BACKUP_DIR"
fi

case "$BOOKEH_RESTORE_PORT" in
  '' | *[!0-9]*) fail "BOOKEH_RESTORE_PORT must be a number, got '$BOOKEH_RESTORE_PORT'" ;;
esac

[ -t 0 ] || fail "sign-in: needs a terminal for the credentials prompt"

# The scratch app runs production's image, the scratch Postgres production's
# Postgres image (the tag pins the ICU library).
app_id="$(compose ps -q app)"
pg_id="$(compose ps -q postgres)"
[ -n "$app_id" ] && [ -n "$pg_id" ] ||
  fail "production: app and postgres must be running ($BOOKEH_COMPOSE_FILE)"
image="${BOOKEH_RESTORE_IMAGE:-$(docker inspect -f '{{.Image}}' "$app_id")}"
pg_image="$(docker inspect -f '{{.Image}}' "$pg_id")"

# --- Scratch Postgres -------------------------------------------------------

start="$(date +%s)"
say "restoring $backup"

scratch="$(mktemp -d "${TMPDIR:-/tmp}/bookeh-restore.XXXXXX")"
chmod 700 "$scratch"
db_password="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
printf '%s\n' \
  POSTGRES_USER=bookeh \
  "POSTGRES_PASSWORD=${db_password}" \
  POSTGRES_DB=bookeh \
  'POSTGRES_INITDB_ARGS=--locale-provider=icu --icu-locale=fi-FI' \
  > "$scratch/pg.env"
printf '%s\n' \
  "DATABASE_URL=postgres://bookeh:${db_password}@${pg}:5432/bookeh" \
  "PAYLOAD_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
  > "$scratch/app.env"

step='scratch postgres'
started=1
docker network create "$net" >/dev/null
docker run -d --name "$pg" --network "$net" --env-file "$scratch/pg.env" \
  --tmpfs /var/lib/postgresql/data "$pg_image" >/dev/null
# -h localhost: the entrypoint's init-time server listens on the socket only,
# so this answers once the real server is up.
wait_for 120 docker exec "$pg" pg_isready -h localhost -U bookeh -d bookeh ||
  fail "scratch postgres: not ready after 120 s"

step='restore'
docker exec -i "$pg" pg_restore -U bookeh -d bookeh --exit-on-error \
  < "$backup/bookeh.dump"

step='collation'
collation="$(scratch_psql "select datlocprovider::text || '/' || coalesce(daticulocale, '')
  from pg_database where datname = 'bookeh'")"
[ "$collation" = 'i/fi-FI' ] ||
  fail "collation: expected icu/fi-FI, got '$collation'"
say "collation icu/fi-FI"

# --- Counts against production ----------------------------------------------
# Before the app starts, so its start-up cannot change rows first.

step='counts'
counts_sql='select '
for t in $TABLES; do
  [ "$counts_sql" = 'select ' ] || counts_sql="${counts_sql}, "
  counts_sql="${counts_sql}(select count(*) from ${t})"
done
restored="$(scratch_psql "$counts_sql")"
production="$(compose exec -T postgres psql -U bookeh -d bookeh -tAc "$counts_sql")"
differ=''
summary=''
i=1
for t in $TABLES; do
  r="$(printf '%s\n' "$restored" | cut -d'|' -f"$i")"
  p="$(printf '%s\n' "$production" | cut -d'|' -f"$i")"
  case "$r" in '' | *[!0-9]*) fail "counts: could not count $t (got '$r')" ;; esac
  if [ "$r" != "$p" ]; then
    differ="${differ} ${t} (backup ${r}, production ${p})"
  fi
  summary="${summary} ${t}=${r}"
  i=$((i + 1))
done
[ -z "$differ" ] ||
  fail "counts: production differs from the backup in${differ}." \
    "Take a fresh backup (systemctl start bookeh-backup.service), do not" \
    "catalogue meanwhile, and run again."
say "counts match:${summary}"

step='media copy'
cp -a "$backup/media" "$scratch/media"
# The backup's copy is owned by root (backup.sh keeps no ownership); the app
# runs as uid 1001 and owns its media, as in production.
chown -R 1001:1001 "$scratch/media"

# --- App on the restored data -----------------------------------------------

step='app'
docker run -d --name "$app" --network "$net" --env-file "$scratch/app.env" \
  -p "127.0.0.1:${BOOKEH_RESTORE_PORT}:3000" -v "$scratch/media:/app/media" \
  "$image" >/dev/null
base="http://127.0.0.1:${BOOKEH_RESTORE_PORT}"
if ! wait_for 180 curl -fsS -o /dev/null "$base/login"; then
  docker logs --tail 30 "$app" >&2 || true
  fail "app: /login did not answer within 180 s"
fi
say "app up at $base"

# --- Sign-in ----------------------------------------------------------------

step='sign-in'
prompt_start="$(date +%s)"
echo 'Sign in to the restored copy as the admin:'
read_hidden email 'Email (hidden): '
read_hidden password 'Password (hidden): '
prompt_secs=$(($(date +%s) - prompt_start))
# printf is a shell builtin: the body reaches curl on stdin only.
response="$(printf '{"email":"%s","password":"%s"}' \
  "$(json_escape "$email")" "$(json_escape "$password")" |
  curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- \
    "$base/api/users/login")" || fail 'sign-in failed: no answer from the app'
password=''
case "$response" in
  *'"token":"'*) ;;
  *) fail 'sign-in failed' ;;
esac
token=${response#*\"token\":\"}
token=${token%%\"*}
[ -n "$token" ] || fail 'sign-in failed'
say "signed in"

# --- Covers -----------------------------------------------------------------

step='covers'
scratch_psql "select distinct m.filename from books b
  join media m on m.id = b.cover_id order by 1" > "$scratch/covers"
[ -s "$scratch/covers" ] || fail 'covers: no covers to check'
checked=0
missing=''
while IFS= read -r f; do
  code="$(printf 'header = "Authorization: JWT %s"\n' "$token" |
    curl -sS -o /dev/null -w '%{http_code}' -K - "$base/api/media/file/$f")" || true
  if [ "$code" = 200 ]; then
    checked=$((checked + 1))
  else
    missing="${missing} ${f} (${code:-no answer})"
  fi
done < "$scratch/covers"
[ -z "$missing" ] || fail "covers: did not load:${missing}"
say "covers checked: ${checked}"

# --- Done -------------------------------------------------------------------

step='done'
elapsed=$(($(date +%s) - start - prompt_secs))
say "time taken: $((elapsed / 60)) min $((elapsed % 60)) s (without the sign-in prompt)"
say "OK — $backup"
