# CLAUDE.md - SlotEase Project Rules

> Project-specific rules for Claude Code. This file is read automatically.
> The full implementation contract (models, API shapes, file ownership) is `PRPs/slotease-prp.md`.

---

## Project Overview

**Project Name:** SlotEase: Appointment Booking SaaS
**Description:** Multi-tenant booking SaaS for clinics and salons. Customers book online in 30 seconds,
owners manage their day from one dashboard, and double bookings never happen.
**Tech Stack:**
- Backend: FastAPI (Python 3.12), SQLAlchemy 2.0 (sync), Alembic, Pydantic v2
- Frontend: React + Vite + TypeScript (strict), React Router, TanStack Query
- Database: PostgreSQL 16 (SQLite only for the fast unit-test suite)
- Auth: Email/password, JWT access + refresh (rotating), bcrypt
- UI: Tailwind CSS v4 + shadcn/ui (Radix), lucide-react
- Payments: Razorpay Subscriptions (Rs 499/month, 14-day trial)
- Email: Resend or SMTP (console fallback)
- Deploy: Docker Compose on Hostinger VPS, Caddy (HTTPS), GitHub Actions CI

---

## Project Structure

```
SlotEaseAppointmentBooking_SaaS/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app, middleware, routers, error handlers
│   │   ├── config.py          # pydantic-settings Settings
│   │   ├── database.py        # engine, SessionLocal, get_db
│   │   ├── exceptions.py      # AppError hierarchy -> {"error","message"}
│   │   ├── dependencies.py    # get_current_user, get_current_business, tenant helpers
│   │   ├── rate_limit.py      # slowapi limiter
│   │   ├── models/            # business, user, refresh_token, service, working_hours,
│   │   │                      # customer, appointment, payment_event, types (UTCDateTime)
│   │   ├── schemas/           # Pydantic request/response models per module
│   │   ├── routers/           # auth, business, services, working_hours, public,
│   │   │                      # appointments, customers, stats, billing, health
│   │   ├── services/          # business logic (slot_service, booking_service, ...)
│   │   └── auth/              # security.py (bcrypt, JWT)
│   ├── alembic/
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/ui/     # shadcn/ui primitives (button, input, card, dialog, ...)
│   │   ├── components/layout/ # AppShell (sidebar + mobile drawer), PublicHeader
│   │   ├── components/<feature>/
│   │   ├── pages/             # route pages
│   │   ├── hooks/             # TanStack Query hooks
│   │   ├── services/          # api.ts + one file per API module
│   │   ├── context/           # AuthContext
│   │   ├── lib/               # utils (cn), datetime, money, errors
│   │   └── types/             # API types (mirror backend schemas)
│   └── package.json
├── deploy/                    # Caddyfile, production env example, deploy script
├── docker-compose.yml         # local full stack
├── docker-compose.prod.yml    # VPS
├── .claude/commands/  skills/  agents/  PRPs/
```

---

## Code Standards

### Python (Backend)
```python
# ALWAYS use type hints and docstrings on public functions
def list_services(db: Session, business_id: int, include_inactive: bool = False) -> list[Service]:
    """Return the business's services ordered by name."""
```
- SQLAlchemy 2.0 style: `Mapped[...]`, `mapped_column`, `select()`. No legacy `query()`.
- Routers stay thin: validate → call service → return schema. Business logic lives in `services/`.
- Raise `AppError` subclasses (`NotFoundError`, `ConflictError`, ...); never return error dicts by hand.

### TypeScript (Frontend)
```typescript
// ALWAYS type API data; NO `any`
export interface Service { id: number; name: string; duration_min: number; price: string; is_active: boolean }
export const listServices = async (): Promise<Service[]> => (await api.get<Service[]>('/services')).data;
```
- Server state through TanStack Query hooks in `hooks/`. No fetching inside `useEffect`.
- Forms: react-hook-form + zod.

---

## UI / Design Rules (MANDATORY - overrides skills/FRONTEND.md and agents/frontend-agent.md)

- **Enterprise look. NO gradients, NO glassmorphism, NO mesh backgrounds, NO decorative motion.**
  Do not use GlassCard, GradientButton, MeshBackground, TextReveal or framer-motion.
- Neutral slate palette, white surfaces, 1px borders, subtle shadow-sm at most, radius 8px.
  One accent colour (primary `#1d4ed8` blue-700) used for primary actions and focus only.
  Status colours: booked = blue, completed = green, no_show = amber, cancelled = slate.
- Font: Inter (system-ui fallback). Body 14-16px; tabular numbers for times and money.
- Responsive for all devices, mobile-first:
  - 320px minimum width, no horizontal page scroll at any width.
  - Breakpoints: `sm` 640, `md` 768 (tablet portrait / iPad mini), `lg` 1024 (iPad landscape, laptops),
    `xl` 1280, `2xl` 1536 (large desktops; content max-width 1440px).
  - Owner app: fixed sidebar at `lg+`, slide-in drawer (Sheet) with top bar below `lg`.
  - Data tables become stacked cards below `md`.
  - Touch targets ≥ 44px; form inputs ≥ 16px font on mobile (prevents iOS zoom).
  - `viewport-fit=cover` and `env(safe-area-inset-*)` padding for iPhone notches / home indicator.
  - Use `100dvh`, never `100vh`, for full-height layouts (mobile Safari toolbar).
