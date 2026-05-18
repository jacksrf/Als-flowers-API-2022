# Deploy — safe reliability release

## One command (on the server)

```bash
bash ~/deploy/API-als-flowers-2022/scripts/deploy-prod.sh
```

Pulls latest `master`, tags rollback, `npm install`, PM2 restart with memory limits, and prints status.

---

## Phase 0 (server, before or after code deploy)

```bash
cd ~/deploy/API-als-flowers-2022
git tag -a api-$(date +%Y-%m-%d) -m "Pre reliability deploy"
git push origin api-$(date +%Y-%m-%d)

cd ~/deploy/ADMIN-als-flowers-2021
git tag -a admin-$(date +%Y-%m-%d) -m "Pre reliability deploy"
git push origin admin-$(date +%Y-%m-%d)

# PM2 memory limits (if not using ecosystem.config.js)
pm2 restart als-flowers-api --max-memory-restart 350M
pm2 restart ADMIN-als-flowers-2021 --max-memory-restart 300M
pm2 save

# PDF cleanup (dry run)
find ~/deploy/API-als-flowers-2022/public/pdf -type f -name '*.pdf' -mtime +14 | head

# Enable cron
chmod +x ~/deploy/API-als-flowers-2022/scripts/cleanup-pdf.sh
# crontab: 0 3 * * * .../scripts/cleanup-pdf.sh >> ~/logs/pdf-cleanup.log 2>&1

# Nginx 504 evidence (sudo)
sudo grep -E 'timed out|upstream|504' /var/log/nginx/error.log | tail -50
```

## Deploy API only

```bash
cd ~/deploy/API-als-flowers-2022
git pull
npm ci   # or npm install
pm2 restart als-flowers-api
pm2 logs als-flowers-api --lines 50
```

## Smoke test

1. Staff login → `/orders` loads
2. Place test order or replay webhook → log shows `POST /new/order 200` in **&lt; 100ms**
3. Within ~1 min: `NEW ORDER#:…` in logs (background print)
4. PDF URL: `https://api.alsflowersmontgomery.com/pdf/{id}.pdf`

## Rollback

```bash
cd ~/deploy/API-als-flowers-2022
git checkout api-YYYY-MM-DD   # tag from Phase 0
pm2 restart als-flowers-api
```
