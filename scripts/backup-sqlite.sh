#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
DB_PATH="${DATABASE_PATH:-${BACKEND_DIR}/data/aktyor.sqlite}"
UPLOAD_DIR="${UPLOAD_DIR:-${BACKEND_DIR}/uploads}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
LOCK_DIR="${BACKUP_DIR}/.backup.lock"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="${BACKUP_DIR}/${TIMESTAMP}"
DB_BACKUP_PATH="${RUN_DIR}/aktyor.sqlite"
DB_ARCHIVE_PATH="${DB_BACKUP_PATH}.gz"
UPLOAD_BACKUP_PATH="${RUN_DIR}/uploads.tar.gz"
MANIFEST_PATH="${RUN_DIR}/manifest.txt"
CHECKSUM_PATH="${RUN_DIR}/SHA256SUMS"

cleanup() {
  rmdir "${LOCK_DIR}" 2>/dev/null || true
}

mkdir -p "${BACKUP_DIR}"
if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  echo "Another backup is already running: ${LOCK_DIR}" >&2
  exit 1
fi
trap cleanup EXIT

mkdir -p "${RUN_DIR}"

if [[ ! -f "${DB_PATH}" ]]; then
  echo "Database not found: ${DB_PATH}" >&2
  exit 1
fi

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "${DB_PATH}" ".backup '${DB_BACKUP_PATH}'"
else
  cp "${DB_PATH}" "${DB_BACKUP_PATH}"
  for suffix in "-wal" "-shm"; do
    if [[ -f "${DB_PATH}${suffix}" ]]; then
      cp "${DB_PATH}${suffix}" "${DB_BACKUP_PATH}${suffix}"
    fi
  done
fi

gzip -f "${DB_BACKUP_PATH}"

if [[ -d "${UPLOAD_DIR}" ]]; then
  tar -czf "${UPLOAD_BACKUP_PATH}" -C "${UPLOAD_DIR}" .
fi

{
  echo "created_at=${TIMESTAMP}"
  echo "database_path=${DB_PATH}"
  echo "upload_dir=${UPLOAD_DIR}"
  echo "backup_dir=${RUN_DIR}"
  echo "retention_days=${RETENTION_DAYS}"
  echo "sqlite_backup=$(basename "${DB_ARCHIVE_PATH}")"
  if [[ -f "${UPLOAD_BACKUP_PATH}" ]]; then
    echo "uploads_backup=$(basename "${UPLOAD_BACKUP_PATH}")"
  fi
} > "${MANIFEST_PATH}"

(
  cd "${RUN_DIR}"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 ./*.gz manifest.txt > "${CHECKSUM_PATH}"
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum ./*.gz manifest.txt > "${CHECKSUM_PATH}"
  fi
)

find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} +

echo "Backup created: ${RUN_DIR}"
