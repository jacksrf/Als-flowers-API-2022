#!/usr/bin/env bash
# Delete generated order PDFs older than 14 days (keeps disk usage down).
set -euo pipefail
DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)/public/pdf}"
find "$DIR" -maxdepth 1 -name '*.pdf' -mtime +14 -delete
