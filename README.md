# Reservation App

A reservation platform where shop owners (haircuts, spas, car washes, repairs, etc.) list services and customers book time slots. Pay-on-arrival or PayMongo (GCash / GrabPay / Maya / cards). Commission-based monetization. See [app_ideas.md](app_ideas.md) for the full spec.

## Stack

- **Backend:** Django 5 · DRF · Channels · Celery + Celery Beat · Redis · PostgreSQL
- **Frontend:** Next.js 15 (App Router) · Tailwind · TanStack Query · Zustand
- **Payments:** PayMongo (PHP) · pay-on-arrival fallback
- **Infra:** Docker Compose

---

## Quick start

Prereqs: Docker Desktop installed and running.

```bash
docker compose up --build
```

`backend/.env` ships with dev defaults (copy from `backend/.env.example` for fresh installs). On `web` startup the container runs `makemigrations → migrate → seed_categories → runserver`.

Create a superuser:

```bash
docker compose exec web python manage.py createsuperuser
```

### Where things live

| Service     | URL                                                     | Notes                                   |
|-------------|---------------------------------------------------------|-----------------------------------------|
| Frontend    | http://localhost:3000                                   | Next.js                                 |
| API         | http://localhost:8000/api/                              | DRF                                     |
| API docs    | http://localhost:8000/api/docs/                         | Swagger UI (`drf-spectacular`)          |
| Django admin| http://localhost:8000/admin/                            | Django admin                            |
| Health      | http://localhost:8000/health/                           | `{"status": "ok"}` for orchestrator     |
| WebSocket   | ws://localhost:8000/ws/notifications/?token=&lt;jwt&gt; | Real-time notifications                 |
| Postgres    | localhost:5432                                          | user/pw: `postgres`/`postgres`          |
| Redis       | localhost:6379                                          | broker + channel layer + cache          |

---

## Docker services

`docker-compose.yml` defines 7 containers with hot-reload mounts for backend + frontend:

| Container | Image / Build       | Purpose                                            |
|-----------|---------------------|----------------------------------------------------|
| `db`      | `postgres:16-alpine`| Primary database                                   |
| `redis`   | `redis:7-alpine`    | Celery broker + Channels layer + caching           |
| `web`     | `./backend`         | Django + DRF + Channels (Daphne via runserver)     |
| `worker`  | `./backend`         | Celery worker — emails, reminders, no-show sweeps  |
| `beat`    | `./backend`         | Celery Beat scheduler                              |
| `frontend`| `./frontend`        | Next.js dev server                                 |

---

## Project layout

```
backend/
  config/                # settings, URLs, ASGI/WSGI, Celery, WS auth, test settings
  apps/
    core/                # shared helpers (email send_template_email)
    accounts/            # custom User, JWT, role permissions, tokens, verify+reset emails
    shops/               # Shop, Staff, ShopCategory, hours, overrides, photos, geocoding, analytics
    services/            # Service, ServiceCategory, cross-shop discovery
    reservations/        # Reservation, availability, booking, commission ledger, lifecycle
    reviews/             # Review (rating + shop reply)
    notifications/       # Notification model, REST API, Channels consumer, signals, push helpers
    admin_panel/         # platform-admin endpoints (overview, pending shops, commission ledger)
    payments/            # Payment model, PayMongo client, checkout, webhook, refund
  templates/emails/      # booking_confirmation, booking_reminder, verify_email, password_reset (txt+html)
frontend/
  src/
    app/                 # Next.js App Router pages (mobile-first responsive)
    components/
      TopNav.tsx                # nav bar with role-aware links
      NotificationBell.tsx      # WS-driven unread badge + dropdown
      HoursEditor.tsx           # reusable weekly schedule editor (shop + staff hours)
      SlotPicker.tsx            # reusable availability picker (book + reschedule)
      ShopForm.tsx              # reusable shop create/edit form
      ServiceForm.tsx           # reusable service create/edit form
      RegisterServiceWorker.tsx # registers PWA sw.js in production
    lib/
      api.ts               # axios instance with JWT interceptor
      auth.ts              # zustand auth store
      ws.ts                # WebSocket helper
      errors.ts            # formatApiError — friendly DRF error parser
      cn.ts                # classnames helper (clsx + tailwind-merge)
  public/
    manifest.webmanifest   # PWA manifest
    sw.js                  # PWA service worker (app-shell cache, network-first /api)
docker-compose.yml
```

---

## Environment variables

All in `backend/.env` (mirrors `backend/.env.example`).

