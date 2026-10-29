# PRP: SlotEase - Appointment Booking SaaS

> Implementation blueprint for parallel agent execution. This file is the **contract**: names, paths,
> table columns, request/response JSON and file ownership below are binding for every agent.
> Read `CLAUDE.md` first (design + security rules).

---

## METADATA

| Field | Value |
|-------|-------|
| **Product** | SlotEase: Appointment Booking SaaS |
| **Type** | Multi-tenant SaaS |
| **Version** | 1.0 |
| **Created** | 2026-10-28 |
| **Complexity** | Medium-High (multi-tenant, concurrency-safe booking, billing) |
| **Environment** | Windows 11 dev box, Python 3.12, Node 24, Git Bash. Production: Linux VPS + Docker |

---

## PRODUCT OVERVIEW

**Description:** Clinics, salons and physio centres get a public booking page (`/glow-salon`). Customers pick a
service, date and free slot, enter name + phone, confirm. Owners manage today's list, a weekly calendar,
services, working hours, mark Completed / No-show, and see monthly stats. The DB refuses double bookings.

**Value Proposition:** No more phone/WhatsApp double bookings, a record of every visit and no-show,
Rs 499/month.

**MVP Scope:**
- [ ] Owner sign-up (creates tenant) + JWT login, password reset
- [ ] Services + working hours management
- [ ] Public booking page with correct slot calculation
- [ ] DB-enforced double-booking prevention → 409 SLOT_TAKEN
- [ ] Dashboard (today), weekly calendar, status actions, customers
- [ ] Monthly stats
- [ ] Email confirmation
- [ ] Razorpay subscription (14-day trial, Rs 499/month)

---

## TECH STACK

| Layer | Technology | Skill Reference |
|-------|------------|-----------------|
| Backend | FastAPI, Python 3.12, SQLAlchemy 2.0 (sync), Pydantic v2, pydantic-settings | skills/BACKEND.md |
| Database | PostgreSQL 16 (psycopg 3 driver `postgresql+psycopg://`), Alembic | skills/DATABASE.md |
| Auth | PyJWT (HS256) + bcrypt | skills/BACKEND.md |
| Rate limit | slowapi | |
| HTTP client | httpx (Razorpay REST, Resend) | |
| Timezones | `zoneinfo` + `tzdata` package (required on Windows) | |
| Frontend | React 19 + Vite + TypeScript strict, react-router-dom v7, @tanstack/react-query v5, axios | skills/FRONTEND.md |
| UI | Tailwind CSS v4 (`@tailwindcss/vite`) + shadcn/ui-style components (Radix), lucide-react, sonner, recharts | CLAUDE.md design rules |
| Forms | react-hook-form + zod + @hookform/resolvers | |
| Testing | pytest + pytest-cov (SQLite in-memory; optional Postgres via TEST_POSTGRES_URL), Vitest + RTL + jsdom | skills/TESTING.md |
| Deployment | Docker, docker compose, nginx (SPA + /api proxy), Caddy (TLS), GitHub Actions | skills/DEPLOYMENT.md |

---

## DATABASE MODELS (owner: DATABASE-AGENT)

All models in `backend/app/models/`. SQLAlchemy 2.0 declarative (`DeclarativeBase`, `Mapped`, `mapped_column`).
All timestamps use the custom type `UTCDateTime` (`backend/app/models/types.py`): a `TypeDecorator` with
`impl = DateTime(timezone=True)`, `cache_ok = True`; on bind it requires an aware datetime and converts to UTC
(raise `ValueError` for naive); on result it attaches `timezone.utc` if the value is naive (SQLite).
`created_at` / `updated_at` default to `datetime.now(timezone.utc)` (Python-side default + `onupdate`).

### `businesses` — `Business` (tenant)
| column | type | notes |
|---|---|---|
| id | Integer PK | |
| name | String(120) not null | |
| slug | String(40) unique, indexed, not null | lowercase `^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$` |
| phone | String(20) not null | |
| email | String(255) nullable | contact email shown to owner notifications |
| address | String(255) nullable | |
| timezone | String(64) not null default `Asia/Kolkata` | IANA name |
| currency | String(3) not null default `INR` | |
| slot_interval_min | Integer not null default 15 | allowed 5,10,15,20,30,60 |
| booking_window_days | Integer not null default 60 | 1-365 |
| min_notice_minutes | Integer not null default 60 | 0-10080; public bookings only |
| plan | String(20) not null default `trial` | `trial` \| `pro` |
| subscription_status | String(20) not null default `trialing` | `trialing` \| `active` \| `past_due` \| `cancelled` \| `expired` |
| trial_ends_at | UTCDateTime nullable | set at registration = now + 14 days |
| current_period_end | UTCDateTime nullable | |
| razorpay_subscription_id | String(64) nullable, indexed | |
| created_at, updated_at | UTCDateTime | |

Python property `is_bookable -> bool`: `True` if `subscription_status == "active"`, or
(`subscription_status == "trialing"` and `trial_ends_at` > now), or (`subscription_status in ("past_due","cancelled")`
and `current_period_end` and `current_period_end` > now). Otherwise `False`.
Relationships: users, services, working_hours, customers, appointments (`lazy="raise"` not required; default select).

### `users` — `User`
| column | type | notes |
|---|---|---|
| id | Integer PK | |
| business_id | FK businesses.id ON DELETE CASCADE, indexed, not null | |
| email | String(255) unique, indexed, not null | stored lowercase |
| password_hash | String(255) not null | bcrypt |
| full_name | String(120) not null | |
| role | String(20) not null default `owner` | `owner` \| `staff` |
| is_active | Boolean not null default True | |
| created_at, updated_at | UTCDateTime | |

### `refresh_tokens` — `RefreshToken`
id, user_id (FK users.id CASCADE, indexed), token_hash String(64) unique (sha256 hex), expires_at UTCDateTime,
revoked_at UTCDateTime nullable, created_at.

### `services` — `Service`
| column | type | notes |
|---|---|---|
| id | Integer PK | |
| business_id | FK, indexed | |
| name | String(120) not null | |
| description | String(500) nullable | |
| duration_min | Integer not null | CHECK 5..480 |
| price | Numeric(10,2) not null default 0 | CHECK >= 0 |
| is_active | Boolean not null default True | |
| created_at, updated_at | | |
Index `(business_id, is_active)`.

