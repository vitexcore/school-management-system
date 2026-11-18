#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR=${BACKUP_DIR:-/var/backups/school-management}
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$BACKUP_DIR/school-management-$STAMP.dump"

pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" > "$OUT"
find "$BACKUP_DIR" -type f -name 'school-management-*.dump' -mtime "+$BACKUP_RETENTION_DAYS" -delete
echo "Database backup created: $OUT"
