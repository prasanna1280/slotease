# Deploying SlotEase to a Hostinger VPS

This guide takes a fresh **Hostinger KVM VPS (Ubuntu 24.04)** to a running SlotEase at
`https://<your-domain>` with automatic HTTPS, daily database backups and one-command updates.

```
Internet ──443/80──> Traefik or Caddy (TLS, Let's Encrypt) ──> nginx "frontend" (SPA, /api proxy) ──> backend (gunicorn :8000) ──> Postgres 16
```

**Two proxy modes:**

- **Shared Traefik (default, used on the live server).** The VPS already runs Traefik (Docker provider,
  `websecure` entrypoint, `letsencrypt` resolver) for several apps. The `traefik.*` labels on the `frontend`
  service route `$DOMAIN` to SlotEase, so `./deploy/deploy.sh` publishes **no** ports at all.
- **Bundled Caddy (fresh server with nothing on 80/443).** Run `USE_CADDY=1 ./deploy/deploy.sh`; this enables the
  `caddy` compose profile, which publishes 80/443. The Caddy-specific steps below apply only to this mode.

Postgres, the API and nginx are reachable only on the internal Docker network.

| File | Purpose |
|------|---------|
| `docker-compose.prod.yml` | Production stack: db, backend, frontend (+ Traefik labels), optional caddy profile |
| `deploy/Caddyfile` | HTTPS + reverse proxy for `$DOMAIN` (Caddy mode only) |
| `deploy/production.env.example` | Template for the server's `.env` |
| `deploy/deploy.sh` | Pull, build, restart, wait for health, prune |
| `deploy/backup.sh` | `pg_dump` to `./backups`, 14-day retention |

Recommended plan: **KVM 1** (1 vCPU / 4 GB) is enough to start; **KVM 2** gives headroom for builds.