### `working_hours` — `WorkingHours`
id, business_id (FK, indexed), weekday Integer (0=Monday … 6=Sunday, CHECK 0..6), open_time Time, close_time Time,
CHECK open_time < close_time. Multiple rows per weekday allowed (breaks). Index `(business_id, weekday)`.

### `customers` — `Customer`
id, business_id (FK, indexed), name String(120), phone String(20) (normalised: digits with optional leading `+`),
email String(255) nullable, created_at, updated_at. UNIQUE `(business_id, phone)` named `uq_customers_business_phone`.

### `appointments` — `Appointment`
| column | type | notes |
|---|---|---|
| id | Integer PK | |
| business_id | FK, indexed | |
| service_id | FK services.id (RESTRICT) | |
| customer_id | FK customers.id (RESTRICT) | |
| reference | String(24) unique nullable | `APT-YYYYMMDD-NNNN`, set right after insert (flush) |
| start_time | UTCDateTime not null | |
| end_time | UTCDateTime not null | CHECK end_time > start_time |
| status | String(20) not null default `booked` | CHECK IN ('booked','completed','cancelled','no_show') |
| price | Numeric(10,2) not null | snapshot of service price |
| notes | String(500) nullable | |
| source | String(10) not null default `online` | `online` \| `owner` |
| created_at, updated_at | | |
Indexes: `ix_appointments_business_start (business_id, start_time)`;
**partial unique** `uq_appointments_business_start_active` on `(business_id, start_time)` with
`postgresql_where=text("status <> 'cancelled'")` and `sqlite_where=text("status <> 'cancelled'")`.

### `payment_events` — `PaymentEvent`
id, business_id nullable FK, provider String(20) default `razorpay`, event_id String(100) unique,
event_type String(60), payload JSON, created_at.

### Migration `alembic/versions/0001_initial.py`
Hand-written (not autogenerate), creates everything above, and **on PostgreSQL only**
(`if op.get_bind().dialect.name == "postgresql":`):
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointments ADD CONSTRAINT ex_appointments_no_overlap
  EXCLUDE USING gist (business_id WITH =, tstzrange(start_time, end_time, '[)') WITH &&)
  WHERE (status <> 'cancelled');
```
`alembic/env.py` reads `settings.DATABASE_URL` from `app.config`, `target_metadata = Base.metadata`.

`backend/app/database.py`: `engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, future=True)`
(for sqlite add `connect_args={"check_same_thread": False}`), `SessionLocal = sessionmaker(bind=engine,
autoflush=False, expire_on_commit=False)`, `def get_db() -> Iterator[Session]`.
`backend/app/models/__init__.py` exports `Base, Business, User, RefreshToken, Service, WorkingHours, Customer,
Appointment, PaymentEvent, UTCDateTime` and constants `APPOINTMENT_STATUSES`, `SUBSCRIPTION_STATUSES`.

---

## BACKEND FOUNDATION (owner: BACKEND-FOUNDATION agent)

### `app/config.py`
`class Settings(BaseSettings)` (`model_config = SettingsConfigDict(env_file=".env", extra="ignore")`), fields:
`APP_NAME="SlotEase"`, `ENVIRONMENT="development"`, `DATABASE_URL="sqlite:///./slotease.db"`,
`SECRET_KEY` (default dev value; **validator: if ENVIRONMENT=="production" and len<32 or default → raise**),
`ACCESS_TOKEN_EXPIRE_MINUTES=30`, `REFRESH_TOKEN_EXPIRE_DAYS=7`, `PASSWORD_RESET_EXPIRE_MINUTES=30`,
`FRONTEND_URL="http://localhost:5173"`, `CORS_ORIGINS: list[str]` (comma-separated env string accepted),
`RATE_LIMIT_ENABLED=True`, `TRIAL_DAYS=14`, `PLAN_PRICE_INR=499`,
`EMAIL_FROM="SlotEase <no-reply@slotease.local>"`, `RESEND_API_KEY=""`, `SMTP_HOST=""`, `SMTP_PORT=587`,
`SMTP_USER=""`, `SMTP_PASSWORD=""`, `SMTP_USE_TLS=True`,
`RAZORPAY_KEY_ID=""`, `RAZORPAY_KEY_SECRET=""`, `RAZORPAY_PLAN_ID=""`, `RAZORPAY_WEBHOOK_SECRET=""`,
`LOG_LEVEL="INFO"`. Property `billing_configured` (all 3 of key id/secret/plan set). `settings = Settings()`.

### `app/exceptions.py`
```python
class AppError(Exception):
    status_code = 400; code = "BAD_REQUEST"; message = "Bad request."
    def __init__(self, message: str | None = None, code: str | None = None, details: list | None = None): ...