| Key | Default | What it does |
|-----|---------|--------------|
| `DJANGO_SECRET_KEY` | dev-secret | Django signing key — set strong in prod |
| `DJANGO_DEBUG` | `True` | Disable in prod |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1,web` | Comma-separated host allowlist |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_HOST` / `POSTGRES_PORT` | postgres / postgres / postgres / db / 5432 | DB connection |
| `REDIS_URL` | `redis://redis:6379/0` | Channels layer |
| `CELERY_BROKER_URL` | `redis://redis:6379/1` | Celery broker |
| `CELERY_RESULT_BACKEND` | `redis://redis:6379/2` | Celery results |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated origins |
| `FRONTEND_URL` | `http://localhost:3000` | Used to build absolute links inside emails |
| `DEFAULT_COMMISSION_RATE` | `0.10` | Platform fallback rate; override per-shop with `Shop.commission_rate` |
| `DEFAULT_CANCELLATION_WINDOW_HOURS` | `24` | Hours-before-start cutoff for free cancel |
| `STRIKE_LIMIT` | `3` | Strikes-in-window before customer is restricted |
| `STRIKE_WINDOW_DAYS` | `90` | Rolling window for strikes |
| `EMAIL_BACKEND` | `console` | `django.core.mail.backends.smtp.EmailBackend` for prod |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` / `EMAIL_USE_TLS` | — | SMTP config when not console |
| `DEFAULT_FROM_EMAIL` | `Reserva <noreply@reserva.local>` | "From:" header |
| `PAYMONGO_SECRET_KEY` | "" | PayMongo secret (sk_test_… or sk_live_…). Empty enables dev-fake mode. |
| `PAYMONGO_PUBLIC_KEY` | "" | PayMongo publishable key |
| `PAYMONGO_WEBHOOK_SECRET` | "" | HMAC secret PayMongo uses to sign webhooks |

---

## API endpoints

All routes are prefixed `/api/` unless noted. JWT required except where marked **public**.

### Auth (`/api/auth/`)
- **public** `POST register/` — create account (returns User; verification email queued)
- **public** `POST login/` — JWT pair
- **public** `POST refresh/` — refresh JWT
- `GET / PATCH me/` — current user
- **public** `POST verify-email/` `{token}` — confirm email
- `POST resend-verification/` — re-send verification email
- **public** `POST password/reset/` `{email}` — request reset (always 200, no enum)
- **public** `POST password/reset/confirm/` `{token, new_password}` — apply reset

### Shops (`/api/shops/`)
- **public** `GET /` — list active shops (search, filter by city/category, ordering)
- **public** `GET /<id>/` — shop detail (photos, weekday hours)
- **public** `GET nearby/?lat&lng&radius_km` — Haversine search
- **public** `GET categories/` — shop categories
- `GET mine/` — owner's shops
- `POST /` — create shop (auto-geocoded if lat/lng blank)
- `PATCH /<id>/` — edit shop
- `POST /<id>/publish/` · `POST /<id>/pause/` — toggle status
- `GET / PUT /<id>/hours/` — weekly hours
- `GET / POST /<id>/overrides/` · `DELETE /<id>/overrides/<override_id>/` — date overrides
- `GET / POST /<id>/photos/` (multipart) · `DELETE /<id>/photos/<photo_id>/` — shop photos
- `GET /<id>/analytics/?days=30` — owner-only analytics
- Staff sub-resource: `GET /staff/?shop=<id>`, `POST/PATCH/DELETE /staff/<id>/`, `GET / PUT /staff/<id>/hours/`
- Favorites: `GET / POST /favorites/`, `DELETE /favorites/<id>/` (customer-only)

### Services (`/api/services/`)
- **public** `GET /` (filter `shop`, `category`, `is_active`)
- **public** `GET /<id>/`
- **public** `GET discover/?q&city&category` — cross-shop search with shop info embedded
- **public** `GET categories/` — service categories
- `POST /` · `PATCH /<id>/` (multipart for `photo`) · `DELETE /<id>/`

### Reservations (`/api/reservations/`)
- **public** `GET availability/?shop&service&staff&date` — open slots (15-min granularity)
- `GET /` — own reservations (customer) or shop's reservations (owner)
- `GET /<id>/`
- `POST book/` `{shop, service, staff?, start_at, customer_notes?, payment_method}` — customer booking
- `POST walk-in/` `{shop, service, staff?, start_at, customer_id? OR guest_name+guest_phone}` — owner walk-in
- `POST <id>/confirm/` · `complete/` · `no-show/` · `cancel/` · `reschedule/` `{start_at}`

### Reviews (`/api/reviews/`)
- **public** `GET /` (filter `shop`, `rating`)
- `POST /` `{reservation, rating, comment?}` — only for completed bookings the user made
- `PATCH /<id>/` · `DELETE /<id>/` — own reviews
- `POST /<id>/reply/` `{shop_reply}` — shop owner reply

### Notifications (`/api/notifications/`)
- `GET /` — paginated list of own notifications
- `GET /<id>/`
- `POST /<id>/mark-read/`
- `POST mark-all-read/`

### Payments (`/api/payments/`)
- `POST reservations/<id>/checkout/` — customer; returns `{checkout_url, session_id, status}`
- `POST reservations/<id>/refund/` — shop owner; full refund
- `POST reservations/<id>/dev-confirm/` — dev-only (when `PAYMONGO_SECRET_KEY` is empty); marks paid without going through PayMongo
- **public** `POST webhooks/paymongo/` — verifies HMAC SHA-256 signature, fans out `paid`/`failed`

### Chat (`/api/chat/`)
- `GET rooms/` — paginated list of the requester's rooms, with `unread_count` + `last_message` preview
- `POST rooms/` — customer only; body `{shop}` → idempotent get-or-create
- `GET rooms/<id>/` — single room (must be a participant)
- `GET rooms/<id>/messages/` — paginated messages (oldest first)
- `POST rooms/<id>/messages/` — body `{body}` → send a message
- `POST rooms/<id>/read/` — body `{message_id}` → move read cursor forward
- `POST rooms/<id>/unread/` — body `{message_id}` → rewind so the target and everything after count as unread
- `PATCH messages/<id>/` — body `{body}` → edit your own message (sets `edited_at`)
- `GET unread-count/` — total unread across all rooms

### Admin panel (`/api/admin-panel/`) — admin only
- `GET overview/` — shop counts, reservation counts, commission totals
- `GET pending-shops/` — shops awaiting approval
- `POST shops/<id>/approve/` — flip to `active`
- `GET commission/?period=YYYY-MM` — ledger rows + per-shop summary

### WebSocket
- `ws://.../ws/notifications/?token=<jwt>` — auto-joins `user.<id>` group, plus `shop.<id>` for each owned shop. Server pushes `{kind, title, body, payload}` events. New chat messages are fanned out here as `kind="chat.new_message"` so badges update without a room socket open.
- `ws://.../ws/chat/rooms/<id>/?token=<jwt>` — joins `chat.room.<id>`. Server pushes `chat.message`, `chat.message_edited`, and `chat.read_state` events for that room.

