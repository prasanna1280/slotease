# INITIAL.md - SlotEase Product Definition

> A subscription product for clinics and salons: customers book online in 30 seconds, owners manage their day from one dashboard, and double bookings never happen.

---

## PRODUCT

### Name
SlotEase: Appointment Booking SaaS

### Description
Small clinics, salons and physiotherapy centres still take bookings by phone and WhatsApp. Two customers get
the same slot, staff forget to write bookings down, and there is no record of no-shows.

SlotEase gives every business (tenant) its own public booking page (e.g. `slotease.app/glow-salon`) where a
customer picks a service, a date and a free slot, enters name and phone, and confirms. The owner runs the day
from one dashboard: today's appointments, a weekly calendar, services, working hours, one-click
Completed / No-show buttons and monthly stats. The database itself refuses a second booking for the same slot.

### Target User
- **Business owner (admin)** of a small clinic, salon or physiotherapy centre. Pays Rs 499 per month.
- **Customers** of that business, who book from the public booking page on their phone. No login.

### Type
- [x] SaaS (Software as a Service), multi-tenant. Each business is a separate tenant with its own data.

### Product Quality Bar
- Professional, international-standard product. Enterprise look: neutral palette, one accent colour,
  **no gradients**, no glassmorphism, no decorative animation.
- Works on every device: large desktop monitors, laptops, all tablets including iPad (portrait and landscape),
  all Android phones and iPhones (including notch / safe areas, 320px minimum width).
- Accessible (WCAG 2.1 AA contrast, keyboard navigation, visible focus, labelled inputs).

---

## TECH STACK

### Backend
- [x] FastAPI (Python 3.12) + SQLAlchemy 2.0 + Alembic + Pydantic v2

### Frontend
- [x] React + Vite + TypeScript (strict)

### Database
- [x] PostgreSQL 16

### Authentication
- [x] Email/Password with JWT (access + refresh) and bcrypt-hashed passwords

### UI Framework
- [x] Tailwind CSS + shadcn/ui (Radix primitives, lucide-react icons)

### Notifications
- [x] Email booking confirmation (Resend API, or SMTP; logs to console when neither is configured)

### Payments
- [x] Razorpay Subscriptions (Rs 499/month, 14-day free trial)

### Deploy
- [x] Docker Compose on a Hostinger VPS (Postgres + backend + frontend/nginx + Caddy for HTTPS), GitHub for source and CI

---

## MODULES

### Module 1: Authentication & Tenant Onboarding (Required)

**Description:** Owner sign-up creates a business (tenant) and its owner user in one step. JWT login.

**Models:**
- Business: id, name, slug, phone, email, address, timezone, plan, subscription fields, created_at
- User: id, business_id, email, password_hash, full_name, role (owner | staff), is_active, created_at
- RefreshToken: id, user_id, token_hash, expires_at, revoked_at

**API Endpoints:**
- POST /auth/register - Create business + owner account, return JWT
- POST /auth/login - Login with email/password
- POST /auth/refresh - Rotate refresh token
- POST /auth/logout - Revoke refresh token
- POST /auth/forgot-password, POST /auth/reset-password - Password reset by email
- GET /auth/me - Current user + business
- GET /business, PATCH /business - Business profile and booking settings

**Frontend Pages:**
- / - Marketing landing page with pricing
- /login, /register, /forgot-password, /reset-password

---

### Module 2: Services & Working Hours

**Description:** What the business sells and when it is open.

**Models:**
- Service: id, business_id, name, description, duration_min, price, is_active
- WorkingHours: id, business_id, weekday, open_time, close_time (several rows per day allowed, e.g. lunch break)

**API Endpoints:**
- CRUD /services
- GET /working-hours, PUT /working-hours

**Frontend Pages:**
- /app/services - list, add, edit, deactivate
- /app/hours - weekly working hours editor

---

### Module 3: Public Booking (Customer)

**Description:** Mobile-first public booking page per business. Pick service, date, free slot, enter name and
phone, confirm. Slot calculation = working hours minus booked slots, respecting service duration.

**Models:**
- Customer: id, business_id, name, phone, email
- Appointment: id, business_id, service_id, customer_id, reference, start_time, end_time, status, price
  - status: booked | completed | cancelled | no_show
  - UNIQUE (business_id, start_time) for non-cancelled appointments, plus a Postgres exclusion constraint
    so overlapping time ranges are also refused by the database.

**API Endpoints:**
- GET /public/{slug} - Business profile
- GET /public/{slug}/services - Active services
- GET /public/{slug}/slots?service_id&date - Free slots for that day
- POST /public/{slug}/bookings - Create booking (409 SLOT_TAKEN if slot taken)

**Frontend Pages:**
- /{slug} and /book/{slug} - Booking flow (service → date & time → details → confirmation)

---