class UnauthorizedError(AppError): 401 "UNAUTHORIZED"
class ForbiddenError(AppError): 403 "FORBIDDEN"
class NotFoundError(AppError): 404 "NOT_FOUND"
class ConflictError(AppError): 409 "CONFLICT"
class ValidationAppError(AppError): 422 "VALIDATION_ERROR"
class ServiceUnavailableError(AppError): 503 "SERVICE_UNAVAILABLE"
class SlotTakenError(ConflictError): code "SLOT_TAKEN", message "This slot was just booked. Please pick another time."
class BusinessInactiveError(ForbiddenError): code "BUSINESS_INACTIVE", message "This business is not accepting online bookings right now."
```
Handlers registered in `main.py` produce `{"error": code, "message": message}` (+ `"details"` when present).
`RequestValidationError` → 422 `{"error":"VALIDATION_ERROR","message":"Invalid input.","details":[{"field":"body.email","message":"..."}]}`.
Rate-limit exceeded → 429 `{"error":"RATE_LIMITED","message":"Too many requests. Please try again shortly."}`.
Unhandled → 500 `{"error":"INTERNAL_ERROR","message":"Something went wrong."}` (logged, no stack in body).

### `app/auth/security.py`
`hash_password(pw) -> str`, `verify_password(pw, hash) -> bool` (bcrypt, `bcrypt` package directly; truncate
input safely to 72 bytes), `create_access_token(user_id: int, business_id: int) -> str`
(claims `sub`=str(user_id), `bid`, `type="access"`, `exp`, `iat`), `decode_token(token, expected_type) -> dict`
(raises `UnauthorizedError`), `generate_refresh_token() -> tuple[str, str]` (raw, sha256 hex),
`hash_token(raw) -> str`, `create_password_reset_token(user) -> str` (claims `sub`, `type="reset"`,
`fp` = first 16 chars of sha256(password_hash)), `password_fingerprint(password_hash) -> str`.

### `app/dependencies.py`
`DbSession = Annotated[Session, Depends(get_db)]`; `get_current_user` (HTTPBearer, auto_error=False → 401
`UNAUTHORIZED` "Not authenticated."; inactive user → 401); `CurrentUser = Annotated[User, Depends(get_current_user)]`;
`get_current_business(user, db) -> Business` (`db.get(Business, user.business_id)`);
`CurrentBusiness = Annotated[Business, Depends(get_current_business)]`.

### `app/rate_limit.py`
`limiter = Limiter(key_func=get_remote_address, enabled=settings.RATE_LIMIT_ENABLED, default_limits=[])`.

### `app/main.py`
FastAPI(title="SlotEase API", version="1.0.0", docs at `/docs`, openapi at `/openapi.json`). Logging setup.
CORS from settings. slowapi state + handler. Security headers middleware (X-Content-Type-Options nosniff,
X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin). Include routers, all with
`prefix="/api/v1"`: `health, auth, business, services, working_hours, public, appointments, customers, stats, billing`.
`GET /health` (no prefix) also returns `{"status":"ok"}`.
Phase 1 creates each router module as a stub (`router = APIRouter(prefix="/<x>", tags=["<X>"])`) so main.py is final.
Router prefixes: auth→`/auth`, business→`/business`, services→`/services`, working_hours→`/working-hours`,
public→`/public`, appointments→`/appointments`, customers→`/customers`, stats→`/stats`, billing→`/billing`,
health→ no prefix, path `/health` (gives `/api/v1/health`, with DB `SELECT 1` check → `{"status":"ok","database":"ok"}`).

### Shared `app/schemas/common.py`
`ErrorOut {error, message, details?}`, `MessageOut {message}`, `class Page(BaseModel, Generic[T]) {items, total, page, page_size}`.
Base config for ORM schemas: `model_config = ConfigDict(from_attributes=True)`.

### Timezone helpers `app/services/time_utils.py` (owner: BACKEND-FOUNDATION)
`get_tz(name) -> ZoneInfo`, `now_utc()`, `to_local(dt, tz) -> datetime`, `local_day_bounds(day: date, tz) -> (start_utc, end_utc)`,
`format_human(dt_local) -> str` e.g. `"Sat 10 Oct, 5:30 PM"` (no leading zero on hour, cross-platform: do not use `%-I`),
`is_valid_timezone(name) -> bool`.

### Files
`backend/requirements.txt`: fastapi, uvicorn[standard], gunicorn, sqlalchemy>=2.0.36, alembic, psycopg[binary],
pydantic>=2.9, pydantic-settings, email-validator, bcrypt, pyjwt, slowapi, httpx, tzdata, python-multipart.
`backend/requirements-dev.txt`: `-r requirements.txt`, pytest, pytest-cov, ruff, mypy.
`backend/pyproject.toml`: ruff (line-length 110, select E,F,I,B,UP,SIM, target py312), mypy (python_version 3.12,
ignore_missing_imports, plugins none), pytest (`testpaths=["tests"]`, `addopts="-q"`), coverage (`source=["app"]`, omit alembic).

---

## API CONTRACT (all paths under `/api/v1`)

Times in responses: ISO 8601 **in the business timezone with offset** (`2026-10-10T17:30:00+05:30`).
Times in requests: ISO 8601 with offset (any offset; server converts). Naive → 422.
Money: decimal string `"300.00"`.

### Shared response schemas
```jsonc
// UserOut
{ "id": 1, "email": "owner@glow.in", "full_name": "Asha K", "role": "owner", "business_id": 1, "created_at": "..." }
// BusinessOut
{ "id": 1, "name": "Glow Salon", "slug": "glow-salon", "phone": "+919876543210", "email": "hi@glow.in",
  "address": "12 MG Road, Chennai", "timezone": "Asia/Kolkata", "currency": "INR", "slot_interval_min": 15,
  "booking_window_days": 60, "min_notice_minutes": 60, "plan": "trial", "subscription_status": "trialing",
  "trial_ends_at": "...", "current_period_end": null, "is_bookable": true, "created_at": "..." }
// AuthOut
{ "access_token": "...", "refresh_token": "...", "token_type": "bearer", "expires_in": 1800,
  "user": UserOut, "business": BusinessOut }
