# SlotEase — Appointment Booking SaaS

> Customers book online in 30 seconds, owners manage their day from one dashboard, and double bookings never happen.

**Live:** [slotease.prasanna.digital](https://slotease.prasanna.digital) · **API reference:** [below](#api-endpoints) (Swagger UI at `/docs` when running locally)

SlotEase is a multi-tenant SaaS for clinics, salons and physiotherapy centres that still take bookings by phone and
WhatsApp. Every business (tenant) gets its own public booking page, e.g. `slotease.prasanna.digital/glow-salon`.
Customers pick a service, a date and a free slot, enter their name and phone, and confirm. The owner runs the day from
one dashboard: today's appointments, a weekly calendar, services, working hours, one-click **Completed / No-show**,
customers and monthly reports. Plan: **₹499/month** after a 14-day free trial (Razorpay).

---

## Features

| Area | What you get |
|---|---|
| Public booking page | Mobile-first stepper: service → date & time → details → confirmation with booking ID and "Add to calendar" |
| Slot engine | Free slots = working hours (incl. breaks) − existing bookings, respecting service duration, slot interval, minimum notice and booking window, in the business's timezone (DST-safe) |
| No double bookings | Per-tenant row lock + in-transaction overlap check + **database constraints**: partial unique `(business_id, start_time)` and a PostgreSQL `EXCLUDE` constraint on overlapping time ranges → `409 SLOT_TAKEN` |
| Owner dashboard | Today's KPIs, appointment list with Complete / No-show / Cancel, new phone/walk-in bookings |
| Calendar | Week time-grid on tablets/desktops, day list on phones |
| Customers | History, visits, no-shows, repeat customers (customer upsert by phone) |
| Reports | Monthly bookings, no-show rate, revenue estimate, busiest day, daily chart, top services |
| Billing | Razorpay Subscriptions (₹499/month), checkout + webhook signature verification, idempotent webhooks |
| Email | Booking confirmation (customer + owner) and password reset via Resend or SMTP (console fallback) |
| Security | bcrypt, JWT access + rotating refresh tokens with reuse detection, rate limits, tenant isolation on every query |
| Responsive | 320px phones → iPhone / Android → iPad → laptops → large monitors; safe areas, 44px touch targets |
| Privacy | Public privacy policy at `/privacy`, linked from footers, sign-up and the booking form (contact and date in `frontend/src/lib/legal.ts`) |

---

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React 19, Vite, TypeScript (strict), Tailwind CSS v4, shadcn/ui-style Radix components, TanStack Query, react-hook-form + zod, Recharts |
| Backend | FastAPI, Python 3.12, SQLAlchemy 2.0, Alembic, Pydantic v2, slowapi, PyJWT, bcrypt, httpx |
| Database | PostgreSQL 16 (SQLite for the fast unit-test suite) |
| Payments / Email | Razorpay Subscriptions · Resend or SMTP |
| Infra | Docker Compose on a Hostinger VPS behind Traefik (Let's Encrypt), Redis (shared rate-limit counters), GitHub Actions CI |

---

## Local development (no Docker)

Docker is used **only on the VPS**. Locally you run the backend in a virtualenv and the frontend with Vite.

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows  (Linux/macOS: source .venv/bin/activate)
pip install -r requirements-dev.txt
# optional: create backend/.env (defaults to SQLite ./slotease.db)
#   DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/slotease
alembic upgrade head
uvicorn app.main:app --reload     # http://localhost:8000  (Swagger: /docs)
```

### Frontend

```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173  (proxies /api to :8000)
```

Open http://localhost:5173, click **Start free trial**, register a business, add services, then open
`http://localhost:5173/<your-slug>` in another browser (or your phone) to book.

### Tests and quality checks

```bash
cd backend
pytest --cov=app                  # SQLite suite incl. concurrency + tenant isolation
ruff check . && ruff format --check . && mypy app
# PostgreSQL-only tests (EXCLUDE constraint, concurrent booking) run when TEST_POSTGRES_URL is set (CI does this)

cd frontend
npm run lint && npm run type-check && npm test && npm run build
```

---

## Production deployment (Hostinger VPS, Docker)

Full guide: [`deploy/README.md`](deploy/README.md). Short version, on the VPS:

```bash
git clone https://github.com/prasanna1280/slotease.git /opt/apps/slotease
cd /opt/apps/slotease
cp deploy/production.env.example .env && nano .env   # DOMAIN, POSTGRES_PASSWORD, SECRET_KEY, (Razorpay, email)
chmod 600 .env
./deploy/deploy.sh               # existing Traefik routes ${DOMAIN} via container labels
# fresh server without a reverse proxy:  USE_CADDY=1 ./deploy/deploy.sh
```

Razorpay webhook URL: `https://<DOMAIN>/api/v1/billing/webhook`. Backups: `deploy/backup.sh` (pg_dump, 14-day retention).

---

## Platform admin (`/admin`)

A separate area for SlotEase staff at `https://<DOMAIN>/admin`. It has its own sign-in with
two-step verification (authenticator app); owner logins never work there and admin logins never
work in the owner app. Every admin action is written to an audit log.

| Page | What it does |
|---|---|
| Dashboard | MRR / ARR, revenue this month / quarter / year / lifetime, customers by status, trial conversion, bookings, sign-ups per month |
| Revenue | Revenue by month, quarter, half-year or year (calendar or financial year Apr–Mar), change vs previous period, CSV download |
| Customers | Search and filter every business; open one to edit details, change plan/status/dates, extend the trial, record a manual payment, suspend or reactivate the booking page, create an owner password-reset link, sign the owner out everywhere, **view as owner** (opens their dashboard read-only in a new tab for 15 minutes; any change is refused by the server), or delete the business |
| Subscriptions | Counts by status, trials ending and renewals due in 7 days, failed payments, recent cancellations |
| Payments | Every payment (Razorpay charges are recorded automatically from webhooks; manual payments can be added) |
| Bookings | Find any booking by ID, phone or name across all businesses and fix its status |
| Audit log | Who did what, when, from which IP, with before/after values |

Admins are created only on the server (there is no sign-up):

```bash
cd /opt/apps/slotease
docker compose -f docker-compose.prod.yml exec backend python -m app.cli create-admin --email you@example.com --name "Your Name"
# then open https://<DOMAIN>/admin/login and scan the QR code with an authenticator app
docker compose -f docker-compose.prod.yml exec backend python -m app.cli reset-admin --email you@example.com --2fa        # lost phone
docker compose -f docker-compose.prod.yml exec backend python -m app.cli reset-admin --email you@example.com --password   # new password
```

---

## Database tables

All tenant tables carry `business_id` and every owner query is filtered by the business of the authenticated user.
Times are stored in UTC (`timestamptz`).

| Table | Key columns | Purpose |
|---|---|---|
| `businesses` | id, name, **slug** (unique), phone, email, address, timezone, slot_interval_min, booking_window_days, min_notice_minutes, plan, subscription_status, trial_ends_at, current_period_end, razorpay_subscription_id | One row per paying customer (tenant) |
| `users` | id, business_id, email (unique), password_hash (bcrypt), full_name, role, is_active | Owners and staff who log in |
| `refresh_tokens` | id, user_id, token_hash (SHA-256), expires_at, revoked_at | Rotating refresh tokens |
| `services` | id, business_id, name, description, duration_min (5–480), price, is_active | Haircut 30 min ₹300, etc. |
| `working_hours` | id, business_id, weekday (0=Mon), open_time, close_time | When slots can be offered (several ranges per day = breaks) |
| `customers` | id, business_id, name, phone, email — unique `(business_id, phone)` | People who booked, for history and repeat visits |
| `appointments` | id, business_id, service_id, customer_id, reference, start_time, end_time, status, price, notes, source | `booked` / `completed` / `cancelled` / `no_show` |
| `payment_events` | id, business_id, event_id (unique), event_type, payload | Razorpay webhook log (idempotency) |
| `payments` | id, business_id, business_name, source (razorpay/manual), amount, paid_at, note | Revenue ledger (kept if the business is deleted) |
| `admin_users` | id, email, password_hash, totp_secret, session_version | SlotEase staff (created from the CLI) |
| `admin_audit_logs` | id, admin_email, action, business_id, summary, details, ip_address | Every admin action |

**Double-booking guards on `appointments`:**

```sql
CREATE UNIQUE INDEX uq_appointments_business_start_active
  ON appointments (business_id, start_time) WHERE status <> 'cancelled';

ALTER TABLE appointments ADD CONSTRAINT ex_appointments_no_overlap
  EXCLUDE USING gist (business_id WITH =, tstzrange(start_time, end_time, '[)') WITH &&)
  WHERE (status <> 'cancelled');               -- PostgreSQL (btree_gist)
```

---

## API endpoints

Base path `/api/v1`. Interactive Swagger docs at `http://localhost:8000/docs` in local dev. Errors are always `{"error": "CODE", "message": "..."}`.

| Method + path | Who | What it does |
|---|---|---|
| `POST /auth/register` | Owner | Create business + owner account, returns JWT |
| `POST /auth/login` · `/auth/refresh` · `/auth/logout` | Owner | Login, rotate refresh token, revoke |
| `GET /auth/me` · `PATCH /auth/me` · `POST /auth/change-password` | Owner | Profile |
| `POST /auth/forgot-password` · `/auth/reset-password` | Owner | Password reset by email |
| `GET /business` · `PATCH /business` | Owner | Business profile and booking rules |
| `DELETE /business` | Owner | Delete the business and all its data (password + slug confirmation; cancels Razorpay) |
| `GET /public/{slug}` | Customer | Business profile for the booking page |
| `GET /public/{slug}/services` | Customer | List services of that business |
| `GET /public/{slug}/slots?service_id&date` | Customer | Free slots for that day |
| `POST /public/{slug}/bookings` | Customer | Create booking (**409** if slot taken) |
| `GET /appointments?date=` / `?start=&end=` | Owner | Day list / calendar range |
| `POST /appointments` | Owner | Phone or walk-in booking |
| `PATCH /appointments/{id}` | Owner | Mark completed, cancelled or no_show |
| CRUD `/services` | Owner | Manage services |
| `GET /working-hours` · `PUT /working-hours` | Owner | Manage timings |
| `GET /customers` · `GET /customers/{id}` | Owner | Customers and visit history |
| `GET /stats?month=` · `GET /stats/summary?date=` | Owner | Bookings, no-show rate, revenue estimate |
| `GET /billing` · `POST /billing/subscribe` · `/verify` · `/cancel` | Owner | Razorpay subscription |
| `POST /billing/webhook` | Razorpay | Signed webhook |
| `/admin/...` | Platform admin | Sign-in with 2FA, overview, revenue reports, businesses, subscriptions, payments, bookings, audit log (see above) |
| `GET /health` · `GET /api/v1/health` | Ops | Liveness / DB check |

### Sample output

`POST /api/v1/public/glow-salon/bookings`

```json
HTTP 201 Created
{
  "booking_id": "APT-20261010-0007",
  "service": "Haircut + Beard",
  "start_time": "2026-10-10T17:30:00+05:30",
  "end_time": "2026-10-10T18:15:00+05:30",
  "status": "booked",
  "message": "Booking confirmed at Glow Salon, Sat 10 Oct, 5:30 PM",
  "business_name": "Glow Salon",
  "customer_name": "Karthik S",
  "price": "450.00"
}
```

Same slot again from a second phone:

```json
HTTP 409 Conflict
{ "error": "SLOT_TAKEN", "message": "This slot was just booked. Please pick another time." }
```

---

## Project structure

```
backend/   FastAPI app (models, schemas, routers, services), Alembic migrations, pytest suite
frontend/  React + Vite SPA (pages, components/ui, hooks, services), Vitest suite
deploy/    VPS deploy + backup scripts, Caddyfile (optional), production env example, guide
PRPs/ agents/ skills/ .claude/   Context-engineering kit used to build the product (INITIAL.md → PRP → agents)
```

## Done checklist

- [x] Two browsers booking the same slot at the same time: one succeeds, one gets 409 (tested)
- [x] Logged in as Business A, you cannot read or change Business B's data (tested)
- [x] Slots respect working hours, service duration and already booked times (tested)
- [x] Booking page works well on a mobile phone
- [x] Passwords are hashed, secrets are in `.env`, deployed with a live URL
- [x] README explains setup, database tables and API endpoints