### Misc
- `GET /health/` — orchestrator probe
- `GET /api/schema/` — OpenAPI 3 schema
- `GET /api/docs/` — Swagger UI

---

## Frontend pages

Mobile-first responsive across the board. Role-gated where indicated.

### Public
| Path | Page |
|------|------|
| `/` | Landing |
| `/login` | Login (with "Forgot password?" link) |
| `/register` | Register (customer or shop_owner) |
| `/forgot-password` | Request reset link |
| `/reset-password?token=…` | Set new password |
| `/verify-email?token=…` | Email verification |
| `/shops` | Shop browse + "Find shops near me" |
| `/shops/[id]` | Shop detail (photos, services, reviews) |
| `/services` | Cross-shop service search |

### Customer
| Path | Page |
|------|------|
| `/shops/[id]/book?service=…` | Booking flow (staff picker, slot picker, pay-on-arrival vs PayMongo) |
| `/reservations` | My bookings (cancel, reschedule, leave review, pay now) |
| `/reservations/[id]/reschedule` | Pick new slot |
| `/reservations/[id]/review` | 1–5 star rating + comment |
| `/favorites` | Saved shops |
| `/chat` | All chats (per-room unread badges, last-message preview) |
| `/chat/[roomId]` | Conversation view (real-time, edit own messages, mark-unread-from) |

### Shop owner
| Path | Page |
|------|------|
| `/dashboard` | List of owned shops |
| `/dashboard/shops/new` | Create shop (auto-geocoded) |
| `/dashboard/shops/[id]` | Shop dashboard — services, reservations, status pills, refund button |
| `/dashboard/shops/[id]/edit` | Edit shop |
| `/dashboard/shops/[id]/hours` | Weekly hours |
| `/dashboard/shops/[id]/overrides` | Holiday / one-off overrides |
| `/dashboard/shops/[id]/staff` | Staff list + add/activate/remove |
| `/dashboard/shops/[id]/staff/[staffId]/hours` | Per-staff weekly schedule |
| `/dashboard/shops/[id]/photos` | Upload / delete shop photos |
| `/dashboard/shops/[id]/analytics` | Revenue / no-show / top services |
| `/dashboard/shops/[id]/walk-in` | Manual walk-in booking |
| `/dashboard/shops/[id]/services/new` | Create service |
| `/dashboard/shops/[id]/services/[serviceId]/edit` | Edit service + upload photo |

### Admin
| Path | Page |
|------|------|
| `/admin` | Platform overview |
| `/admin/pending-shops` | Approve queued shops |
| `/admin/commission` | Commission ledger (per-shop summary + recent entries) |

---

## Implementation status

> Phase 1 ✅ · Phase 2 ✅ · Phase 3 partial (online payments + admin + analytics done; native mobile, SMS, social login, deposits not yet)

Below: each feature with where it lives in the code.

### Auth & users
- Custom `User` with role enum (`admin` / `shop_owner` / `customer`), JWT (rotating refresh), email-as-username
- Strike fields: `no_show_count_90d`, `cancellation_strikes_90d`, `restricted_until`, `email_verified_at`
- Permissions: `IsCustomer`, `IsShopOwner`, `IsShopOwnerOrReadOnly`, `IsAdmin`
- Verification + password reset via Django `TimestampSigner` (3-day / 1-hour TTL); reset token invalidates on password change

### Multi-shop ownership
- One owner → many shops via `Shop.owner` FK; dashboard switches between them

### Shops & services
- Shop fields: name, description, address, lat/lng (auto-geocoded via [Nominatim](backend/apps/shops/geocoding.py)), hours, status, commission_rate (override), cancellation_window_hours
- `WeekdayHours`, `HoursOverride`, `ShopPhoto`, `Staff`, `StaffWorkingHours`, `TimeBlock`
- Service fields: name, description, duration_minutes, buffer_minutes, price, photo, eligible_staff
- Publish / pause flows

### Discovery
- `GET /api/shops/` — search + filter
- `GET /api/shops/nearby/` — bounding-box pre-filter + Haversine distance, sorted by distance (no PostGIS)
- `GET /api/services/discover/` — cross-shop search returning shop name + city embedded
- Frontend "Find shops near me" via browser Geolocation API; falls back to plain list on denial

### Booking & availability
- [availability.py](backend/apps/reservations/availability.py): shop hours ∩ staff hours ∩ existing reservations ∩ time blocks ∩ overrides; 15-min granularity; never returns past slots
- Customer booking + shop-owner walk-in (with guest_name/phone); staff selection optional ("Any available")
- Reschedule flow checks the same availability constraints

### Reservation lifecycle
- `pending → confirmed → completed`, plus `cancelled_by_customer`, `cancelled_by_shop`, `no_show`
- Every transition writes a `ReservationStatusHistory` row
- Auto no-show via Celery Beat (every 5 min, 15-min grace)