```

### Auth & business (owner: BACKEND-A)
| Method | Path | Body | Response |
|---|---|---|---|
| POST | /auth/register | `{business_name (2-120), slug? , phone, full_name, email, password, timezone? }` | 201 AuthOut. 409 `EMAIL_TAKEN` / `SLUG_TAKEN`. Rate 5/min |
| POST | /auth/login | `{email, password}` | 200 AuthOut. 401 `INVALID_CREDENTIALS` "Incorrect email or password." Rate 10/min |
| POST | /auth/refresh | `{refresh_token}` | 200 AuthOut (old token revoked, new issued). 401 on invalid/expired/revoked |
| POST | /auth/logout | `{refresh_token}` | 204 (idempotent) |
| GET | /auth/me | - | `{user: UserOut, business: BusinessOut}` |
| PATCH | /auth/me | `{full_name}` | UserOut |
| POST | /auth/change-password | `{current_password, new_password}` | 204; 400 `INVALID_PASSWORD`; revokes all refresh tokens |
| POST | /auth/forgot-password | `{email}` | 202 `{message:"If an account exists, a reset link has been sent."}` always. Rate 5/min |
| POST | /auth/reset-password | `{token, new_password}` | 204; 400 `INVALID_TOKEN`; revokes refresh tokens |
| GET | /business | - | BusinessOut |
| PATCH | /business | any of `{name, slug, phone, email, address, timezone, slot_interval_min, booking_window_days, min_notice_minutes}` | BusinessOut; 409 `SLUG_TAKEN`; 422 bad timezone |

Rules: password 8-128 chars with ≥1 letter and ≥1 digit. Email lower-cased. Slug: if omitted, derived from
business name (`slugify`, then `-2`, `-3` … until free). Reserved slugs (422 `SLUG_RESERVED`): `app, api, admin,
login, register, signup, book, booking, dashboard, settings, billing, pricing, help, support, docs, static, assets,
health, forgot-password, reset-password, terms, privacy, about, www, mail`.
Phone: 7-15 digits after stripping spaces/dashes/brackets, optional leading `+` (helper `normalize_phone` in
`app/services/validators.py`, owner BACKEND-FOUNDATION, also `validate_slug`, `slugify`, `RESERVED_SLUGS`).
Registration creates: Business (trial, trial_ends_at = now + TRIAL_DAYS), owner User, default working hours
Mon–Sat 09:00–18:00 (weekday 0..5). No default services.

### Services (owner: BACKEND-B)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | /services?include_inactive=false | - | `ServiceOut[]` ordered by name |
| POST | /services | `{name, description?, duration_min, price, is_active?}` | 201 ServiceOut |
| GET | /services/{id} | - | ServiceOut / 404 |
| PATCH | /services/{id} | partial | ServiceOut |
| DELETE | /services/{id} | - | 204 (sets is_active=false) |
`ServiceOut {id, name, description, duration_min, price, is_active, created_at}`

### Working hours (owner: BACKEND-B)
| GET | /working-hours | - | `WorkingHoursOut[]` `{id, weekday, open_time:"09:00", close_time:"18:00"}` sorted by weekday, open_time |
| PUT | /working-hours | `{hours: [{weekday, open_time:"HH:MM", close_time:"HH:MM"}]}` | replaces all → `WorkingHoursOut[]`. 422 if open>=close, overlapping ranges same day, >4 ranges/day |

### Public (no auth; owner: BACKEND-B)
| Method | Path | Response |
|---|---|---|
| GET | /public/{slug} | `PublicBusinessOut {name, slug, phone, address, timezone, currency, booking_window_days, is_bookable}` / 404 `BUSINESS_NOT_FOUND` |
| GET | /public/{slug}/services | active `PublicServiceOut[] {id, name, description, duration_min, price}` |
| GET | /public/{slug}/slots?service_id=1&date=2026-10-10 | `SlotsOut` (rate 60/min) |
| POST | /public/{slug}/bookings | 201 `BookingConfirmationOut` (rate 10/min) |

```jsonc
// SlotsOut
{ "date": "2026-10-10", "timezone": "Asia/Kolkata", "service_id": 1, "duration_min": 30,
  "slots": [ { "start_time": "2026-10-10T10:00:00+05:30", "end_time": "2026-10-10T10:30:00+05:30", "label": "10:00" } ] }
// BookingCreate (public)
{ "service_id": 1, "start_time": "2026-10-10T17:30:00+05:30", "customer_name": "Karthik S",
  "customer_phone": "+91 98765 43210", "customer_email": "k@example.com", "notes": null }
// BookingConfirmationOut (201) — matches Sample Output A
{ "booking_id": "APT-20261010-0007", "service": "Haircut + Beard",
  "start_time": "2026-10-10T17:30:00+05:30", "end_time": "2026-10-10T18:15:00+05:30",
  "status": "booked", "message": "Booking confirmed at Glow Salon, Sat 10 Oct, 5:30 PM",
  "business_name": "Glow Salon", "customer_name": "Karthik S", "price": "450.00" }
// 409 — Sample Output B
{ "error": "SLOT_TAKEN", "message": "This slot was just booked. Please pick another time." }
```
Slots outside the booking window, a date in the past, an unknown / inactive service → slots `[]` for past/window,
404 `SERVICE_NOT_FOUND` for service. Business not bookable → `GET slots` and `POST bookings` return 403 `BUSINESS_INACTIVE`.

### Slot algorithm (`app/services/slot_service.py`, owner BACKEND-B)
```
compute_free_slots(db, business, service, day, *, now=None, enforce_notice=True) -> list[Slot]
  tz = business tz; intervals = working_hours rows for day.weekday()
  booked = non-cancelled appointments of business overlapping [day 00:00, day+1 00:00) local
  for each interval (open, close):
     t = local datetime(day, open)
     while t + duration <= local datetime(day, close):
        slot = [t, t+duration)
        skip if slot overlaps any booked [s, e)          (s < slot_end and e > slot_start)
        skip if enforce_notice and slot_start < now + min_notice_minutes
        yield slot
        t += slot_interval_min
  also return [] when day < today(local) or day > today + booking_window_days
```
DST-safe: build local datetimes with `datetime.combine(day, time, tzinfo=tz)` and compare in UTC.

### Booking (`app/services/booking_service.py`, owner BACKEND-B)
`create_booking(db, business, data, *, source: Literal["online","owner"]) -> Appointment`
1. Load active service of this business (404 `SERVICE_NOT_FOUND`).
2. Convert start_time to UTC; end = start + duration.
3. Lock tenant: `db.execute(select(Business.id).where(Business.id == business.id).with_for_update())` (no-op on SQLite).
4. Validate the slot: must equal the start of a slot from `compute_free_slots` **ignoring existing bookings**
   (helper `is_within_working_hours`) → else 422 `INVALID_SLOT` "This time is outside the business's working hours.";
   for `source="online"` also enforce notice + window (→ 422 `INVALID_SLOT`).
5. Overlap check against non-cancelled appointments → `SlotTakenError`.
6. Upsert customer by `(business_id, normalised phone)`; update name/email if given.
7. Insert appointment (price snapshot), `flush()`, set `reference = f"APT-{local_start:%Y%m%d}-{id:04d}"`, `commit()`.
8. Wrap 3-7 in `try/except IntegrityError: rollback; raise SlotTakenError` (DB unique/exclusion is the final guard).
9. After commit, the router schedules `notification_service.send_booking_confirmation(appointment_id)` as a
   FastAPI `BackgroundTasks` task.

### Appointments (owner, owner: BACKEND-B)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | /appointments?date=YYYY-MM-DD | | `AppointmentOut[]` for that local day, sorted by start |
| GET | /appointments?start=YYYY-MM-DD&end=YYYY-MM-DD[&status=] | | inclusive range ≤ 42 days, else 422 |
| POST | /appointments | BookingCreate | 201 AppointmentOut (source=`owner`; no notice/window rule) |
| GET | /appointments/{id} | | AppointmentOut |
| PATCH | /appointments/{id} | `{status?, notes?}` | AppointmentOut; reviving a cancelled one into an occupied slot → 409 SLOT_TAKEN |
```jsonc
// AppointmentOut
{ "id": 7, "reference": "APT-20261010-0007", "service_id": 2, "service_name": "Haircut + Beard",
  "duration_min": 45, "customer_id": 5, "customer_name": "Karthik S", "customer_phone": "+919876543210",
  "customer_email": null, "start_time": "2026-10-10T17:30:00+05:30", "end_time": "2026-10-10T18:15:00+05:30",
  "status": "booked", "price": "450.00", "notes": null, "source": "online", "created_at": "..." }