### Module 4: Owner Dashboard & Appointments

**Description:** Owner runs the day from one screen.

**API Endpoints:**
- GET /appointments?date= (and ?start=&end= for the weekly calendar)
- POST /appointments - Owner adds a phone / walk-in booking
- PATCH /appointments/{id} - Mark completed, cancelled or no_show
- GET /customers, GET /customers/{id} - Customer history and repeat visits

**Frontend Pages:**
- /app - Today: KPIs (bookings, no-shows, estimated revenue) + today's list with Complete / No-show buttons
- /app/calendar - Weekly calendar (day view on phones)
- /app/customers - Customer list with visit history

---

### Module 5: Stats & Reports

**API Endpoints:**
- GET /stats?month=YYYY-MM - Bookings, no-show rate, revenue estimate, busiest day, daily trend, top services

**Frontend Pages:**
- /app/reports - Monthly report with KPI cards and charts

---

### Module 6: Billing (Razorpay)

**API Endpoints:**
- GET /billing - Plan and subscription status
- POST /billing/subscribe - Create Razorpay subscription, return checkout details
- POST /billing/verify - Verify checkout signature, activate plan
- POST /billing/cancel - Cancel at end of billing cycle
- POST /billing/webhook - Razorpay webhook (signature verified, idempotent)

**Frontend Pages:**
- /app/billing - Plan card, trial status, subscribe / cancel

---

### Module 7: Settings

**Frontend Pages:**
- /app/settings - Business profile, booking link (copy / open), timezone, slot interval, booking window, profile

---

## MVP SCOPE

### Must Have (MVP)
- [x] Owner sign-up (creates tenant) and JWT login
- [x] Services and working hours management
- [x] Public booking page with correct free-slot calculation
- [x] Double-booking prevention enforced by the database (409 SLOT_TAKEN)
- [x] Owner dashboard: today's list, weekly calendar, Completed / No-show
- [x] Monthly stats: bookings, no-show rate, revenue estimate
- [x] Strict tenant isolation: every query filtered by business_id
- [x] Email booking confirmation
- [x] Razorpay Rs 499/month subscription with 14-day trial

### Nice to Have (Post-MVP / stretch)
- Razorpay advance payment per booking to reduce no-shows
- Automatic WhatsApp reminder 2 hours before the appointment
- Multiple staff members, each with their own calendar

---

## ACCEPTANCE CRITERIA (Done checklist)

### Booking integrity
- [ ] Two browsers booking the same slot at the same time: one succeeds (201), one gets 409 SLOT_TAKEN
- [ ] Slots respect working hours, service duration and already booked times
- [ ] Booking page works well on a mobile phone

### Tenant isolation
- [ ] Logged in as Business A, you cannot read or change Business B's data (tested)

### Authentication
- [ ] Owner can register (creates business) and login with email/password
- [ ] JWT access + refresh tokens work, refresh rotates
- [ ] Protected routes redirect to login
- [ ] Passwords are hashed with bcrypt, secrets are in .env

### Sample outputs
- [ ] POST /public/glow-salon/bookings → 201 with booking_id like `APT-20261010-0007`, service, start/end time with offset, status, message
- [ ] Same slot again → 409 `{ "error": "SLOT_TAKEN", "message": "This slot was just booked. Please pick another time." }`
- [ ] Dashboard shows today's bookings, no-shows, estimated revenue and month summary

### Quality
- [ ] All API endpoints documented in OpenAPI (/docs)
- [ ] Backend test coverage 80%+
- [ ] Frontend TypeScript strict mode passes, lint passes
- [ ] Docker builds and runs; deployed on Hostinger VPS with a live URL
- [ ] README explains setup, database tables and API endpoints

---

## SPECIAL REQUIREMENTS

### Security
- [x] Rate limiting on auth and public booking endpoints
- [x] Input validation on all endpoints
- [x] SQL injection prevention (ORM, bound parameters only)
- [x] XSS prevention (React escaping, no dangerouslySetInnerHTML)
- [x] Razorpay signature verification (checkout + webhook)

### Integrations
- [x] Email service (Resend / SMTP)
- [x] Razorpay Subscriptions
- [ ] File upload service

---

## AGENTS

| Agent | Role | Works On |
|-------|------|----------|
| DATABASE-AGENT | Creates all models and migrations | All database models |
| BACKEND-AGENT | Builds API endpoints and services | All modules' backends |
| FRONTEND-AGENT | Creates UI pages and components | All modules' frontends |
| DEVOPS-AGENT | Sets up Docker, CI/CD, environments | Infrastructure |
| TEST-AGENT | Writes unit and integration tests | All code |
| REVIEW-AGENT | Security and code quality audit | All code |

---

# READY?

```bash
/generate-prp INITIAL.md
```

Then:

```bash
/execute-prp PRPs/slotease-prp.md
```
