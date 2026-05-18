#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "==> git pull"
git pull origin master
echo "==> npm install"
npm install
echo "==> pm2 restart"
pm2 restart als-flowers-api --max-memory-restart 350M || pm2 start ecosystem.config.js
pm2 save
echo "==> done — tail logs: pm2 logs als-flowers-api --lines 20"
