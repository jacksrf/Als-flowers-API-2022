# Reset local `master` to match production server

Use this when the droplet has the code that actually runs, and GitHub `master` has diverged or was never deployed.

## Step 1 — On the server (SSH as `nodeuser`)

```bash
cd ~/deploy/API-als-flowers-2022

echo "=== What is running in prod? ==="
git status -sb
git log -1 --oneline
git rev-parse HEAD

# Publish this exact commit to GitHub (safe — does not change prod files)
git push origin HEAD:production-live
```

If `git push` fails (detached HEAD, no remote, etc.):

```bash
git remote -v
git branch production-live
git push origin production-live
```

Copy the one-line commit hash from `git log -1`.

## Step 2 — On your Mac (this repo)

```bash
cd /path/to/Als-flowers-API-2022

git fetch origin

# Optional: keep today's GitHub master as backup (already pushed as backup/pre-server-reset-20260518)
git branch backup/github-master-before-reset origin/master

# Make local master match the server
git checkout master
git reset --hard origin/production-live

# Confirm you have server code
git log -1 --oneline
ls lib/printOrder.js   # should NOT exist if server is pre-reliability deploy
```

## Step 3 — Start over cleanly

1. Create a new branch from this baseline: `git checkout -b fix/reliability-v2`
2. Re-apply changes from backup branches if needed:
   - `git log origin/backup/pre-server-reset-20260518 -1 --oneline`
   - `git cherry-pick <commit>` or `git diff origin/production-live..origin/ae76e117` to review reliability patch
3. Deploy with `bash scripts/deploy-prod.sh` on the server after merging to `master`

## If you meant the opposite (server should catch up to GitHub)

Server is **behind** `master` — do not reset local to server; instead on server:

```bash
cd ~/deploy/API-als-flowers-2022
git fetch origin
git log -1 --oneline          # note current commit
git pull origin master
npm install
pm2 restart als-flowers-api
```

Quick check after deploy: `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.alsflowersmontgomery.com/new2/order` should return **410**.

## Backup branches on GitHub (do not delete yet)

| Branch | Contents |
|--------|----------|
| `backup/pre-server-reset-20260518` | Printer 74798829 WIP on top of latest master |
| `master` @ `ae76e117` | Reliability deploy (fast webhook, printOrder.js, deploy scripts) |
