#!/usr/bin/env bash
# Run on DigitalOcean as nodeuser: bash ~/deploy/API-als-flowers-2022/scripts/deploy-prod.sh
set -euo pipefail

API_DIR="${API_DIR:-$HOME/deploy/API-als-flowers-2022}"
TAG="api-$(date +%Y-%m-%d)"

echo "=== Al's Flowers API — reliability deploy ==="
echo "Directory: $API_DIR"
echo "Rollback tag: $TAG"

cd "$API_DIR"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists; skipping tag creation"
else
  git tag -a "$TAG" -m "Pre reliability deploy"
  git push origin "$TAG" || echo "WARN: could not push tag (continue deploy)"
fi

echo "=== git pull ==="
git pull origin master

echo "=== npm install (Node $(node -v)) ==="
npm install

echo "=== pm2 restart ==="
pm2 restart als-flowers-api --max-memory-restart 350M
pm2 restart ADMIN-als-flowers-2021 --max-memory-restart 300M || true
pm2 save

echo "=== PDF cleanup dry run ==="
find "$API_DIR/public/pdf" -type f -name '*.pdf' -mtime +14 2>/dev/null | wc -l | xargs echo "PDFs older than 14 days:"

chmod +x "$API_DIR/scripts/cleanup-pdf.sh" 2>/dev/null || true
echo "Add cron if missing:"
echo "  0 3 * * * $API_DIR/scripts/cleanup-pdf.sh >> \$HOME/logs/pdf-cleanup.log 2>&1"

echo "=== pm2 status ==="
pm2 list

echo "=== Recent logs ==="
pm2 logs als-flowers-api --lines 15 --nostream

echo "=== Deploy complete ==="
echo "Smoke test: login at https://api.alsflowersmontgomery.com/orders"
echo "Rollback: cd $API_DIR && git checkout $TAG && pm2 restart als-flowers-api"
