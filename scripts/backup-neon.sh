#!/usr/bin/env bash
# Encrypted custom-format backup. PGSERVICEFILE must contain a [ilker-backup]
# DIRECT Neon connection; do not put credentials in arguments or this script.
set -euo pipefail
umask 077
if [[ $# -ne 2 ]]; then echo 'Usage: backup-neon.sh ABSOLUTE_OUTPUT_PATH ABSOLUTE_PASSPHRASE_FILE' >&2; exit 2; fi
output=$1; passphrase=$2
[[ "$output" = /* && "$passphrase" = /* && -n "${PGSERVICEFILE:-}" ]] || { echo 'Absolute paths and PGSERVICEFILE are required.' >&2; exit 2; }
[[ -f "$PGSERVICEFILE" && -f "$passphrase" && ! -e "$output" ]] || { echo 'Missing private configuration or output already exists.' >&2; exit 2; }
for tool in pg_dump gpg; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 2; }; done
temporary="${output}.partial.$$"
trap 'rm -f -- "$temporary"' EXIT
PGSERVICE=ilker-backup pg_dump --format=custom --no-owner --no-acl --table='public.ilker_*' | gpg --batch --yes --pinentry-mode loopback --passphrase-file "$passphrase" --symmetric --cipher-algo AES256 --output "$temporary"
[[ -s "$temporary" ]] || { echo 'Backup is empty.' >&2; exit 1; }
mv -n -- "$temporary" "$output"
[[ -f "$output" && ! -e "$temporary" ]] || { echo 'Output already exists; backup was not replaced.' >&2; exit 1; }
echo 'Encrypted table backup created. Restore-test it; keep its key separately.'