### Cancellation policy & strikes
- Platform default `DEFAULT_CANCELLATION_WINDOW_HOURS` (24h); per-shop override only allowed to *tighten*
- Cancel inside window → +1 strike; no-show → +1 strike + +1 no-show counter
- `STRIKE_LIMIT` strikes in `STRIKE_WINDOW_DAYS` → `restricted_until` set; new bookings blocked
- `decay_strikes` Beat task clears expired restrictions hourly

### Commission ledger
- `CommissionLedger` row created when an online reservation is marked `completed`
- Rate resolution: `Shop.commission_rate` if set, else `DEFAULT_COMMISSION_RATE`
- Walk-ins are excluded
- Settled off-platform; flip `settled_at` in Django admin

### Online payments — PayMongo
- Provider: PayMongo (PHP-only; supports GCash / GrabPay / Maya / Visa / Mastercard / JCB). **No Stripe.**
- [Payment](backend/apps/payments/models.py) model (one-to-one with Reservation), provider session id, status, amount, currency, paid_at
- [PayMongo client](backend/apps/payments/paymongo.py) — Checkout Sessions API, HTTP Basic auth, amounts in centavos, refunds, dev-fake mode when `PAYMONGO_SECRET_KEY` is empty
- Customer-side: at booking time, choose **Pay on arrival** (default) or **Pay now (PayMongo)**; "Pay now" creates the booking, then redirects to PayMongo's hosted page. After PayMongo posts a `checkout_session.payment.paid` webhook (HMAC-SHA256 verified), `mark_paid()` flips the Payment to `paid` and auto-confirms the Reservation.
- Shop-owner-side: **Refund** button on any paid reservation issues a full PayMongo refund and cancels the booking
- **Payout model:** PayMongo has no Stripe-Connect equivalent — all customer payments land in the platform's PayMongo account, and the platform settles each shop's earnings (`gross − commission`) off-platform on a regular cadence

### PayMongo setup
1. Create a sandbox account at https://dashboard.paymongo.com.
2. Copy your **secret + public** keys (test mode) into `backend/.env`:
   ```
   PAYMONGO_SECRET_KEY=sk_test_...
   PAYMONGO_PUBLIC_KEY=pk_test_...
   ```
3. Add a webhook in the PayMongo dashboard pointing to `http(s)://<host>/api/payments/webhooks/paymongo/` and copy the signing secret to `PAYMONGO_WEBHOOK_SECRET`. For local dev, expose your container with ngrok or similar.
4. Restart `web` and `worker`.

If you skip steps 1–3, the client returns a fake checkout URL and `POST /api/payments/reservations/<id>/dev-confirm/` lets you simulate the webhook to drive the reservation to `confirmed` end-to-end.

### Reviews
- One review per completed reservation; server-side validation that the reservation is `completed` and belongs to the requester
- Shop-owner inline reply on each unanswered review

### Real-time notifications
- WebSocket consumer at `/ws/notifications/?token=<jwt>` — token auth via custom `JWTAuthMiddleware`; auto-joins `user.<id>` group, plus `shop.<id>` for each owned shop
- `Notification` model persists every push so reloads show history
- `push_to_user()` / `push_to_shop()` helpers in [notifications/services.py](backend/apps/notifications/services.py)
- Signals on `Reservation` create + `ReservationStatusHistory` create fire notifications and email tasks
- REST API for inbox: `GET /api/notifications/`, `POST /api/notifications/<id>/mark-read/`, `POST /api/notifications/mark-all-read/`
- Frontend [NotificationBell](frontend/src/components/NotificationBell.tsx) reads the WebSocket and renders an unread badge

### Email
- HTML + text templates in [backend/templates/emails/](backend/templates/emails/): booking_confirmation, booking_reminder, verify_email, password_reset
- Single helper: [apps/core/emails.py](backend/apps/core/emails.py) `send_template_email`
- Celery tasks: `send_booking_confirmation_email` (signal-driven on create), `schedule_reminders` (24h + 1h via `apply_async(eta=…)`)
- Dev uses Django console backend (logs to stdout); switch `EMAIL_BACKEND` for SMTP

### Admin dashboard
- [overview](frontend/src/app/admin/page.tsx): shop counts (total/active/pending/paused), reservation counts, commission totals
- [pending-shops](frontend/src/app/admin/pending-shops/page.tsx): one-click approve
- [commission ledger](frontend/src/app/admin/commission/page.tsx): per-shop summary (settled / outstanding) + recent entries; `?period=YYYY-MM` filter
- Backed by [admin_panel app](backend/apps/admin_panel/) and `IsAdmin` permission

### Shop analytics
- `GET /api/shops/<id>/analytics/?days=30` (owner only): bookings, completion + no-show rates, gross revenue, commission, net, top services
- [Analytics page](frontend/src/app/dashboard/shops/[id]/analytics/page.tsx) with 7/30/90/365-day windows

### Customer favorites
- Heart toggle on shop detail; dedicated `/favorites` page
- Backed by `Favorite` model + `/api/shops/favorites/`