> **Docker runs only on the VPS.** The development machine never runs Docker; develop locally as
> described in [Local development (no Docker)](#0-local-development-no-docker). CI (GitHub Actions)
> builds the images to catch Dockerfile errors before you deploy.

---

## 0. Local development (no Docker)

Backend (Python 3.12), from `backend/`:

```bash
python -m venv .venv
.venv/Scripts/activate              # PowerShell: .venv\Scripts\Activate.ps1
# source .venv/bin/activate         # Linux / macOS
pip install -r requirements-dev.txt
```

Create `backend/.env` (git-ignored):

```env
# SQLite (zero setup) ...
DATABASE_URL=sqlite:///./slotease.db
# ... or a local/remote Postgres 16 (needed for the exclusion-constraint double-booking guard):
# DATABASE_URL=postgresql+psycopg://slotease:slotease@localhost:5432/slotease
SECRET_KEY=dev-only-secret-key-change-me-0123456789abcdef
ENVIRONMENT=development
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
```

```bash
alembic upgrade head
uvicorn app.main:app --reload       # http://localhost:8000/docs
pytest -q --cov=app                 # tests use SQLite in-memory
```

Frontend (Node 22+), from `frontend/`:

```bash
npm install
npm run dev                         # http://localhost:5173 (Vite proxies /api to :8000, or set VITE_API_URL)
```

Before pushing: `ruff check . && ruff format --check . && mypy app` (backend) and
`npm run lint && npm run type-check && npm test` (frontend). Everything below runs **on the VPS**.

---

## 1. Create the VPS

1. hPanel → **VPS** → choose a plan → OS: **Ubuntu 24.04** (plain OS, no control panel).
2. Set a root password and **add your SSH public key** (hPanel → VPS → Settings → SSH keys).
   No key yet? On your PC: `ssh-keygen -t ed25519 -C "you@example.com"`, then paste the contents of
   `~/.ssh/id_ed25519.pub`.
3. Note the VPS **IPv4 address** from the VPS overview page.

## 2. First login and a non-root deploy user

```bash
ssh root@<VPS_IP>

apt update && apt -y upgrade
adduser deploy                      # set a password (needed for sudo)
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

Open a **second terminal** and confirm `ssh deploy@<VPS_IP>` works. Then disable root and password logins:

```bash
sudo sed -i -E 's/^#?PermitRootLogin .*/PermitRootLogin no/; s/^#?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

Optional but recommended: `sudo apt -y install unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades`.

## 3. Firewall (ufw)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp        # HTTP/3 (optional)
sudo ufw enable
sudo ufw status
```

If Hostinger's own firewall (hPanel → VPS → Security → Firewall) is enabled, allow 22, 80 and 443 there too.

> Docker-published ports bypass ufw. That is why the production compose file publishes **only** Caddy's 80/443.

## 4. Install Docker Engine + Compose plugin (official repository)

```bash
sudo apt -y install ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker deploy
exit                                  # log out and back in so the group applies
```

Check: `ssh deploy@<VPS_IP>` then `docker run --rm hello-world` and `docker compose version`.

## 5. DNS

At your DNS provider (Hostinger: hPanel → Domains → DNS / Nameservers):

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `@` (root domain) **or** `book` (subdomain, e.g. `book.example.com`) | `<VPS_IP>` | 300 |
| AAAA (optional) | same | VPS IPv6 | 300 |

Wait until `dig +short <your-domain>` (or `nslookup`) returns the VPS IP. Caddy can only obtain the
certificate once DNS points at the server and ports 80/443 are open.

## 6. Clone and configure

```bash
cd ~
git clone https://github.com/<you>/<repo>.git slotease     # private repo: use a deploy key or a PAT
cd slotease

cp deploy/production.env.example .env      # (cp .env.example .env also works; then edit the CHANGE values)
nano .env
chmod 600 .env
```

Set at least:

- `DOMAIN` - e.g. `book.example.com` (no `https://`, no trailing slash)
- `POSTGRES_PASSWORD` - `openssl rand -hex 24`
- `SECRET_KEY` - `openssl rand -hex 32`
- `EMAIL_FROM` + `RESEND_API_KEY` (or the `SMTP_*` values) for real confirmation emails
- `RAZORPAY_*` once billing is set up (step 8)

`docker-compose.prod.yml` sets `ENVIRONMENT=production`, `DATABASE_URL`, `FRONTEND_URL=https://$DOMAIN` and
`CORS_ORIGINS=https://$DOMAIN` for you. The API refuses to start in production with a short or default `SECRET_KEY`.

## 7. Deploy

```bash
chmod +x deploy/*.sh          # only needed if the execute bit was lost in git
./deploy/deploy.sh
```

The script pulls (`git pull --ff-only`), validates the compose file, builds the images, starts the stack
(the backend waits for Postgres and runs `alembic upgrade head` automatically), waits until every service is
healthy, prunes dangling images and prints the status. First build takes a few minutes.

Verify:

```bash
curl -I https://<your-domain>
curl https://<your-domain>/health            # {"status":"ok"}
curl https://<your-domain>/api/v1/health     # {"status":"ok","database":"ok"}
```

Open `https://<your-domain>`, sign up as an owner and make a test booking on your public page.

## 8. Razorpay

1. Razorpay Dashboard → **Account & Settings → API Keys**: generate keys → `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
2. **Subscriptions → Plans**: create a monthly plan of Rs 499 → `RAZORPAY_PLAN_ID`.
3. **Account & Settings → Webhooks → Add**:
   - URL: `https://<your-domain>/api/v1/billing/webhook`
   - Secret: a random string (`openssl rand -hex 24`) → `RAZORPAY_WEBHOOK_SECRET`
   - Events: `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`,
     `subscription.cancelled`, `subscription.completed`
4. Re-run `./deploy/deploy.sh` (or `docker compose -f docker-compose.prod.yml up -d`) to load the new values.

Use test-mode keys first, then switch to live keys.

## 9. Backups

```bash
./deploy/backup.sh                    # creates backups/slotease-YYYYmmdd-HHMMSS.sql.gz
crontab -e
```

Add (daily at 02:30 server time):

```
30 2 * * * /home/deploy/slotease/deploy/backup.sh >> /home/deploy/slotease/backups/backup.log 2>&1
```

Backups older than 14 days are deleted automatically (`RETENTION_DAYS` to change). Copy them off the server
regularly (e.g. `scp` / `rsync` to your PC, or enable Hostinger's weekly VPS snapshots as a second layer).

Restore (overwrites current data):

```bash
gunzip -c backups/slotease-YYYYmmdd-HHMMSS.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

## 10. Updating

```bash
cd ~/slotease
./deploy/deploy.sh
```

Migrations run automatically when the new backend container starts. To deploy without pulling
(e.g. after editing `.env`): `SKIP_PULL=1 ./deploy/deploy.sh`.

Rollback: `git checkout <previous-commit>` then `SKIP_PULL=1 ./deploy/deploy.sh` (database migrations are not
rolled back automatically; restore a backup if a migration must be undone).

## 11. Logs and day-to-day commands

```bash
alias dc='docker compose -f docker-compose.prod.yml'
dc ps                                 # status + health
dc logs -f --tail=100 backend         # API (gunicorn access log + app logs)
dc logs -f caddy                      # TLS / certificate issues
dc restart backend
dc exec backend alembic current       # migration state
dc exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Container logs rotate automatically (10 MB x 3 files per service).

## 12. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `set DOMAIN/POSTGRES_PASSWORD/SECRET_KEY in .env` | `.env` is missing or a required value is empty. |
| Browser shows certificate error / Caddy logs `challenge failed` | DNS A record not pointing at the VPS yet, or ports 80/443 blocked (ufw or hPanel firewall). Fix, then `dc restart caddy`. Let's Encrypt rate-limits repeated failures, so check DNS first. |
| Backend `unhealthy` / restarting | `dc logs backend`. Common causes: `SECRET_KEY` too short/default in production, migration error, DB password changed after the volume was created. |
| Changed `POSTGRES_PASSWORD` after first start | Postgres keeps the original password in its volume. Change it inside the DB (`ALTER USER slotease PASSWORD '...'`) or, on a fresh install only, `dc down -v` (DELETES ALL DATA). |
| 502 Bad Gateway | Backend not healthy yet; wait or check `dc logs backend`. |
| Emails not sent | Without `RESEND_API_KEY`/`SMTP_HOST` emails are only logged (`dc logs backend \| grep email`). Check the sender domain is verified. |
| Razorpay webhook 400 | `RAZORPAY_WEBHOOK_SECRET` differs from the secret entered in the dashboard. |
| Build killed / out of memory | Add swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' \| sudo tee -a /etc/fstab` |
| Disk filling up | `docker system df`, `docker image prune -a -f`, check `backups/`. |