```

### Customers (owner: BACKEND-B)
| GET | /customers?search=&page=1&page_size=20 | `Page[CustomerOut]`; search on name/phone (ILIKE / lower LIKE) |
| GET | /customers/{id} | `CustomerDetailOut` = CustomerOut + `appointments: AppointmentOut[]` (latest 50, newest first) |
`CustomerOut {id, name, phone, email, total_bookings, completed_visits, no_shows, last_visit (ISO or null), created_at}`
(aggregates via one grouped query, no N+1).

### Stats (owner: BACKEND-B)
| GET | /stats?month=YYYY-MM (default current local month) | `MonthStatsOut` |
| GET | /stats/summary?date=YYYY-MM-DD (default today local) | `DaySummaryOut` |
```jsonc
// MonthStatsOut
{ "month": "2026-10", "total_bookings": 214, "booked": 20, "completed": 170, "cancelled": 11, "no_shows": 13,
  "no_show_rate": 6.1,            // no_shows / (total_bookings - cancelled) * 100, 1 decimal, 0 if denominator 0
  "revenue_estimate": "64150.00", // sum(price) of booked + completed
  "busiest_day": "Saturday",      // weekday name with most non-cancelled bookings, null if none
  "new_customers": 37,
  "daily": [ { "date": "2026-10-01", "bookings": 7, "completed": 6, "no_shows": 1 } ],   // every day of month
  "top_services": [ { "service_id": 2, "name": "Haircut", "bookings": 80, "revenue": "24000.00" } ] }  // top 5
// DaySummaryOut
{ "date": "2026-10-10", "total": 12, "booked": 5, "completed": 5, "cancelled": 0, "no_shows": 2,
  "revenue_estimate": "6450.00", "next_appointment": AppointmentOut | null }
```
`total` excludes cancelled.

### Billing (owner: BACKEND-A)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | /billing | | `BillingOut` |
| POST | /billing/subscribe | | `SubscribeOut {subscription_id, key_id, short_url, amount: 49900, currency:"INR", name, email, contact}`; 503 `BILLING_NOT_CONFIGURED` if keys missing; 409 `ALREADY_SUBSCRIBED` if active |
| POST | /billing/verify | `{razorpay_payment_id, razorpay_subscription_id, razorpay_signature}` | BillingOut (status active, plan pro); 400 `INVALID_SIGNATURE` |
| POST | /billing/cancel | | BillingOut (Razorpay cancel `cancel_at_cycle_end=1`, status `cancelled`) |
| POST | /billing/webhook | raw Razorpay JSON, header `X-Razorpay-Signature` | 200 `{status:"ok"}`; 400 bad signature; duplicates ignored via `payment_events.event_id` (header `X-Razorpay-Event-Id`, fallback sha256 of body) |
`BillingOut {plan, subscription_status, trial_ends_at, current_period_end, is_bookable, price_inr: 499,
billing_configured, razorpay_key_id (null if not configured), razorpay_subscription_id}`
Checkout signature: `hmac_sha256(key_secret, f"{payment_id}|{subscription_id}")`. Webhook signature:
`hmac_sha256(webhook_secret, raw_body)`. Webhook events: `subscription.activated`, `subscription.charged` →
active, plan pro, `current_period_end` from `payload.subscription.entity.current_end` (unix);
`subscription.pending`, `subscription.halted` → past_due; `subscription.cancelled`, `subscription.completed` → cancelled.
Business lookup by `razorpay_subscription_id`, or `notes.business_id`.
Razorpay REST wrapper `app/services/razorpay_client.py`: `create_subscription(plan_id, total_count=120, notes) -> dict`,
`cancel_subscription(sub_id) -> dict`, httpx with basic auth `https://api.razorpay.com/v1`, 15s timeout,
errors → `ServiceUnavailableError("PAYMENT_PROVIDER_ERROR")`. Must be trivially mockable (module-level functions).

### Notifications (owner: BACKEND-A) `app/services/notification_service.py`
- `send_email(to: str, subject: str, html: str, text: str) -> bool`: Resend (`POST https://api.resend.com/emails`)
  if `RESEND_API_KEY`, else SMTP (`smtplib`, STARTTLS) if `SMTP_HOST`, else log at INFO "email (console)". Never raises.
- `send_booking_confirmation(appointment_id: int) -> None`: opens its **own** `SessionLocal()`, loads appointment +
  service + customer + business, emails the customer (if email) and the owner(s) of the business. HTML escaped
  with `html.escape`. Never raises (log exceptions).
- `send_password_reset(email: str, reset_url: str) -> None`.
- Plain, professional HTML templates (table layout, no gradients, no images).

---

## FRONTEND CONTRACT

### Foundation (owner: FRONTEND-FOUNDATION)
- Vite React-TS in `frontend/` (scripts: `dev`, `build` = `tsc -b && vite build`, `preview`, `lint`,
  `type-check` = `tsc -b --noEmit` or `tsc --noEmit -p tsconfig.app.json`, `test` = `vitest run`, `test:watch`).