### Chat
- 1:1 conversations between a customer and a shop (the owner replies). Customer initiates from the shop detail page.
- Models in [chat/models.py](backend/apps/chat/models.py): `ChatRoom` (unique per `(customer, shop)`), `Message`, `ChatParticipant` (per-user read cursor pointing at the highest message they've seen).
- Service layer in [chat/services.py](backend/apps/chat/services.py) — views/consumers stay thin.
- Edit your own messages (sets `edited_at`); body cannot be empty.
- Unread count per room = messages in the room past your read cursor that you didn't send.
- "Mark unread from here" rewinds the read cursor to the predecessor of the chosen message, so the target and everything after re-enter the unread tally.
- Real-time fan-out: writes go through REST; the service layer broadcasts `chat.message` / `chat.message_edited` / `chat.read_state` events to the `chat.room.<id>` channel group, and a lightweight `chat.new_message` notification to each recipient's `user.<id>` group so the nav badge updates without an open room socket.
- Frontend: [/chat](frontend/src/app/chat/page.tsx) list with unread badges, [/chat/[roomId]](frontend/src/app/chat/[roomId]/page.tsx) conversation view, [ChatBadge](frontend/src/components/ChatBadge.tsx) in the nav.

### Mobile-first responsive UI
- Tailwind mobile-first breakpoints, 44px min touch targets, viewport meta with `width=device-width`
- Touch-friendly time-slot picker, stacked layouts on mobile, full-width primary buttons on phones

### PWA
- [manifest.webmanifest](frontend/public/manifest.webmanifest) with theme color, standalone display
- [sw.js](frontend/public/sw.js) — app-shell cache + network-first for `/api`; auto-registered in production builds via [RegisterServiceWorker](frontend/src/components/RegisterServiceWorker.tsx)
- "Add to Home Screen" works on iOS Safari and Android Chrome

### Code quality / dedup
- Shared email helper: [apps/core/emails.py](backend/apps/core/emails.py) `send_template_email`
- Reusable [HoursEditor](frontend/src/components/HoursEditor.tsx) — both shop hours and per-staff hours pages
- Reusable [SlotPicker](frontend/src/components/SlotPicker.tsx) — booking + reschedule
- Reusable [ShopForm](frontend/src/components/ShopForm.tsx) + [ServiceForm](frontend/src/components/ServiceForm.tsx) — create + edit screens
- [formatApiError](frontend/src/lib/errors.ts) — friendly DRF error parser; replaces every `JSON.stringify(err)` site
- `FRONTEND_URL` env var; no hardcoded localhost in code

### Cross-cutting
- CORS configured for `http://localhost:3000` (`django-cors-headers`)
- OpenAPI / Swagger via `drf-spectacular` at `/api/docs/`
- `seed_categories` management command pre-loads 7 shop categories + 21 service categories
- WebSocket runs over the same `web` service via Channels + Daphne (auto-enabled because `daphne` is first in `INSTALLED_APPS`)

---

## Tests

Run all: `docker compose exec web python manage.py test --settings=config.test_settings`

Test settings module: [config/test_settings.py](backend/config/test_settings.py) — sqlite in-memory, in-memory channel layer, eager Celery, console email, MD5 password hasher.

| Suite | Covers |
| --- | --- |
| [reservations/tests/test_lifecycle.py](backend/apps/reservations/tests/test_lifecycle.py) | pending creation + history row, conflict detection, walk-in commission exclusion, commission rate (shop override + platform default), strike accrual + restriction, reschedule moves times + rejects on completed |
| [payments/tests/test_payments.py](backend/apps/payments/tests/test_payments.py) | dev-mode fake checkout URL, idempotent `start_checkout`, `mark_paid` auto-confirms reservation, valid + invalid PayMongo webhook signatures, checkout endpoint authorization, dev-confirm helper |
| [accounts/tests/test_tokens.py](backend/apps/accounts/tests/test_tokens.py) | email-token round trip + expiry, password-token round trip, password-change invalidates outstanding reset tokens, verify-email endpoint, reset-request doesn't leak account existence, reset-confirm enforces minimum length |
| [shops/tests/test_hours_and_availability.py](backend/apps/shops/tests/test_hours_and_availability.py) | hours PUT permission checks, override marks day closed → 0 slots, override with narrower hours limits slots, no slots in the past |
| [chat/tests/test_services.py](backend/apps/chat/tests/test_services.py) | get-or-create idempotency, only-customer-can-open + only on active shops, sender must be a participant, edit only your own message, unread arithmetic across rooms, mark-read forward / mark-unread rewind incl. first-message edge case |
| [chat/tests/test_api.py](backend/apps/chat/tests/test_api.py) | open room (customer-only), list scoped to self, outsiders 404, send / list / edit / mark-read / mark-unread end-to-end, global unread-count, unauthenticated 401 |

---

## Useful commands

```bash
# migrations
docker compose exec web python manage.py migrate
docker compose exec web python manage.py makemigrations

# seed categories (idempotent)
docker compose exec web python manage.py seed_categories

# Django shell
docker compose exec web python manage.py shell

# tests
docker compose exec web python manage.py test --settings=config.test_settings

# tail logs
docker compose logs -f web
docker compose logs -f worker
docker compose logs -f beat
docker compose logs -f frontend

# trigger a Celery task by hand
docker compose exec worker celery -A config call apps.reservations.tasks.auto_mark_no_shows
```

---

## Frontend deploy (S3 + CloudFront)

The frontend is a Next.js **static export** (`output: "export"` in [frontend/next.config.mjs](frontend/next.config.mjs)) hosted on S3, fronted by CloudFront. No API routes, no middleware, no server actions, no ISR — all data fetching is client-side via TanStack Query against the Django API.

### Architecture

```
   git push staging                       git push main
        │                                       │
        ▼                                       ▼
  ┌───────────────────────────────────────────────────┐
  │  GitHub Actions: .github/workflows/frontend-deploy │
  │  (npm ci → next build → s3 sync → invalidate)     │
  └───────────────────────────────────────────────────┘
        │ OIDC: assume role                    │ OIDC: assume role
        │ (only refs/heads/staging allowed)    │ (only refs/heads/main allowed)
        ▼                                       ▼
  ┌─────────────────────────┐         ┌─────────────────────────┐
  │  STAGING (in same AWS)  │         │  PROD (same AWS account) │
  │  • S3: …-stage-frontend │         │  • S3: …-prod-frontend   │
  │  • CloudFront (OAC)     │         │  • CloudFront (OAC)      │
  │  • IAM role (staging)   │         │  • IAM role (prod)       │
  └─────────────────────────┘         └─────────────────────────┘
              │                                   │
              ▼                                   ▼
       dxxxxxx.cloudfront.net           dyyyyyy.cloudfront.net
```

Key properties:

- **S3 buckets are private.** Only CloudFront can read them (via Origin Access Control). No public-access ACL bullshit.
- **No long-lived AWS keys in GitHub.** GH Actions assumes an IAM role via OIDC. The trust policy is locked to this repo + the **GitHub Environment** the job declares (staging role only trusts `environment:staging`; prod only `environment:prod`). This means a job *must* use `environment: staging` (or `prod`) in its YAML to assume the role — branch protections on the GitHub Environment then gate prod deploys.
- **Cache strategy:** `/_next/*` is fingerprinted (hashes in filename) → 1-year immutable cache. HTML and root assets → 60s cache + `must-revalidate`. Every deploy invalidates `/*` so HTML reloads quickly.
- **SPA fallback:** CloudFront rewrites 403/404 → `/index.html` so hard refreshes on dynamic routes work.

### Branch → environment mapping

| Branch | Environment | CloudFront URL |
|---|---|---|
| `staging` | staging | `<stage cloudfront_domain_name>` |
| `main` | prod | `<prod cloudfront_domain_name>` |

The workflow only fires on changes under `frontend/**` or the workflow file itself, so backend-only pushes don't trigger a frontend redeploy. You can also force a deploy via the workflow's `workflow_dispatch` input.

### First-time setup (do this once)

**Prerequisites for the IAM user running `terragrunt apply`:** it needs `AdministratorAccess` (or, at minimum, full permissions on `s3`, `cloudfront`, `iam`, and `acm`). Project-scoped policies like `PowerUserAccess` won't work — Terraform creates an OIDC provider and IAM role here, and those require IAM-management permissions. The IAM user can't grant itself permissions, so attach `AdministratorAccess` from the **root account** in the AWS Console (IAM → Users → your-user → Add permissions → Attach policies directly).

#### 1. Create the Terraform state bucket

```bash
aws s3api create-bucket \
  --bucket terraform-states-936146782254-ap-southeast-1 \
  --region ap-southeast-1 \
  --create-bucket-configuration LocationConstraint=ap-southeast-1 \
  --profile reservation-stage

aws s3api put-bucket-versioning \
  --bucket terraform-states-936146782254-ap-southeast-1 \
  --versioning-configuration Status=Enabled \
  --profile reservation-stage
```

#### 2. Apply the staging infra

```bash
cd aws/accounts/stage/ap-southeast-1/frontend_hosting
terragrunt apply
```

Save these outputs — you'll need them:
- `github_oidc_provider_arn`
- `github_deploy_role_arn`
- `bucket_name`
- `cloudfront_distribution_id`
- `cloudfront_domain_name`

#### 3. Apply the prod infra

Paste the stage `github_oidc_provider_arn` into [aws/accounts/prod/ap-southeast-1/frontend_hosting/terragrunt.hcl](aws/accounts/prod/ap-southeast-1/frontend_hosting/terragrunt.hcl) (replacing `PASTE_OIDC_PROVIDER_ARN_FROM_STAGE_OUTPUTS`), then:

```bash
cd aws/accounts/prod/ap-southeast-1/frontend_hosting
terragrunt apply
```

(AWS only allows one OIDC provider per account per issuer — stage creates it, prod reuses it.)

#### 4. Configure GitHub Environments

In **Settings → Environments**, create two environments. **Names must be exactly `staging` and `prod`** (lowercase) — these strings are hardcoded in [.github/workflows/frontend-deploy.yml](.github/workflows/frontend-deploy.yml) under `environment:`. A typo here makes the deploy fail at "Set up job: Environment 'X' does not exist".

For each, add these **Variables** (Variables tab, not Secrets — none of these are sensitive):

| Variable | staging | prod |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | stage `github_deploy_role_arn` | prod `github_deploy_role_arn` |
| `AWS_S3_BUCKET` | `s3-reservation-stage-frontend` | `s3-reservation-prod-frontend` |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | stage `cloudfront_distribution_id` | prod `cloudfront_distribution_id` |
| `NEXT_PUBLIC_API_URL` | backend URL (leave blank until deployed) | backend URL (leave blank until deployed) |

Optional but recommended for `prod`: turn on **Required reviewers** to gate prod deploys behind a manual approval.

#### 5. First deploy

```bash
git push origin staging      # → staging deploys
git push origin main         # → prod deploys
```

Visit the CloudFront URL — site should load. (If `NEXT_PUBLIC_API_URL` is blank, API calls 404, but the SPA itself renders.)

> **If you pushed the workflow file *before* step 4** (configuring the GitHub Environment), the first run will fail at "Configure AWS credentials" because the env vars don't exist yet. That's expected. Finish step 4, then retrigger with:
> ```bash
> git commit --allow-empty -m "Retrigger deploy"
> git push origin staging
> ```

### Day-to-day workflow

```
                      ┌───────────────────────────┐
                      │  open PR against staging  │
                      │  • CI builds & previews   │ (no preview env in v1)
                      └─────────────┬─────────────┘
                                    │ merge
                                    ▼
                      ┌───────────────────────────┐
                      │  push to staging          │
                      │  → workflow: deploy stage │
                      │  → smoke test the stage   │
                      │    CloudFront URL         │
                      └─────────────┬─────────────┘
                                    │ open PR staging → main
                                    │ merge
                                    ▼
                      ┌───────────────────────────┐
                      │  push to main             │
                      │  → workflow: deploy prod  │
                      │  (gated by env reviewers  │
                      │   if you enabled them)    │
                      └───────────────────────────┘
```

Every push that changes anything under `frontend/` triggers the workflow. To skip a deploy (e.g. for a docs-only frontend change), use `[skip ci]` in the commit message.

### Updating `NEXT_PUBLIC_API_URL` (or any env var)

Env vars are baked in at **build time** in static export — they're literally inlined into the JS bundle. To change one:

1. Update the GitHub Environment variable in **Settings → Environments → staging / prod**.
2. Trigger a redeploy: either push an empty commit or run the workflow via `workflow_dispatch`.

```bash
# trigger a no-op redeploy
git commit --allow-empty -m "Redeploy: update NEXT_PUBLIC_API_URL"
git push origin staging
```

If you need a new `NEXT_PUBLIC_*` var, add it to:
1. The GitHub Environment (both staging and prod).
2. The `env:` block of the **Build** step in [.github/workflows/frontend-deploy.yml](.github/workflows/frontend-deploy.yml).

### Dynamic routes under static export

Next.js static export requires every dynamic route (e.g. `[id]`) to declare which params it'll pre-render via `generateStaticParams()`. Because our IDs come from the DB at runtime, we pre-render a placeholder route per dynamic page (`{ id: "_" }`) and rely on CloudFront's 403/404 → `/index.html` fallback to serve real IDs.

The pattern, used on every dynamic-route page:

- `page.tsx` — server component, exports `generateStaticParams()` returning a placeholder, renders a thin client wrapper.
- `_client.tsx` — the actual UI; starts with `"use client"`, default-exports the page component (uses `useParams()` to read the ID from the URL).

Example: [src/app/chat/[roomId]/page.tsx](frontend/src/app/chat/[roomId]/page.tsx) + [src/app/chat/[roomId]/_client.tsx](frontend/src/app/chat/[roomId]/_client.tsx).

**When you add a new dynamic route**, copy that pattern. Don't put `"use client"` directly in `page.tsx` — generateStaticParams can't live in a client component, and the build will fail with `Page "X" is missing "generateStaticParams()"`.

> ⚠️ Next 15.1 quirk: `generateStaticParams` must return *at least one* placeholder. Returning `[]` triggers the same "missing" error even though the function exists. Use `[{ id: "_" }]` (or whatever the segment name is).

### Rollback

S3 versioning is enabled on the frontend buckets, but the simplest rollback is **redeploy a previous commit**:

```bash
# find the SHA you want to roll back to
git log --oneline staging

# force-push that SHA back to staging
git push origin <good-sha>:staging --force-with-lease
```

This re-runs the workflow against the old code, rebuilding and re-syncing. CloudFront invalidates and you're back within ~2 min.

For prod: open a "revert PR" against `main` (`git revert <bad-sha>` → PR → merge). Cleaner audit trail than a force-push.

### Custom domain (later)

Currently shipping on default `*.cloudfront.net`. When you have a domain:

1. Buy/register the domain (Route 53 or external registrar).
2. Request an ACM certificate **in `us-east-1`** (CloudFront only accepts certs from us-east-1).
3. Set `frontend_cloudfront_alias = ["app.yourdomain.com"]` in [aws/accounts/<env>/ap-southeast-1/region.hcl](aws/accounts/stage/ap-southeast-1/region.hcl).
4. Pass the cert ARN into the layer (need to extend [aws/layers/frontend_hosting/main.tf](aws/layers/frontend_hosting/main.tf) to read a `viewer_certificate.acm_certificate_arn` input — currently hardcoded to default cert).
5. `terragrunt apply`.
6. Create a CNAME / Alias record pointing your domain at the CloudFront distribution.

### Cost estimate

Within free tier for a small app:

| Service | Free tier | Beyond free tier |
|---|---|---|
| S3 storage | 5 GB | $0.025/GB-month |
| S3 requests | 20k GET / 2k PUT per month | negligible |
| CloudFront egress | 1 TB/month **always free** | $0.085/GB |
| CloudFront requests | 10M/month **always free** | $0.0075 per 10k |
| CloudFront invalidations | 1,000 paths/month free | $0.005 per path |
| ACM certificate | free (CloudFront only) | — |
| Route 53 hosted zone | not free | $0.50/zone/month |
| GitHub Actions | 2,000 min/month on private | $0.008/min |

Expected monthly: **$0** for the first few thousand users. The biggest risk is invalidation cost if you redeploy 50+ times a day — the workflow uses `--paths /*` which counts as **one path** per invalidation, so this is fine.

### Troubleshooting (bug + fix log)

This section is the running log of issues we've hit during deployment, keyed by symptom for fast lookup. **When you hit a new bug, add an entry here** with the error you saw (verbatim where possible), the root cause, and what fixed it. Future-you and future-me will thank you.

**Workflow fails on "configure-aws-credentials" with `Error: Not authorized to perform sts:AssumeRoleWithWebIdentity`**
The OIDC trust policy's `sub` claim filter didn't match the token GitHub presented. Common causes:
- The job is missing `environment: staging` (or `prod`) in its YAML. Without `environment:`, the token's `sub` claim is `repo:OWNER/REPO:ref:refs/heads/<branch>` — but our trust policy only accepts `repo:OWNER/REPO:environment:<env>`. Add the `environment:` key to the job.
- The GitHub Environment name doesn't match what's in `github_environments` in [region.hcl](aws/accounts/stage/ap-southeast-1/region.hcl) (case-sensitive).
- Repo name in `github_repo` doesn't match the actual repo (also case-sensitive — GitHub URLs are technically case-insensitive but the OIDC token uses the canonical casing).
- The IAM role's trust policy is stale after a Terragrunt change — re-run `terragrunt apply` on the layer.

To debug, decode the token claim from a workflow log: enable `ACTIONS_RUNNER_DEBUG=true` and look for "sub:" in the trace, or compare to the trust policy with:
```bash
aws iam get-role --role-name iam-role-reservation-stage-frontend-deploy \
  --profile reservation-stage \
  --query 'Role.AssumeRolePolicyDocument.Statement[0].Condition.StringLike'
```

**Site loads but API calls return 404 / CORS errors**
`NEXT_PUBLIC_API_URL` is empty or wrong. Update the GitHub Environment variable, push an empty commit to retrigger build.

**Hard refresh on `/shops/123` returns 404 XML from S3**
The SPA fallback rule on CloudFront isn't firing. Check the distribution's "Error pages" tab — should have rules for both 403 and 404 → `/index.html`. Re-apply [aws/layers/frontend_hosting](aws/layers/frontend_hosting/) if missing.

**Stale content after deploy**
CloudFront didn't invalidate, or the browser cached the old HTML. Check the workflow's "Invalidate CloudFront" step. Hard-refresh (Cmd+Shift+R / Ctrl+Shift+R).

**Workflow says "No environment mapping for ref refs/heads/foo"**
You pushed to a branch other than `staging` or `main`. Either rename the branch, or add it to the mapping in [.github/workflows/frontend-deploy.yml](.github/workflows/frontend-deploy.yml) (the `resolve` job). The IAM trust policy keys off the GitHub Environment name, not the branch, so adding a branch only requires the workflow change — no Terraform update needed unless you're adding a new environment too.

**`terragrunt apply` fails with `AccessDenied` on `iam:CreateOpenIDConnectProvider` or `cloudfront:CreateOriginAccessControl`**
Your IAM user is missing IAM/CloudFront management permissions. See the "Prerequisites" note at the top of [First-time setup](#first-time-setup-do-this-once) — attach `AdministratorAccess` from the root account, then re-run apply (Terragrunt is idempotent, it'll resume).

**Workflow fails with `Invalid bucket name "...\n"` or similar in the `aws s3 sync` step**
A GitHub Environment variable has a stray newline or trailing whitespace — copy-pasting a value with a newline into the GitHub UI preserves it. Re-edit the variable (Settings → Environments → staging → Variables → pencil icon) and re-enter without the trailing newline. The workflow strips whitespace defensively (see [.github/workflows/frontend-deploy.yml](.github/workflows/frontend-deploy.yml)), so this only bites if you paste with a newline AND the strip somehow fails.

**`terragrunt apply` fails with `BucketAlreadyExists` on the frontend bucket**
S3 bucket names are **globally unique** across all AWS accounts. Edit `frontend_bucket_name` in [aws/accounts/stage/ap-southeast-1/region.hcl](aws/accounts/stage/ap-southeast-1/region.hcl) (and/or the prod one) — add a suffix like `-936146782254` or your initials. Re-run apply.

**`next build` fails locally with "Page X is missing generateStaticParams"**
The page is either a client component (`"use client"`) — generateStaticParams can't live there — or it returns an empty array (Next 15.1 quirk). See [Dynamic routes under static export](#dynamic-routes-under-static-export) for the page/`_client.tsx` split pattern.

**`next build` fails in CI with `Cannot find module '.../node_modules/next/constants' ... Did you mean to import "next/constants.js"?`**
Importing `next/constants` from `next.config.mjs` works locally (CommonJS resolution) but fails under stricter ESM resolution in the CI Node runtime. Fix: don't import it — inline the constant string. We need `phase === "phase-development-server"` to skip `output: "export"` in `next dev` so dynamic routes still work locally; that string is stable, so [frontend/next.config.mjs](frontend/next.config.mjs) compares to it directly instead of importing `PHASE_DEVELOPMENT_SERVER`.

**`next dev` fails locally with "Page X is missing generateStaticParams" when visiting a real ID like `/shops/1`**
You set `output: "export"` unconditionally and `next dev` is now rejecting any non-placeholder ID. Fix: make the `output: export` setting conditional on the build phase so dev mode keeps server-rendering — see [frontend/next.config.mjs](frontend/next.config.mjs) (it checks `phase === "phase-development-server"`).

---

## Deferred to later phases

Intentionally not in v1 (see [app_ideas.md §7](app_ideas.md)):

- Deposits / partial payment (full-amount checkout only)
- Customer-initiated refund flow (currently shop-owner-only)
- Assigning services to specific staff via UI (model + M2M exist; admin only)
- SMS reminders (Twilio)
- Native mobile app (React Native sharing the API)
- Multi-language / multi-currency (PayMongo is PHP-only anyway)
- PostGIS geospatial migration (current Haversine + bounding box is fine for v1 scale)
- 2FA, social login (Google)
- Marking commission entries as settled from the admin UI (data is in `CommissionLedger.settled_at` — admin can flip via Django admin)

---

## Notes

- Timestamps are stored UTC; render in user local time on the client.
- Locations use lat/lng + Haversine in v1.
- Commission is recorded but not collected automatically — the platform settles with shops off-platform monthly.
