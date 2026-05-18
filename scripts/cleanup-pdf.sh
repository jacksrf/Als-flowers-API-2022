#!/usr/bin/env bash
# Remove generated order PDFs older than 14 days.
# Install on server (crontab -e):
#   0 3 * * * /home/nodeuser/deploy/API-als-flowers-2022/scripts/cleanup-pdf.sh >> /home/nodeuser/logs/pdf-cleanup.log 2>&1

set -euo pipefail

PDF_DIR="${PDF_DIR:-/home/nodeuser/deploy/API-als-flowers-2022/public/pdf}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [[ ! -d "$PDF_DIR" ]]; then
  echo "PDF dir not found: $PDF_DIR"
  exit 1
fi

echo "$(date -Is) cleaning PDFs in $PDF_DIR older than ${RETENTION_DAYS} days"
find "$PDF_DIR" -type f -name '*.pdf' -mtime "+${RETENTION_DAYS}" -print -delete
du -sh "$PDF_DIR" || true