- Path alias `@/` → `src/` (vite + tsconfig). Tailwind v4 via `@tailwindcss/vite`; tokens in `src/index.css`
  using `@theme` (CSS variables: `--color-background`, `--color-foreground`, `--color-muted`, `--color-muted-foreground`,
  `--color-border`, `--color-input`, `--color-ring`, `--color-primary` (#1d4ed8), `--color-primary-foreground`,
  `--color-secondary`, `--color-accent`, `--color-destructive`, `--color-success`, `--color-warning`, `--color-card`,
  `--radius`). Inter from Google Fonts in `index.html`; `<meta name="viewport" content="width=device-width,
  initial-scale=1, viewport-fit=cover">`, theme-color, favicon (simple calendar-check SVG, solid colour).
- `src/components/ui/`: button, input, textarea, label, card, badge, dialog, sheet (Radix Dialog side panel),
  select (Radix), dropdown-menu, tabs, table, skeleton, separator, switch, tooltip, alert, avatar, popover,
  calendar-free `DatePicker` is NOT needed (use native `<input type="date">` styled) — plus `empty-state.tsx`,
  `page-header.tsx` (title, description, actions slot), `stat-card.tsx`, `status-badge.tsx`
  (booked=blue, completed=green, no_show=amber, cancelled=slate), `spinner.tsx`, `confirm-dialog.tsx`.
  All built shadcn-style with `cva` + `cn`. Dependencies: `@radix-ui/react-*` (or `radix-ui`), `class-variance-authority`,
  `clsx`, `tailwind-merge`, `lucide-react`, `sonner`.
- `src/lib/utils.ts` (`cn`), `src/lib/datetime.ts` (`formatTime(iso, tz)` "5:30 PM", `formatDate(iso|date, tz)`
  "Sat, 10 Oct 2026", `formatDayLabel`, `todayInTz(tz) -> "YYYY-MM-DD"`, `addDays(ymd, n)`, `startOfWeek(ymd)` (Monday),
  `weekdayName(i)` (0=Monday) — all via `Intl.DateTimeFormat` with `timeZone`), `src/lib/money.ts`
  (`formatMoney(value: string|number, currency="INR")` → "₹6,450" using `Intl.NumberFormat('en-IN')`),
  `src/lib/errors.ts` (`getErrorMessage(err): string`, `getErrorCode(err): string|undefined` reading `{error,message}`).
- `src/types/api.ts`: TypeScript interfaces for **every** schema in the API contract above, same field names
  (snake_case), money as `string`, times as `string`. Also `AppointmentStatus`, `SubscriptionStatus` unions.
- `src/services/api.ts`: axios instance `baseURL = ${import.meta.env.VITE_API_URL ?? ''}/api/v1`; request interceptor
  adds Bearer from `tokenStorage`; response interceptor on 401 (not for `/auth/login|register|refresh`) performs a
  **single-flight** refresh (shared promise), retries once, otherwise clears tokens and dispatches
  `window.dispatchEvent(new Event('auth:logout'))`. `src/lib/tokenStorage.ts` (localStorage, try/catch).
- `src/services/authService.ts`: register, login, refresh, logout, me, updateMe, changePassword, forgotPassword, resetPassword.
- `src/context/AuthContext.tsx` + `src/hooks/useAuth.ts`: `{user, business, isLoading, isAuthenticated, login, register,
  logout, refreshMe, setBusiness}`; boot: if token → `GET /auth/me`.
- `src/lib/queryClient.ts` (retry 1, no retry on 4xx, staleTime 30s).
- `src/components/layout/AppShell.tsx`: owner layout. `lg+`: fixed 256px left sidebar (logo, nav: Today, Calendar,
  Customers, Services, Working hours, Reports, Billing, Settings; footer: business name, "View booking page" link,
  user menu with Sign out). Below `lg`: sticky top bar (menu button → Sheet with same nav, title, avatar).
  Trial banner (`business.subscription_status === 'trialing'` → "Trial ends in N days · Upgrade") and blocking banner when
  `!business.is_bookable`. Main content `max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6`, safe-area padding.
  Nav items use lucide icons. Uses `<Outlet/>`.
- `src/components/layout/PublicLayout.tsx` (simple header with logo + Sign in / Start free trial, footer).
- `src/components/auth/ProtectedRoute.tsx` (spinner while loading, redirect `/login?next=`), `GuestRoute`.
- `src/App.tsx` + `src/routes.tsx` with `React.lazy` code splitting. Routes:
  `/` Landing, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/app` (AppShell, protected) with children
  index Dashboard, `calendar`, `customers`, `customers/:id`, `services`, `hours`, `reports`, `billing`, `settings`;
  `/book/:slug` and `/:slug` → BookingPage; `*` NotFound.
  Foundation creates every page as a minimal placeholder component with the final file name (below) so routing compiles.
- Testing setup: vitest + jsdom + @testing-library/react + @testing-library/jest-dom + @testing-library/user-event,
  `src/test/setup.ts`, `vitest.config` inside `vite.config.ts`.
- ESLint flat config (typescript-eslint, react-hooks, react-refresh) with `@typescript-eslint/no-explicit-any: error`.

### Page files
| Route | File | Owner |
|---|---|---|
| `/` | `pages/LandingPage.tsx` | FRONTEND-A |
| `/login` | `pages/LoginPage.tsx` | FRONTEND-A |
| `/register` | `pages/RegisterPage.tsx` | FRONTEND-A |
| `/forgot-password` | `pages/ForgotPasswordPage.tsx` | FRONTEND-A |
| `/reset-password` | `pages/ResetPasswordPage.tsx` | FRONTEND-A |
| `/:slug`, `/book/:slug` | `pages/BookingPage.tsx` (+ `components/booking/*`) | FRONTEND-A |
| `*` | `pages/NotFoundPage.tsx` | FRONTEND-A |
| `/app` | `pages/app/DashboardPage.tsx` | FRONTEND-B |
| `/app/calendar` | `pages/app/CalendarPage.tsx` | FRONTEND-B |
| `/app/customers` | `pages/app/CustomersPage.tsx` | FRONTEND-B |
| `/app/customers/:id` | `pages/app/CustomerDetailPage.tsx` | FRONTEND-B |
| `/app/services` | `pages/app/ServicesPage.tsx` | FRONTEND-B |
| `/app/hours` | `pages/app/WorkingHoursPage.tsx` | FRONTEND-B |
| `/app/reports` | `pages/app/ReportsPage.tsx` | FRONTEND-B |
| `/app/billing` | `pages/app/BillingPage.tsx` | FRONTEND-B |
| `/app/settings` | `pages/app/SettingsPage.tsx` | FRONTEND-B |

### FRONTEND-A details
- Services: `services/publicService.ts`; hooks `hooks/usePublicBooking.ts`.
- **Landing**: professional SaaS marketing page — header, hero (headline "Online bookings for clinics and salons.
  Zero double bookings."), product screenshot-style mock (pure HTML/CSS dashboard preview, no images), 3-step
  "How it works", feature grid (6), pricing card (₹499/month, 14-day free trial, feature list), FAQ (Radix accordion or
  `<details>`), CTA band (solid colour), footer. No gradients.
- **Auth pages**: centred card (max-w-md), logo, react-hook-form + zod mirroring backend rules, server errors inline,
  `next` redirect after login, register fields: business name, booking URL slug (auto-filled from name, editable,
  shows `slotease.app/<slug>` preview), full name, email, phone, password (show/hide), timezone (select, default browser tz
  if in list else Asia/Kolkata). After register → `/app`.
- **BookingPage** (mobile-first, works one-handed): business header (name, address, phone `tel:` link);
  stepper 1 Service → 2 Date & time → 3 Your details → Confirmation. Service list as large selectable cards (name,
  duration, price). Date strip: horizontally scrollable 14-day chips + "Pick another date" native date input (min today,
  max booking window). Slots grid (3 cols mobile, 4 sm, 6 lg) grouped Morning / Afternoon / Evening; skeletons while
  loading; empty state "No free slots on this day". Details form: name, phone (`inputMode="tel"`, autocomplete), email
  (optional, "for confirmation"), notes. Sticky bottom summary bar on mobile with primary CTA (safe-area aware).
  On 409 SLOT_TAKEN: toast + inline alert, refetch slots, return to step 2. On 403 BUSINESS_INACTIVE: friendly
  full-page message with phone. Confirmation: check icon, booking id (copyable), service, date/time in business tz,
  price, "Add to calendar" (.ics download generated client-side), "Book another". Desktop (`lg+`): two columns
  (steps left, sticky summary card right).
- `NotFoundPage`.

### FRONTEND-B details
- Services: `services/businessService.ts`, `catalogService.ts` (services), `hoursService.ts`, `appointmentService.ts`,
  `customerService.ts`, `statsService.ts`, `billingService.ts`; hooks in `hooks/` (`useAppointments`, `useServices`,
  `useWorkingHours`, `useCustomers`, `useStats`, `useBilling`, `useBusiness`) with TanStack Query keys and
  invalidation on mutations.
- **Dashboard (Today)**: page header "Today, Sat 10 Oct" + business name; date switcher (prev/next/today); 4 stat cards
  (Bookings, Completed, No-shows, Est. revenue) from `/stats/summary`; appointments list: desktop table (Time,
  Customer, Service, Status, Actions) / mobile cards; actions per `booked` row: **Complete**, **No-show**, overflow menu
  (Cancel with confirm, Revert to booked for completed/no_show); "New booking" dialog (service select, date, free-slot
  select via `/public/{slug}/slots` with `service_id`, customer name/phone/email) → `POST /appointments`;
  month strip "This month: 214 bookings · No-show rate 6% · Busiest day: Saturday" from `/stats`;
  getting-started checklist card when the business has 0 services (Add services, Check working hours, Share booking link).
- **Calendar**: week view (Mon–Sun) at `md+`: 7 columns, time-axis grid (hourly rows spanning min open → max close
  across the week, default 08:00-20:00), appointments absolutely positioned by time, coloured by status, click → detail
  dialog with status actions. Below `md`: day selector chips for the 7 days + vertical list for the selected day.
  Week navigation (prev / this week / next). Data via `/appointments?start&end`.
- **Customers**: search (debounced 300ms), paginated table/cards (name, phone, bookings, visits, no-shows, last visit);
  detail page with KPIs and appointment history; `tel:` link.
- **Services**: table/cards (name, duration, price, status), add/edit dialog (zod: name required, duration 5-480,
  price ≥ 0), deactivate/reactivate, show inactive toggle.
- **Working hours**: 7 rows Mon–Sun, open toggle (Switch), one or more time ranges per day (add break / remove range),
  `<input type="time" step=900>`, "Copy Monday to all weekdays", Save → `PUT /working-hours`; client validation.
- **Reports**: month picker (`<input type="month">`), KPI cards (Total bookings, Completed, No-show rate, Revenue est.,
  New customers, Busiest day), bar chart daily bookings (recharts, single solid colour, responsive container),
  top services table. No gradients in charts.
- **Billing**: current plan card (Trial / Pro, status badge, trial end / renewal date), price ₹499/month with features,
  Subscribe button → `POST /billing/subscribe` → load `https://checkout.razorpay.com/v1/checkout.js` dynamically and open
  Razorpay Checkout with `subscription_id`, `key`, `name: "SlotEase"`, prefill; handler → `POST /billing/verify`; when
  `billing_configured` false show an info alert "Billing is not configured on this server". Cancel subscription with
  confirm dialog.
- **Settings**: tabs Business (name, phone, email, address, timezone, slug with warning that link changes),
  Booking rules (slot interval select, booking window days, minimum notice), Booking link (read-only URL, Copy, Open,
  QR-free), Account (full name, change password).

---

## DEVOPS (owner: DEVOPS-AGENT)

- `backend/Dockerfile`: python:3.12-slim, multi-stage (build wheels → runtime), non-root user, `tzdata` via pip,
  `docker-entrypoint.sh` (LF line endings) runs `alembic upgrade head` then
  `gunicorn app.main:app -k uvicorn_worker.UvicornWorker -w ${WEB_CONCURRENCY:-2} -b 0.0.0.0:8000 --forwarded-allow-ips='*'`
  (wait for DB with a short retry loop in Python). HEALTHCHECK on `/health` using python urllib.
- `frontend/Dockerfile`: node:22-alpine build (`npm ci`, `npm run build` with `ARG VITE_API_URL=""`) → nginx:1.27-alpine;
  `frontend/nginx.conf`: SPA fallback `try_files $uri /index.html`, `location /api/ { proxy_pass http://backend:8000; ... }`,
  `location = /health` proxy, gzip, long cache for `/assets/`, no-cache for index.html, security headers,
  `client_max_body_size 1m`, proxy headers X-Forwarded-For/Proto.
- `docker-compose.yml` (local full stack): `db` (postgres:16-alpine, volume, healthcheck), `backend` (env_file `.env`,
  `DATABASE_URL` pointing to `db`), `frontend` (port `8080:80`). Only frontend port published (plus `5432` commented).
- `docker-compose.prod.yml` (VPS): same + `caddy` (caddy:2-alpine, ports 80/443, `deploy/Caddyfile`, volumes
  caddy_data/caddy_config), frontend not published publicly (Caddy → frontend:80), `restart: unless-stopped`,
  log rotation (`json-file` max-size 10m max-file 3), env from `.env`.
- `deploy/Caddyfile`: `{$DOMAIN} { encode gzip zstd; reverse_proxy frontend:80 }` (falls back to `:80` when DOMAIN unset
  via `{$DOMAIN::80}`).
- `deploy/production.env.example`, root `.env.example` (all vars from CLAUDE.md + `POSTGRES_USER/PASSWORD/DB`, `DOMAIN`).
- `deploy/deploy.sh`: idempotent VPS script (git pull, `docker compose -f docker-compose.prod.yml up -d --build`,
  prune old images, health check) + `deploy/README.md` with Hostinger VPS steps (Ubuntu, install Docker, firewall
  ufw 22/80/443, DNS A record, clone, `.env`, run, backups with `pg_dump` cron).
- `.github/workflows/ci.yml`: jobs `backend` (Python 3.12, pip install dev reqs, ruff check, ruff format --check,
  mypy app, pytest with coverage ≥80; service postgres:16 with `TEST_POSTGRES_URL` set) and `frontend` (Node 22,
  npm ci, lint, type-check, test, build), `docker` (build both images, no push).
- `.dockerignore` for backend and frontend.

---

## PHASE EXECUTION PLAN

**Phase 1: Foundation (4 agents in parallel)**
- DATABASE-AGENT: `app/database.py`, `app/models/*`, `alembic.ini`, `alembic/env.py`, `alembic/script.py.mako`, `alembic/versions/0001_initial.py`
- BACKEND-FOUNDATION: requirements, pyproject, `app/__init__.py`, `config.py`, `exceptions.py`, `rate_limit.py`,
  `auth/security.py`, `dependencies.py`, `main.py`, `schemas/common.py`, `services/time_utils.py`,
  `services/validators.py`, router stubs, `routers/health.py`, venv at `backend/.venv`
- FRONTEND-FOUNDATION: everything in "Foundation" above
- DEVOPS-AGENT: everything in "DEVOPS"

**Validation Gate 1:** `pip install -r requirements-dev.txt`, `alembic upgrade head` (SQLite), app imports, `npm install`, `npm run build`, `docker compose config`

**Phase 2: Modules (4 agents in parallel)**
- BACKEND-A: auth, business, billing, notifications
- BACKEND-B: services, working hours, slots, public booking, appointments, customers, stats
- FRONTEND-A: landing, auth pages, booking flow, 404
- FRONTEND-B: owner app pages

**Validation Gate 2:** `ruff check`, `mypy app`, `npm run lint`, `npm run type-check`, `npm run build`

**Phase 3: Quality (parallel)**
- TEST-AGENT (backend): pytest suite incl. concurrency + tenant isolation tests, ≥80% coverage
- TEST-AGENT (frontend): Vitest + RTL for key components/pages
- REVIEW-AGENT: security / performance / responsive / accessibility audit → fixes applied by orchestrator

**Final Validation:** full test suites, `docker compose up -d --build`, curl `/health`, smoke booking flow, then GitHub + VPS deploy.

---

## VALIDATION GATES

| Gate | Commands |
|------|----------|
| 1 | `alembic upgrade head`, `python -c "import app.main"`, `npm install`, `npm run build`, `docker compose config` |
| 2 | `ruff check .`, `mypy app`, `npm run lint`, `npm run type-check` |
| 3 | `pytest --cov=app --cov-fail-under=80`, `npm test` |
| Final | `docker compose up -d --build`, `curl localhost:8080/health`, `curl localhost:8080/api/v1/health` |

---

## REQUIRED BACKEND TESTS (TEST-AGENT)

1. **Concurrent double booking**: two threads POST the same slot simultaneously → exactly one 201, one 409 `SLOT_TAKEN`.
2. Sequential duplicate → 409 with exact Sample Output B body.
3. Overlap with different durations (10:00 60-min booked → 10:30 30-min) → 409.
4. Tenant isolation: Business A token cannot GET/PATCH/DELETE Business B's services, appointments, customers
   (404), lists never contain B's rows, stats only count A.
5. Slots respect working hours, duration (last slot ends ≤ close), breaks, existing bookings, past times, notice, window.
6. Booking response shape matches Sample Output A (`APT-YYYYMMDD-NNNN`, offset in business tz, message format).
7. Auth: register/login/refresh rotation/logout/me/change/forgot/reset, password hashed (not plain), rate-limit disabled in tests.
8. Billing: subscribe without config → 503; mocked Razorpay create; verify signature good/bad; webhook signature +
   idempotency + status transitions; trial-expired business → public booking 403.
9. Stats numbers on a known fixture.
10. Optional `TEST_POSTGRES_URL` integration test: runs Alembic on Postgres, checks exclusion constraint rejects overlap.

---

## ENVIRONMENT VARIABLES

See `CLAUDE.md` → Environment Variables. Production adds `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DOMAIN`.

---

## NEXT STEP

```
/execute-prp PRPs/slotease-prp.md
```