- Accessibility: WCAG 2.1 AA contrast, visible focus rings, labels on every input, aria-live for toasts.

---

## Forbidden Patterns

### Backend
- ❌ Never use `print()` - use `logging`
- ❌ Never store passwords in plain text - bcrypt only
- ❌ Never hardcode secrets - environment variables via `config.py`
- ❌ Never query tenant data without filtering by `business_id` from the authenticated user
- ❌ Never take `business_id` from the request body or query string
- ❌ Never skip input validation
- ❌ Never build SQL with string formatting

### Frontend
- ❌ Never use `any` type
- ❌ Never leave console.log in production code
- ❌ Never skip error handling in async operations (show a toast or inline error)
- ❌ Never use inline styles - use Tailwind classes
- ❌ Never use gradients (`bg-gradient-*`, `bg-linear-*`, `from-*`/`to-*`)
- ❌ Never use `dangerouslySetInnerHTML`

---

## Module-Specific Rules

### Tenancy
- Every tenant table has `business_id` (FK → businesses.id, indexed).
- Owner endpoints get the tenant from the JWT user (`current_user.business_id`). A resource id that belongs to
  another business returns **404** (never 403 - do not reveal it exists).

### Appointments
- Status is one of: `booked`, `completed`, `cancelled`, `no_show`.
- `UNIQUE (business_id, start_time) WHERE status <> 'cancelled'` + Postgres
  `EXCLUDE USING gist (business_id WITH =, tstzrange(start_time, end_time) WITH &&) WHERE (status <> 'cancelled')`.
- Booking runs in one transaction: lock the business row (`SELECT ... FOR UPDATE`), re-check overlap, insert.
  `IntegrityError` → 409 `SLOT_TAKEN`.
- Times stored as UTC (`timestamptz`); slot math and API output use the business timezone
  (ISO 8601 with offset, e.g. `2026-10-10T17:30:00+05:30`).
- `reference` format: `APT-YYYYMMDD-NNNN` (appointment local date + zero-padded id).

### Services
- `duration_min` 5-480, `price` ≥ 0 (Numeric(10,2), serialised as string). Delete = deactivate (keeps history).

### Billing
- Plan: 14-day trial, then Razorpay subscription Rs 499/month. Public booking returns 403
  `BUSINESS_INACTIVE` if the trial expired and no active subscription.
- Verify every Razorpay signature with `hmac.compare_digest`. Webhooks are idempotent (payment_events).

---

## API Conventions

- All endpoints prefixed with `/api/v1/` (health also at `/health`).
- Error body is always `{"error": "CODE", "message": "Human readable", "details"?: [...]}`.
- Status codes: 200, 201 Created, 204 No Content, 400, 401, 403, 404, 409 Conflict, 422 validation, 429, 503.
- Plural nouns: `/services`, `/appointments`, `/customers`.

---

## Authentication

- Access token: 30 minutes, HS256, claims `sub` (user id), `bid` (business id), `type=access`.
- Refresh token: 7 days, random 48-byte token, only its SHA-256 hash stored; rotated on every refresh.
- Password reset: 30-minute JWT `type=reset` bound to a fingerprint of the current password hash (single use).

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql+psycopg://slotease:slotease@localhost:5432/slotease

# Auth
SECRET_KEY=change-me-to-a-long-random-string
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# App
ENVIRONMENT=development
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173

# Email (optional - console log when empty)
EMAIL_FROM=SlotEase <bookings@example.com>
RESEND_API_KEY=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

# Razorpay (optional - billing shows "not configured" when empty)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_PLAN_ID=
RAZORPAY_WEBHOOK_SECRET=

# Frontend (empty = same origin, nginx proxies /api)
VITE_API_URL=
```

---

## Development Commands

```bash
# Backend
cd backend
python -m venv .venv && .venv/Scripts/activate      # Windows (source .venv/bin/activate on Linux/macOS)
pip install -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev

# Full stack in Docker
docker compose up -d --build

# Tests
cd backend && pytest -q --cov=app
cd frontend && npm test

# Linting
cd backend && ruff check . && ruff format --check . && mypy app
cd frontend && npm run lint && npm run type-check
```

---

## Commit Message Format

```
feat(booking): add slot calculation
fix(auth): rotate refresh token on use
test(appointments): add tenant isolation tests
docs: update README
```

---

## Skills Reference

| Task | Skill to Read |
|------|---------------|
| Database models | skills/DATABASE.md |
| API + Auth | skills/BACKEND.md |
| React + UI | skills/FRONTEND.md (structure/API client only - design rules above win) |
| Testing | skills/TESTING.md |
| Deployment | skills/DEPLOYMENT.md |

---

## Agent Coordination

The ORCHESTRATOR coordinates DATABASE-AGENT, BACKEND-AGENT, FRONTEND-AGENT, TEST-AGENT, REVIEW-AGENT and
DEVOPS-AGENT. Agent definitions are in `/agents/`. File ownership per agent is defined in the PRP.
