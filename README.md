# Reservation App

A reservation platform where shop owners (haircuts, spas, car washes, repairs, etc.) list services and customers book time slots. Pay-on-arrival or PayMongo (GCash / GrabPay / Maya / cards). Commission-based monetization. See [app_ideas.md](app_ideas.md) for the full spec.

## Stack

- **Backend:** Django 5 · DRF · Channels · Celery + Celery Beat · Redis · PostgreSQL
- **Frontend:** Next.js 15 (App Router) · Tailwind · TanStack Query · Zustand
- **Payments:** PayMongo (PHP) · pay-on-arrival fallback
- **Infra:** Docker Compose

---

## Quick start

Prereqs: Docker Desktop installed and running; Node 20+ for the frontend.

```bash
# Backend stack (db, redis, web, worker, beat)
docker compose up --build

# Frontend — runs on the host, not in Docker
cd frontend && npm install && npm run dev
```

`backend/.env` ships with dev defaults (copy from `backend/.env.example` for fresh installs). On `web` startup the container runs `makemigrations → migrate → seed_categories → seed_psgc → runserver`. The frontend dev server expects the API at `http://localhost:8000` (override with `NEXT_PUBLIC_API_URL`).

Create a superuser:

```bash
docker compose exec web python manage.py createsuperuser
```

### Where things live

| Service     | URL                                                     | Notes                                   |
|-------------|---------------------------------------------------------|-----------------------------------------|
| Frontend    | http://localhost:3000                                   | Next.js — run on the host (`npm run dev`), not in compose |
| API         | http://localhost:8000/api/                              | DRF                                     |
| API docs    | http://localhost:8000/api/docs/                         | Swagger UI (`drf-spectacular`)          |
| Django admin| http://localhost:8000/admin/                            | Django admin                            |
| Health      | http://localhost:8000/health/                           | `{"status": "ok"}` for orchestrator     |
| WebSocket   | ws://localhost:8000/ws/notifications/?token=&lt;jwt&gt; | Real-time notifications                 |
| Postgres    | localhost:5432                                          | user/pw: `postgres`/`postgres`          |
| Redis       | localhost:6379                                          | broker + channel layer + cache          |

### Deployed environments (AWS, ap-southeast-1)

| Service  | Staging URL | Status |
|----------|-------------|--------|
| Frontend | https://dx1epgde94eqq.cloudfront.net | Public — CloudFront fronts the `s3-reservation-stage-frontend` bucket; populated by [.github/workflows/frontend-deploy.yml](.github/workflows/frontend-deploy.yml) |
| Backend (HTTP) | https://dx1epgde94eqq.cloudfront.net/api/ | Public via CloudFront `/api/*` behavior → CloudFront VPC Origin → internal ALB → ECS. The ALB stays private. |
| Backend (WebSocket) | wss://dx1epgde94eqq.cloudfront.net/ws/ | Same path via the `/ws/*` behavior; Channels notifications work. |
| Backend ALB (private) | `internal-lb-reservation-stage-internal-1637615331.ap-southeast-1.elb.amazonaws.com` | Internal-only, not reachable from outside the VPC. Wired up by the [ecs layer](aws/layers/ecs/). |

**Routing architecture:**

```
Browser ──HTTPS──▶  CloudFront (dx1epgde94eqq.cloudfront.net)
                        │
                        ├─ default behavior ─▶ S3 (static Next.js export)
                        ├─ /api/*           ─▶ VPC Origin ─▶ internal ALB ─▶ ECS Django
                        └─ /ws/*            ─▶ VPC Origin ─▶ internal ALB ─▶ ECS Channels
```

Single origin (`dx1epgde94eqq.cloudfront.net`) → no CORS, single HTTPS surface, backend ALB never gets a public IP. Set up in [aws/layers/frontend_hosting/main.tf](aws/layers/frontend_hosting/main.tf) via `aws_cloudfront_vpc_origin` (AWS provider ≥ 5.74).

**Frontend API base is same-origin and relative.** Leave `NEXT_PUBLIC_API_URL` **unset** for deployed builds: [frontend/src/lib/api.ts](frontend/src/lib/api.ts) then uses a relative `/api` base (and [frontend/src/lib/ws.ts](frontend/src/lib/ws.ts) derives `wss://<current-host>/ws`), so the app works on **any** domain it's served from — `staging.bookme.ph`, the raw `*.cloudfront.net` URL, future prod `bookme.ph` — with no CORS and no per-domain rebuild. Only set the var for **local dev** (`frontend/.env.local` → `http://localhost:8000`) or a deliberate split-origin setup; when set it's the origin only (no `/api` suffix — that's appended internally).

Find your own URLs anytime with:

```bash
AWS_PROFILE=reservation-stage aws cloudfront list-distributions --query "DistributionList.Items[*].[Id,DomainName]" --output table
AWS_PROFILE=reservation-stage aws elbv2 describe-load-balancers --region ap-southeast-1 --query "LoadBalancers[*].[LoadBalancerName,DNSName,Scheme]" --output table
```

---

## Docker services

`docker-compose.yml` defines 5 backend containers with hot-reload mounts. The frontend is **not** containerized — run it on the host with `cd frontend && npm run dev` (this matches prod, where the frontend is a static export to S3/CloudFront).

| Container | Image / Build       | Purpose                                            |
|-----------|---------------------|----------------------------------------------------|
| `db`      | `postgres:16-alpine`| Primary database                                   |
| `redis`   | `redis:7-alpine`    | Celery broker + Channels layer + caching           |
| `web`     | `./backend`         | Django + DRF + Channels (Daphne via runserver)     |
| `worker`  | `./backend`         | Celery worker — emails, reminders, no-show sweeps  |
| `beat`    | `./backend`         | Celery Beat scheduler                              |

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
    locations/           # PSGC master data (region/province/city/barangay) + read-only cascading API
    support/             # Ticket, TicketMessage, TicketAttachment, TicketEvent audit log; per-user rate limits; multipart file upload
  templates/emails/      # booking_confirmation/_confirmed/_completed, booking_reminder, verify_email, password_reset, ticket_created_*/ticket_replied/ticket_status_changed (txt+html)
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
| `DJANGO_TIME_ZONE` | `Asia/Manila` | Operating region for shop hours / slot generation. Storage stays UTC; this only affects how naive local times are interpreted and rendered. |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_HOST` / `POSTGRES_PORT` | postgres / postgres / postgres / db / 5432 | DB connection |
| `REDIS_URL` | `redis://redis:6379/0` | Channels layer |
| `CELERY_BROKER_URL` | `redis://redis:6379/1` | Celery broker |
| `CELERY_RESULT_BACKEND` | `redis://redis:6379/2` | Celery results |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated origins |
| `DRF_NUM_PROXIES` | (unset) | Trusted proxy count in front of the app, for IP-based rate limiting on `login`/`register`/`password/reset`. Behind CloudFront→ALB→ECS set this so the throttle keys on the real client IP from `X-Forwarded-For` instead of the proxy's; unset lets DRF use the first XFF entry. |
| `FRONTEND_URL` | `http://localhost:3000` | Used to build absolute links inside emails |
| `LOCATIONS_RESTRICT_TO_ILIGAN` | `True` | Pilot guardrail. When on, `/api/locations/*` only returns Iligan City (Lanao Del Norte, Region X) and the shop forms restrict country to Philippines. Flip to `False` to open the platform up. |
| `DEFAULT_COMMISSION_RATE` | `0.15` | Platform fallback rate; override per-shop with `Shop.commission_rate` (e.g. `0` for an intro period) |
| `DEFAULT_CANCELLATION_WINDOW_HOURS` | `24` | Hours-before-start cutoff for free cancel |
| `STRIKE_LIMIT` | `3` | Strikes-in-window before customer is restricted |
| `STRIKE_WINDOW_DAYS` | `90` | Rolling window for strikes |
| `COMMISSION_INVOICE_DUE_DAYS` | `7` | Days from monthly invoice issue until it's due |
| `COMMISSION_INVOICE_GRACE_DAYS` | `7` | Grace after due date; then the shop's new bookings auto-pause until paid |
| `EMAIL_BACKEND` | `console` | Sender backend. Three prod recipes (mutually exclusive) in `backend/.env.example`: Gmail/SES SMTP (`…smtp.EmailBackend`) or Resend (`anymail.backends.resend.EmailBackend`) |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` / `EMAIL_USE_TLS` | — | SMTP config (Gmail/SES recipes only; unused with Resend) |
| `RESEND_API_KEY` | "" | Resend API key — only read when `EMAIL_BACKEND` is the Resend backend |
| `RESEND_SIGNING_SECRET` | "" | Svix signing secret for the Resend bounce/complaint webhook (`/api/email/webhooks/resend/tracking/`) |
| `DEFAULT_FROM_EMAIL` | `Reserva <noreply@reserva.local>` | "From:" header |
| `PAYMONGO_SECRET_KEY` | "" | PayMongo secret (sk_test_… or sk_live_…). Empty enables dev-fake mode. |
| `PAYMONGO_PUBLIC_KEY` | "" | PayMongo publishable key |
| `PAYMONGO_WEBHOOK_SECRET` | "" | HMAC secret PayMongo uses to sign webhooks |
| `AWS_STORAGE_BUCKET_NAME` | **required** | S3 bucket for media (avatars, shop/service photos, chat attachments). The app refuses to start without it — there is no local-filesystem fallback. For local dev, point at the staging bucket. |
| `AWS_S3_REGION_NAME` | falls back to `AWS_REGION`, then `ap-southeast-1` | Override only when the bucket lives in a different region than the task. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | — | Only needed for **local dev** — these flow into boto3 so docker can sign presigned URLs + put objects. In AWS, credentials come from the ECS task role; leave these unset there. |

---

## API endpoints

All routes are prefixed `/api/` unless noted. JWT required except where marked **public**.

### Auth (`/api/auth/`)
- **public** `POST register/` — create account. Requires `email` + `confirm_email` (must match) and `password` + `confirm_password` (must match). Password must be ≥8 chars with an uppercase, lowercase, number, and special character. `username` is not collected — it mirrors the email server-side. On success a User is created, a 6-digit OTP is emailed, and the client is expected to call `verify-otp/` next.
- **public** `POST login/` — JWT pair
- **public** `POST refresh/` — refresh JWT
- `GET / PATCH me/` — current user
- **public** `POST request-otp/` `{email}` — issue a fresh signup OTP (always 200 to avoid leaking which emails are registered; 429 if rate-limited)
- **public** `POST verify-otp/` `{email, code}` — verify 6-digit OTP; on success returns `{access, refresh}` JWT pair and marks `email_verified_at`
- **public** `POST verify-email/` `{token}` — legacy link-based confirm (kept for backwards compatibility)
- `POST resend-verification/` — legacy: re-send link-based verification email
- **public** `POST password/reset/` `{email}` — request reset (always 200, no enum)
- **public** `POST password/reset/confirm/` `{token, new_password}` — apply reset

### Shops (`/api/shops/`)
- **public** `GET /` — list active shops (paginated 12/page, `page_size` overridable up to 48; search, filter by `city`/`category`, `?min_rating=4` (drops shops below that avg rating, NULL ratings dropped), `?booking_date=YYYY-MM-DD` (keeps only shops with at least one bookable slot that day — uses a SQL "open-that-day" pre-filter, then a per-shop `compute_slots` check; past dates return empty), `?booking_time=HH:MM` (only meaningful alongside `booking_date`; narrows matches to shops with a slot starting within ±30 min of the requested time), `?guests=N` (1–50; only meaningful alongside `booking_date`; drops shops whose services all cap `max_quantity` below N), ordering by `created_at`/`name`/`avg_rating`/`reviews_count` — e.g. `?ordering=-avg_rating`). Each row carries `services_count`, `reviews_count`, `avg_rating` (rounded to 1 decimal, null when unrated) and `is_open_now` (computed against `WeekdayHours` + today's `HoursOverride` in `settings.TIME_ZONE`) so cards can render rating/services chips and an Open/Closed pill in one request.
- **public** `GET /<id>/` — shop detail (photos, weekday hours)
- **public** `GET nearby/?lat&lng&radius_km` — Haversine search
- **public** `GET cities/` — distinct A-Z list of active-shop cities for the browse-page filter dropdown (plain `["City A", "City B", ...]`, unpaginated)
- **public** `GET categories/` — shop categories
- `GET mine/` — owner's shops (paginated 12/page, `page_size` overridable up to 48)
- `GET commission-invoices/?status=` — owner's monthly commission invoices across all their shops
- `POST /` — create shop (auto-geocoded if lat/lng blank)
- `PATCH /<id>/` — edit shop
- `POST /<id>/publish/` · `POST /<id>/pause/` — toggle status
- `GET / PUT /<id>/hours/` — weekly hours
- `GET / POST /<id>/overrides/` · `DELETE /<id>/overrides/<override_id>/` — date overrides
- `GET / POST /<id>/photos/` (multipart) · `DELETE /<id>/photos/<photo_id>/` — shop photos
- `GET /<id>/analytics/?days=30` — owner-only analytics
- `GET /<id>/stations-availability/?date=YYYY-MM-DD` (owner-only) — real-time per-station availability dashboard for a single day. Returns `shop` (resource label, open/close, `is_closed`), `summary` (total/available/busy/upcoming counts), and `stations[]` (each with `current_status` `available`/`busy`/`blocked`/`offline`/`closed`, `busy_until`, `next_available_at`, a non-overlapping `segments[]` timeline of `available`/`reserved`/`blocked` covering `[open, close)`, and the raw `bookings[]` + `blocks[]` payloads). Inactive stations are returned (`current_status="offline"`) but excluded from summary counts. Default `date` is today. Reservations win over time blocks where they overlap.
- Staff sub-resource: `GET /staff/?shop=<id>`, `POST/PATCH/DELETE /staff/<id>/`, `GET / PUT /staff/<id>/hours/`
- Resources (bookable stations — the shop's capacity): `GET /resources/?shop=<id>` (public sees active only; owner sees all), `POST/PATCH/DELETE /resources/<id>/` (owner). DELETE soft-retires (`is_active=False`) if the resource has bookings, else hard-deletes. Per-shop display word is `Shop.resource_label` (Bay/Chair/Room/Slot; default "Station"), editable via `PATCH /shops/<id>/`.
- Time blocks (manually carved-off capacity — breaks, maintenance, vacations): `GET/POST/PATCH/DELETE /time-blocks/` (owner-only). Filter list with `?shop=<id>`, `?resource=<id>`, `?from=YYYY-MM-DD`, `?to=YYYY-MM-DD` (inclusive on `start_at__date`). Payload: `{shop, resource?, staff?, start_at, end_at, reason?}`. With `resource` set, blocks just that station; with both unset, blocks the whole shop; with only `staff` set, the block is informational and does NOT remove availability.
- Favorites: `GET / POST /favorites/`, `DELETE /favorites/<id>/` (customer-only)

### Services (`/api/services/`)
- **public** `GET /` (filter `shop`, `category`, `is_active`)
- **public** `GET /<id>/`
- **public** `GET discover/?q&city&category` — cross-shop search with shop info embedded (paginated 12/page, `page_size` overridable up to 50)
- **public** `GET categories/` — service categories
- `POST /` · `PATCH /<id>/` · `DELETE /<id>/` — create/update/delete (owner-only). A `PATCH` that changes `price` is routed through the service layer and appends a `ServicePriceHistory` row; existing bookings are unaffected (each reservation freezes its own `unit_price`)
- `GET <id>/price-history/` — price-change audit trail (old/new/changed_by/created_at). Owner may view their **own** services; admin may view any
- **public** `GET <id>/photos/` — list a service's gallery
- `POST <id>/photos/` (multipart, owner-only) — upload a gallery photo (first upload becomes primary)
- `DELETE <id>/photos/<photo_id>/` (owner-only) — remove a photo (next photo is auto-promoted if the deleted one was primary)
- `POST <id>/photos/<photo_id>/primary/` (owner-only) — set a photo as the service's cover image

### Reservations (`/api/reservations/`)
- **public** `GET availability/?shop&service&staff&date&quantity` — open slots (15-min granularity). With `staff`: that staff's availability. Without `staff` ("Any available"): the **union** across all eligible active staff (a slot shows if ≥1 can take it); shops with no staff fall back to shop-level slots. `quantity` (optional, default 1) scales each slot's length by `duration_minutes × quantity + inter_unit_buffer_minutes × (quantity − 1)` (end-of-job buffer added once to the block window only); `quantity > service.max_quantity` → 400.
- `GET /` — own reservations (customer) or shop's reservations (owner)
- `GET /<id>/`
- `POST book/` `{shop, service, staff?, start_at, quantity?, customer_notes?, payment_method}` — customer booking
- `POST walk-in/` `{shop, service, staff?, start_at, quantity?, customer_id? OR guest_name+guest_phone}` — owner walk-in
- `POST <id>/confirm/` · `complete/` · `no-show/` · `cancel/` · `reschedule/` `{start_at, quantity?}`

**Sequential quantity** (per-service opt-in): a `Service` offers a quantity selector only when `max_quantity > 1`. `quantity` (optional, default 1) multiplies `price` linearly and sets the visible appointment duration to `duration_minutes × quantity + inter_unit_buffer_minutes × (quantity − 1)`; the booking stays one staff / one contiguous block; the end-of-job `buffer_minutes` is added **once** to the conflict/block window only (never to `end_at`), not per unit. `inter_unit_buffer_minutes` (`Service`, PositiveInteger, default 0, owner-editable via `ServiceSerializer`) is the per-unit gap to move/reset between units of a multi-unit job (e.g. travel between aircon units) — applied for the N−1 gaps between units, never after the last unit and **never for a single-unit booking** (at N=1 the gap term is 0, so existing services and all 1-unit bookings are unchanged). The gap adds time but **no cost**: `total_price = unit_price × quantity`, so commission (derived from `total_price`) is unaffected by the gap. The duration formula lives in one place: `apps/reservations/availability.py::effective_duration_minutes`. `quantity < 1` or `> service.max_quantity` returns **400** with `{"non_field_errors": ["Quantity exceeds the maximum of N for this service."]}` (booking/availability serializers) or a string detail from the service layer. `Reservation.quantity` is read-only on the detail serializer; reschedule preserves the existing quantity unless a new one is passed. `unit_label` (default `"unit"`) is the noun shown next to the count.

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
- Shop-owner only: `GET / POST / PATCH / DELETE maintenance-reminders/` — manage recurring email reminders for past customers (e.g. aircon cleaning every 6 months). Create payload: `{shop, customer_email, service?, title, message?, interval_months, next_due_at}`. The hourly Beat task `dispatch_due_maintenance_reminders` sends due reminders by email + in-app notification and rolls `next_due_at` forward.

### Payments (`/api/payments/`)
- `POST reservations/<id>/checkout/` — customer; returns `{checkout_url, session_id, status}`
- `POST reservations/<id>/refund/` — shop owner; full refund
- `POST reservations/<id>/dev-confirm/` — dev-only (when `PAYMONGO_SECRET_KEY` is empty); marks paid without going through PayMongo
- `POST commission-invoices/<id>/pay/` — shop owner (own shop); returns `{payment_url}` for a monthly commission invoice
- `POST commission-invoices/<id>/confirm-dev/` — dev-only; simulates payment of a commission invoice (owner-of-shop or admin)
- **public** `POST webhooks/paymongo/` — verifies HMAC SHA-256 signature, fans out `paid`/`failed`; a `paid` event whose session matches a `CommissionInvoice` marks that invoice paid

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

### Locations (`/api/locations/`) — public, read-only
PSGC (Philippine Standard Geographic Code) master data for cascading address dropdowns. All endpoints are `AllowAny`, unpaginated (full filtered list), ordered by name.
- **public** `GET provinces/` — every province: `{code, name, type, region_code, region_name, island_group}` (`type` is `province`/`district`/`independent-city`)
- **public** `GET cities/?province=<code>` — cities/municipalities of that province: `{code, name, type, is_capital, province_code}`. `province` is **required** → 400 if missing
- **public** `GET barangays/?city=<code>` — barangays of that city: `{code, name, city_code}`. `city` is **required** → 400 if missing

Seeded once at `web` startup (`seed_psgc`, idempotent) from `apps/locations/data/psgc_hierarchy.json`: 17 regions, 87 provinces, 1648 cities/municipalities, 42046 barangays. `Shop` carries denormalized `province_code`/`city_code`/`barangay_code` alongside the existing human-readable name fields.

**Pilot restriction (default on).** While `LOCATIONS_RESTRICT_TO_ILIGAN=True` all three endpoints are scoped to Iligan City — `provinces/` returns Lanao Del Norte only, `cities/?province=<anything>` returns Iligan City only, and `barangays/?city=<anything>` returns Iligan's barangays only. The shop new/edit forms also lock the country dropdown to Philippines. Constants live in [apps/locations/constants.py](backend/apps/locations/constants.py); flip the env var to `False` to open the API to the full PSGC dataset and the shop forms to all supported countries.

The shop create ([my-shops/new/page.tsx](frontend/src/app/my-shops/new/page.tsx)) and edit ([my-shops/[id]/edit/_client.tsx](frontend/src/app/my-shops/[id]/edit/_client.tsx)) forms consume these endpoints via the shared [LocationFields.tsx](frontend/src/components/LocationFields.tsx) component as cascading dropdowns (province → city → barangay) **only when Country = Philippines**; other countries fall back to free-text inputs. Each level persists both the PSGC `code` and the display `name`. Lists are cached client-side with TanStack Query (`staleTime: Infinity` — PSGC is static). The source dataset and the build script that produced `psgc_hierarchy.json` live in [data/psgc/](data/psgc/).

### Admin panel (`/api/admin-panel/`) — admin only
- `GET overview/` — shop counts, reservation counts, commission totals
- `GET pending-shops/` — shops awaiting approval
- `POST shops/<id>/approve/` — flip to `active`
- `GET commission/?period=YYYY-MM` — ledger rows + per-shop summary
- `GET commission/invoices/?status=&shop=&period=` — monthly commission invoices (with `shop_name`, `outstanding`)
- `POST commission/invoices/generate/` — generate/refresh invoices; body optional `{period: "YYYY-MM"}` (default: previous month)
- `POST commission/invoices/<id>/settle/` — mark paid offline (bank/GCash)
- `POST commission/invoices/<id>/void/` — void an open invoice

### Support (`/api/support/`)
Customer/owner-submitted feedback & issue tickets with an audit log. Non-admin querysets are scoped to the requester — non-participants get `404` (never `403`) to prevent enumeration. Admin-only `is_internal=True` messages are filtered at the queryset level. Per-user throttles: `support_ticket_create=10/hour`, `support_message_create=30/hour` (429 with `Retry-After`).
- `GET tickets/` — list. Non-admin: own tickets only. Admin: all + filters `?status=&category=&priority=&q=&assigned_to=me|unassigned|<id>`
- `POST tickets/` — create `{category, subject, body, related_reservation?, related_shop?}`. `related_reservation` ownership is validated to prevent enumeration
- `GET tickets/<id>/` — detail. `messages` is always an array; `events` is `null` for non-admin / populated array for admin (use directly to gate the audit sidebar UI)
- `PATCH tickets/<id>/` — admin: `status`/`priority`/`assigned_to`. Submitter: `subject`/`body` only while `status="open"`
- `GET tickets/<id>/messages/` — list thread (non-admin gets internal-filtered)
- `POST tickets/<id>/messages/` — reply. `multipart/form-data`: `body` (required), `is_internal` (admin only), `attachments` 0–5 files. Per-file: 5 MB max, MIME in `{image/png, image/jpeg, image/webp, application/pdf}`. Stored filename is `tickets/<yyyy>/<mm>/<uuid><ext>` (original name never trusted on disk)
- `POST tickets/<id>/transition/` — admin only. `{new_status}` — validated against `STATUS_TRANSITIONS` map
- `POST tickets/<id>/assign/` — admin only. `{assignee_id: <admin id|null>}`. Non-admin assignees rejected

Enums: `category` = `bug|payment|booking|shop|account|feature|other`; `status` = `open|in_progress|awaiting_customer|resolved|closed`; `priority` = `low|normal|high|urgent`. Emails (queued via Celery): `ticket_created_customer`, `ticket_created_admin`, `ticket_replied`, `ticket_status_changed`. A customer reply on `awaiting_customer` auto-transitions to `in_progress` (audited).

### WebSocket
- `ws://.../ws/notifications/?token=<jwt>` — auto-joins `user.<id>` group, plus `shop.<id>` for each owned shop. Server pushes `{kind, title, body, payload}` events. Kinds: `booking.*`, `reminder`, `chat.new_message`, `chat.typing`, `presence.update`. Connecting/disconnecting this socket is also what flips a user's online flag (Redis-backed presence with a short reconnect grace period); presence changes fan out to every chat peer.
- `ws://.../ws/chat/rooms/<id>/?token=<jwt>` — joins `chat.room.<id>`. Server pushes `chat.message`, `chat.message_edited`, `chat.read_state`, and `chat.typing` events for that room. Client can send `{"type": "typing", "is_typing": true|false}` upstream; the server re-broadcasts to the room group and to the other party's `user.<id>` group (so the chat sidebar can react without an open room socket).

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
| `/verify-email?token=…` | Email verification (legacy link-based) |
| `/verify-otp?email=…` | 6-digit OTP verification (post-signup) |
| `/shops` | Shop browse — unified pill search bar (shop name + when (date + time) + city + guests + Search button), expandable "More filters" panel (category chips + minimum rating), sort dropdown, grid/list view toggle, "Find shops near me", richer cards (cover, Open/Closed pill, categories, ★ rating + reviews count, services count). The `booking_date` filter only returns shops with at least one free slot on the chosen day; adding `booking_time` narrows to ±30 min of that time, and `guests` drops shops whose services can't accept the party size. All filter/view state is in the URL ([page.tsx](frontend/src/app/shops/page.tsx) · [ShopCard.tsx](frontend/src/components/ShopCard.tsx) · [ShopListRow.tsx](frontend/src/components/ShopListRow.tsx)). |
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
| `/support` | My tickets (list, status pills, last-activity) |
| `/support/new` | Open a new ticket (category, subject, body) — 429 surfaced with friendly retry copy |
| `/support/[id]` | Ticket thread + reply (file upload up to 5 × 5 MB; reply form hidden when ticket is `closed`) |

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
| `/dashboard/shops/[id]/reminders` | Maintenance reminders — schedule recurring email nudges to past customers |
| `/dashboard/shops/[id]/walk-in` | Manual walk-in booking |
| `/dashboard/shops/[id]/services/new` | Create service |
| `/dashboard/shops/[id]/services/[serviceId]/edit` | Edit service + upload photo |

### Admin
| Path | Page |
|------|------|
| `/admin` | Platform overview |
| `/admin/pending-shops` | Approve queued shops |
| `/admin/commission` | Commission ledger + monthly invoices (generate / settle offline / void) |
| `/admin/tickets` | Support queue (filters: status/category/priority/assignee + free-text). Top-nav badge shows open + assigned-to-me ∪ open + unassigned |
| `/admin/tickets/[id]` | Manage ticket — transition status (only allowed transitions shown), change priority, assign to me / unassign, internal-note reply, events sidebar (audit log), close-ticket confirmation |
| `/owner/billing` | Shop owner's monthly commission invoices (pay online / dev-confirm; overdue + auto-pause banner) |

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
- `WeekdayHours`, `HoursOverride`, `ShopPhoto`, `Staff`, `StaffWorkingHours`, `TimeBlock`, `Resource`
- **`Resource`** is the bookable capacity unit (bay/chair/room/table/slot). The number of active Resources at a shop = its parallel capacity; a reservation holds exactly one Resource and is the binding scheduling constraint. `Staff` is non-binding (an attribution / "request this person" note). See §8.17 in app_ideas.md.
- Service fields: name, description, duration_minutes, buffer_minutes, price, eligible_staff
- Price changes: editing `Service.price` is recorded in `ServicePriceHistory` (old/new/changed_by/created_at) via `apps/services/services.py::update_service` (service layer, not a signal). Prices freeze on already-booked reservations because each `Reservation` snapshots `unit_price` at booking; `total_price` is always derived from the stored `unit_price`, never re-read from `Service.price` (keeps commission/revenue historically correct). View history at `GET /api/services/<id>/price-history/`.
- Service photos: multi-image gallery via `ServicePhoto` (`POST/DELETE /api/services/<id>/photos/`, `POST /api/services/<id>/photos/<photo_id>/primary/` to pick the cover). At most one photo per service is primary (partial unique constraint); first upload is auto-primary, and deleting the primary auto-promotes the next photo by `sort_order`. The `cover_photo` field on the service serializer always returns the primary (or first by `sort_order` as fallback).
- Publish / pause flows

### Discovery
- `GET /api/shops/` — search + filter
- `GET /api/shops/nearby/` — bounding-box pre-filter + Haversine distance, sorted by distance (no PostGIS)
- `GET /api/services/discover/` — cross-shop search returning shop name + city embedded
- `GET /api/services/?shop=<id>` — paginated services for a shop. Supports `?search=` (matches `name`/`description`), `?ordering=` (`name`, `-name`, `price`, `-price`, `duration_minutes`, `created_at`), and `?page_size=` (default 12, max 50). Public callers see active services only; the shop's owner also sees inactive rows so they can manage them.
- Frontend "Find shops near me" via browser Geolocation API; falls back to plain list on denial

### Booking & availability
- **Resource-based scheduling.** A booking reserves one `Resource` (the binding unit). Capacity = number of active Resources; two bookings can never share a Resource at overlapping times. `Staff` is recorded but non-binding — the same staff may appear on overlapping bookings and the engine ignores it. See app_ideas.md §8.17.
- [availability.py](backend/apps/reservations/availability.py): shop hours ∩ per-Resource reservations ∩ time blocks ∩ overrides; 15-min granularity; never returns past slots. `compute_slots_any` offers a time if **any** active Resource is free for the full duration + buffer.
- On booking, the server allocates a free Resource inside the `@transaction.atomic` block with `select_for_update` over the shop's Resources (serialises concurrent bookers so a slot can't be double-allocated). If every Resource is busy → slot-conflict error.
- Customer booking + shop-owner walk-in (with guest_name/phone). Staff selection is optional and non-binding ("No preference" by default; a requested staff is surfaced to the shop, not a guarantee). Walk-in may pin a specific Resource or auto-assign.
- A `TimeBlock` with a `resource` set blocks just that Resource; with neither resource nor staff it's shop-wide; a staff-only block is informational (non-binding).
- Reschedule re-allocates a Resource atomically (keeps the current one if still free, else any free one).
- Migration `reservations/0007` backfills existing shops: each gets `max(1, active_staff)` Resources and every existing reservation is greedily assigned a non-conflicting one.

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

### Commission invoicing & collection
- **Flat 15%, one invoice per shop per month.** A `CommissionInvoice` (shop, `period` `YYYY-MM`, amount, status `open`/`paid`/`void`, `due_date`, `paid_at`, `settled_offline`) rolls up that month's unsettled `CommissionLedger` rows.
- `generate-monthly-commission-invoices` Beat task (crontab: 1st of month, 02:00 UTC) bills the previous calendar month. Idempotent — re-running refreshes an open invoice's amount and never touches a `paid`/`void` one. Admins can also trigger it from the admin UI.
- Shop owner pays via a PayMongo link (`POST /api/payments/commission-invoices/<id>/pay/` → checkout URL; the webhook stamps `settled_at` on that period's ledger rows on `paid`). Admin can instead mark it settled offline (bank/GCash) — same ledger effect.
- `process-overdue-commission-invoices` Beat task (daily, 03:00 UTC) sends escalating reminders; `COMMISSION_INVOICE_GRACE_DAYS` after `due_date` the shop is auto-paused (`Shop.status = PAUSED` + `auto_paused_for_unpaid_commission`) so it drops out of search/booking. Paying (online or offline) auto-resumes only platform-paused shops — a manual owner pause is never clobbered. The owner `publish` action is refused while a blocking invoice is unpaid.
- Owner UI: `/owner/billing`. Admin UI: the Invoices tab on `/admin/commission`.

### Online payments — PayMongo
- Provider: PayMongo (PHP-only; supports GCash / GrabPay / Maya / Visa / Mastercard / JCB). **No Stripe.**
- [Payment](backend/apps/payments/models.py) model (one-to-one with Reservation), provider session id, status, amount, currency, paid_at
- [PayMongo client](backend/apps/payments/paymongo.py) — Checkout Sessions API, HTTP Basic auth, amounts in centavos, refunds, dev-fake mode when `PAYMONGO_SECRET_KEY` is empty
- Customer-side: at booking time, choose **Pay on arrival** (default) or **Pay now (PayMongo)**; "Pay now" creates the booking, then redirects to PayMongo's hosted page. After PayMongo posts a `checkout_session.payment.paid` webhook (HMAC-SHA256 verified), `mark_paid()` flips the Payment to `paid` and auto-confirms the Reservation.
- Shop-owner-side: **Refund** button on any paid reservation issues a full PayMongo refund and cancels the booking
- **Payout model:** PayMongo has no Stripe-Connect equivalent — all customer payments land in the platform's PayMongo account, and the platform settles each shop's earnings (`gross − commission`) off-platform on a regular cadence

### PayMongo setup — what you need to do

**Already done in code:** [PayMongo client](backend/apps/payments/paymongo.py), checkout endpoint, webhook receiver with HMAC-SHA256 verification, refund endpoint, dev-fake fallback when keys are empty, frontend "Pay now" button + redirect handling, success/cancel return pages — all wired and tested ([payments tests](backend/apps/payments/tests/test_payments.py)).

**You need to do (one-time, to enable real payments):**

1. **Sign up.** Create a PayMongo account at https://dashboard.paymongo.com (Philippines business details required for live mode; test mode works without).
2. **Copy API keys.** In the dashboard: **Developers → API Keys** → copy the *test* secret + public keys into `backend/.env`:
   ```
   PAYMONGO_SECRET_KEY=sk_test_...
   PAYMONGO_PUBLIC_KEY=pk_test_...
   ```
3. **Expose your local backend for webhooks.** PayMongo's servers need to POST to your webhook URL. In a separate terminal:
   ```bash
   ngrok http 8000
   ```
   Copy the `https://<random>.ngrok-free.app` URL it prints.
4. **Register the webhook.** In the dashboard: **Developers → Webhooks → Add webhook**:
   - **URL:** `https://<random>.ngrok-free.app/api/payments/webhooks/paymongo/`
   - **Events:** `checkout_session.payment.paid`, `checkout_session.payment.failed`, `payment.paid`, `payment.failed`
   - Copy the **signing secret** PayMongo shows you into `backend/.env` as `PAYMONGO_WEBHOOK_SECRET=...`.
5. **Restart the stack:**
   ```bash
   docker compose restart web worker
   ```
6. **Smoke test.** Make a booking, click *Pay now*, complete the test card flow (`4343 4343 4343 4345`, any future expiry, any CVC). Within a few seconds the reservation flips to `confirmed` and the Payment record to `paid`.
7. **Going live.** When you're ready, swap `sk_test_` / `pk_test_` for `sk_live_` / `pk_live_`, register a *separate* live-mode webhook, and update `PAYMONGO_WEBHOOK_SECRET` to that live webhook's secret.

**If you skip steps 1–5** the system stays in dev-fake mode: the client returns a fake checkout URL and `POST /api/payments/reservations/<id>/dev-confirm/` lets you simulate the webhook to drive the reservation to `confirmed` end-to-end. The frontend handles this transparently.

**Payout reminder.** PayMongo has no Stripe-Connect equivalent. All customer payments land in *your* PayMongo account; you settle each shop's earnings (`gross − commission`) off-platform on a regular cadence. See [app_ideas.md §8](app_ideas.md).

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

**Already done in code:**
- HTML + text templates in [backend/templates/emails/](backend/templates/emails/): `booking_confirmation`, `booking_confirmed`, `booking_completed`, `booking_reminder`, `owner_reminder`, `verify_email`, `password_reset`, `email_otp`, `maintenance_reminder`, `commission_invoice_issued`, `commission_invoice_paid`, `commission_invoice_overdue`
- Single helper: [apps/core/emails.py](backend/apps/core/emails.py) `send_template_email` (multipart MIME, never raises). Provider-agnostic — the active sender is chosen by `EMAIL_BACKEND` (console / SMTP / Resend), so call sites never change when the provider does.
- Delivery-event suppression: when the provider (Resend, via [django-anymail](https://anymail.dev)) reports a hard bounce or spam complaint, Anymail's signed webhook (`/api/email/webhooks/resend/tracking/`) fires its `tracking` signal; [apps/core/email_events.py](backend/apps/core/email_events.py) flags the matching `User.email_bounced`, and `send_template_email` then skips that address. This protects sender reputation by never re-mailing dead/complaining addresses. SES SMTP remains a supported fallback (no webhook events).
- Account flow helpers: [apps/accounts/emails.py](backend/apps/accounts/emails.py) → `send_otp_email`, `send_verification_email`, `send_password_reset_email`
- Celery tasks:
  - `send_booking_confirmation_email` (signal-driven on create — "booking requested")
  - `send_booking_confirmed_email` / `send_booking_completed_email` — customer receipts fired off the `ReservationStatusHistory` signal when the shop owner **confirms** (pending → confirmed) or **completes** (→ completed) an appointment. Skipped for reservations with no customer (walk-ins) and for cancel/no-show transitions
  - `dispatch_due_reminders` — Beat sweep every 10 min: emails **both the customer and the shop owner** a 24h-before and a 1h-before reminder. Idempotent via a `ReservationReminder(reservation, offset)` row; a `REMINDER_LATE_GRACE` (20 min) window means a missed Beat tick is recovered but a same-day booking never gets a stale "24h" reminder. Skips non-pending/confirmed and walk-ins (no customer).
  - `dispatch_due_maintenance_reminders` — hourly Beat sweep
  - `generate_monthly_commission_invoices` — Beat (1st of month, 02:00 UTC): rolls the previous month's unsettled ledger into one `CommissionInvoice` per shop + emails the owner
  - `process_overdue_commission_invoices` — Beat (daily, 03:00 UTC): escalating overdue reminders, then auto-pause after the grace window
- Email OTP signup: [apps/accounts/otp.py](backend/apps/accounts/otp.py) issues a 6-digit code (10-min TTL, 5-attempt cap, 60s resend cooldown). Plaintext code is never persisted — only a hashed form

**Signup → verify flow (already wired):**
1. User submits `/register` form on the frontend (`frontend/src/app/register/page.tsx`).
2. Backend creates the User and issues an OTP (`apps/accounts/views.py:RegisterView`), then emails it via `send_otp_email`.
3. Frontend redirects to `/verify-otp?email=...`; user types the 6-digit code.
4. `POST /api/auth/verify-otp/` validates the code, sets `email_verified_at`, and returns a JWT pair — user is logged in.
5. Resend is rate-limited to once per 60 seconds.

> A legacy *link-based* verification still exists (`POST /api/auth/verify-email/ {token}` + frontend `/verify-email?token=…`) and uses `send_verification_email`. It is wired but not the default path post-signup. Switch by sending the link in `RegisterView.perform_create` instead of the OTP if you prefer a link UX.

**Forgot password flow (already wired):**
1. User opens `/forgot-password`, enters their email.
2. `POST /api/auth/password/reset/` always returns 200 (no account-existence enumeration); on hit, emails a 1-hour signed token link.
3. User clicks the link → `/reset-password?token=…` → enters a new password → `POST /api/auth/password/reset/confirm/ {token, new_password}` applies it.
4. Password tokens carry a fingerprint of the current password hash, so previously-issued tokens are invalidated as soon as the password changes.

### Email setup — what you need to do

**Dev (default):** Nothing. `EMAIL_BACKEND=console` prints every email to `docker compose logs web` so you can copy/paste OTPs and reset links during local testing.

**Production (or you want real inboxes during staging):**

#### Recipe A — Gmail SMTP (fastest, fine for personal/staging)
1. Turn on 2-Step Verification on the Google account: https://myaccount.google.com/security
2. Create an **App password** (16 chars, no spaces): https://myaccount.google.com/apppasswords
3. Replace the Email block in `backend/.env` with:
   ```
   EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_HOST_USER=your-gmail-address@gmail.com
   EMAIL_HOST_PASSWORD=xxxx xxxx xxxx xxxx
   EMAIL_USE_TLS=True
   DEFAULT_FROM_EMAIL=Reserva <your-gmail-address@gmail.com>
   ```
4. `docker compose restart web worker`.
5. Smoke test: register a new account; the OTP email should land within a few seconds. Cap: ~500 sends/day for free Gmail.

#### Recipe B — AWS SES (production)

> **For the deployed stage/prod stack on AWS:** SES is already wired as a Terragrunt layer at [aws/layers/ses/](aws/layers/ses/). It provisions the verified sender, IAM SMTP user, access key, and writes the credentials into SSM at `/reservation/<env>/ses/*` — which the ECS task already reads as `EMAIL_*`. See [aws/README.md § "SES (transactional email) setup"](aws/README.md#ses-transactional-email-setup) for the apply-order checklist. The manual steps below are for **local dev pointing at real SES** (rare — most devs stay on the console backend).

1. **Verify a sender.** SES console → *Verified identities* → add either a single email (quick) or your domain (recommended; add the DKIM CNAMEs to Route 53).
2. **Create SMTP credentials.** SES console → *SMTP settings* → *Create SMTP credentials*. This generates an IAM user with the SES SMTP password (NOT your regular IAM access key — they look similar but they're different).
3. **Request production access.** Until you do, SES can only send to verified addresses. *Account dashboard* → *Request production access* (Amazon usually approves within 24h with a brief use-case description).
4. Replace the Email block in `backend/.env` (substitute the region of your SES setup):
   ```
   EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
   EMAIL_HOST=email-smtp.ap-southeast-1.amazonaws.com
   EMAIL_PORT=587
   EMAIL_HOST_USER=AKIA...                  # SES SMTP username
   EMAIL_HOST_PASSWORD=...                  # SES SMTP password
   EMAIL_USE_TLS=True
   DEFAULT_FROM_EMAIL=Reserva <noreply@yourdomain.com>
   ```
5. `docker compose restart web worker` and smoke test.

**`FRONTEND_URL` must point at the public frontend** (`https://app.example.com` in prod) so the verify/reset links in emails work. It defaults to `http://localhost:3000`.

### Maintenance reminders (shop-set recurring nudges)
- `MaintenanceReminder` model in [apps/notifications/models.py](backend/apps/notifications/models.py): shop owner picks a past customer + service, sets a title (e.g. "Aircon cleaning"), interval months, and first due date
- Hourly Beat task dispatches due reminders via email and an in-app `Notification`; idempotent because `next_due_at` advances after each send
- Shop owner UI: `/dashboard/shops/[id]/reminders` lists + creates + pauses + deletes reminders

### Admin dashboard
- [overview](frontend/src/app/admin/page.tsx): shop counts (total/active/pending/paused), reservation counts, commission totals
- [pending-shops](frontend/src/app/admin/pending-shops/page.tsx): one-click approve
- [commission ledger + invoices](frontend/src/app/admin/commission/page.tsx): Ledger view (per-shop summary + recent entries, `?period=YYYY-MM`) and Invoices view (generate / mark settled offline / void)
- [owner billing](frontend/src/app/owner/billing/page.tsx): shop owner's monthly invoices — pay online, overdue + auto-pause banner
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
- Typing indicator: the open chat room sends `{type: "typing", is_typing: bool}` upstream on every keystroke (debounced, idle-clears after 3s). [chat/consumers.py](backend/apps/chat/consumers.py) fans it out as `chat.typing` to both the room group **and** the other party's `user.<id>` channel — so it shows as "typing…" both inside the conversation and in the sidebar row of users not currently in the room.
- Online presence: [chat/presence.py](backend/apps/chat/presence.py) tracks each connected user via a TTL'd Redis key (`presence:user:<id>`, refreshed by a heartbeat from `UserNotificationConsumer`). On connect/disconnect — debounced by a short grace period to absorb refreshes — a `presence.update` event fans out to every chat peer (users who share at least one `ChatRoom`), so green dots and "Last seen …" labels stay live without polling. `ChatRoomSerializer` also includes `other_party_online` / `other_party_last_seen_at` for cold loads. `User.last_seen_at` is updated when a presence transition occurs.
- Frontend: [/chat](frontend/src/app/chat/page.tsx) list with unread badges, online dots, and live "typing…" preview; [/chat/[roomId]](frontend/src/app/chat/[roomId]/page.tsx) conversation view with header presence + typing indicator; [ChatBadge](frontend/src/components/ChatBadge.tsx) in the nav.

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
| [reservations/tests/test_quantity.py](backend/apps/reservations/tests/test_quantity.py) | sequential per-service quantity: field defaults (1 / "unit"), duration & price scale linearly, buffer added once, scaled conflict window, max/min validation, reschedule preserves vs. explicitly changes quantity, book/walk-in/availability API with quantity + 400 when over max |
| [reservations/tests/test_commission_billing.py](backend/apps/reservations/tests/test_commission_billing.py) | monthly invoice generation idempotency + correct sum, zero-commission shop skipped, paid/void invoices untouched on re-run, pay/settle stamps all period ledger rows `settled_at`, PayMongo paid-webhook + dev-confirm route to the invoice, overdue → auto-pause and pay → auto-resume, owner/admin permission boundaries |
| [payments/tests/test_payments.py](backend/apps/payments/tests/test_payments.py) | dev-mode fake checkout URL, idempotent `start_checkout`, `mark_paid` auto-confirms reservation, valid + invalid PayMongo webhook signatures, checkout endpoint authorization, dev-confirm helper |
| [accounts/tests/test_tokens.py](backend/apps/accounts/tests/test_tokens.py) | email-token round trip + expiry, password-token round trip, password-change invalidates outstanding reset tokens, verify-email endpoint, reset-request doesn't leak account existence, reset-confirm enforces minimum length |
| [accounts/tests/test_otp.py](backend/apps/accounts/tests/test_otp.py) | OTP code generation + hashed persistence, prior unconsumed codes invalidated, resend cooldown, expiry, attempt cap, consumed-once semantics, register endpoint sends OTP, verify-otp endpoint returns JWTs + marks `email_verified_at`, request-otp doesn't leak unknown emails or re-send to already-verified users |
| [notifications/tests.py](backend/apps/notifications/tests.py) | inbox API + signal-driven creation; maintenance-reminder CRUD (owner-only, cross-shop blocked, unknown customer rejected, customer role forbidden, list scoped to own shops); dispatcher fires only due reminders, rolls `next_due_at` forward, skips inactive ones, and persists an in-app `Notification` row |
| [shops/tests/test_hours_and_availability.py](backend/apps/shops/tests/test_hours_and_availability.py) | hours PUT permission checks, override marks day closed → 0 slots, override with narrower hours limits slots, no slots in the past |
| [chat/tests/test_services.py](backend/apps/chat/tests/test_services.py) | get-or-create idempotency, only-customer-can-open + only on active shops, sender must be a participant, edit only your own message, unread arithmetic across rooms, mark-read forward / mark-unread rewind incl. first-message edge case |
| [chat/tests/test_api.py](backend/apps/chat/tests/test_api.py) | open room (customer-only), list scoped to self, outsiders 404, send / list / edit / mark-read / mark-unread end-to-end, global unread-count, unauthenticated 401 |
| [chat/tests/test_presence.py](backend/apps/chat/tests/test_presence.py) | presence helpers (`is_online`, bulk `online_user_ids`) against a fake redis, peer fan-out (`peers_to_notify` returns chat-room counterparts), `ChatRoomSerializer.other_party_*` fields, and `ChatRoomConsumer` typing fan-out (room group + recipient's `user.<id>` group) via `WebsocketCommunicator` |
| [locations/tests/test_locations.py](backend/apps/locations/tests/test_locations.py) | `seed_psgc` counts + FK links (barangay→city→province→region) from a tiny fixture, idempotency skip + `--force` reseed; provinces endpoint shape/region info, cities/barangays require + filter by parent code, missing query param → 400, all three public. Also: `LOCATIONS_RESTRICT_TO_ILIGAN=True` collapses every endpoint to Iligan only (other provinces hidden, cities/barangays empty for non-Iligan parents). |

---

## Useful commands

```bash
# migrations
docker compose exec web python manage.py migrate
docker compose exec web python manage.py makemigrations

# seed categories (idempotent)
docker compose exec web python manage.py seed_categories

# seed PSGC locations (idempotent; --force to wipe + reseed)
docker compose exec web python manage.py seed_psgc

# Django shell
docker compose exec web python manage.py shell

# tests
docker compose exec web python manage.py test --settings=config.test_settings

# tail logs
docker compose logs -f web
docker compose logs -f worker
docker compose logs -f beat
# frontend logs print directly in the terminal running `npm run dev`

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
| `NEXT_PUBLIC_API_URL` | **leave unset** (same-origin `/api`) | **leave unset** (same-origin `/api`) |

Optional but recommended for `prod`: turn on **Required reviewers** to gate prod deploys behind a manual approval.

#### 5. First deploy

```bash
git push origin staging      # → staging deploys
git push origin main         # → prod deploys
```

Visit the CloudFront URL — site should load and API calls work same-origin (CloudFront routes `/api/*` to the backend). No `NEXT_PUBLIC_API_URL` needed.

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

**Site loads but API calls return "Network Error" / CORS errors**
The build baked an explicit cross-origin `NEXT_PUBLIC_API_URL` (e.g. a hardcoded `*.cloudfront.net`) while the app is served from a different host. Fix: **delete** the `NEXT_PUBLIC_API_URL` GitHub variable so the build uses the same-origin relative `/api` base, then retrigger the build. (Backend `CORS_ALLOWED_ORIGINS` only matters for deliberate split-origin setups.)

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

**Direct load / refresh on a static Next.js page (e.g. `/verify-otp`, `/login`) renders `Application error: a client-side exception has occurred`**
Next.js static export emits flat HTML files (`/verify-otp.html`, not `/verify-otp/index.html`). When the browser requests `/verify-otp` (no extension) S3 returns 404 → CloudFront's SPA fallback serves `/index.html` → that file's pre-rendered React tree tries to play back the root's `redirect("/shops")` action while the URL says `/verify-otp` → hydration crashes. Internal navigation works (the SPA already has the page loaded); only hard-loads / refreshes / external links break. Fix: a CloudFront Function on the default behavior (viewer-request) rewrites extensionless URIs to `.html`, e.g. `/verify-otp` → `/verify-otp.html`. Defined in [aws/layers/frontend_hosting/main.tf](aws/layers/frontend_hosting/main.tf) as `aws_cloudfront_function.rewrite_html`. The function skips `/api/*` and `/ws/*` (those route to the ALB origin) and pass-through anything with an existing extension. SPA fallback still handles genuinely-dynamic routes like `/shops/123` where no flat HTML exists.

**Clicking "Manage" on a shop card (or pasting `/my-shops/<id>/...` into a new tab) lands on `/shops` or a blank screen**
Root cause: Next.js's `output: "export"` emits dynamic routes under a `_` placeholder (`generateStaticParams() → [{ id: "_" }]`), so the only files in S3 are `/my-shops/_.html`, `/my-shops/_/services.html`, etc. A request for `/my-shops/123` finds no matching file and 404s. The SPA fallback (`custom_error_response` 404 → `/index.html` with status 200) then can't recover the URL — even with a client-component home page, hydration races and the user sees `/shops` or blank.

**Fix:** rewrite numeric path segments to `_` in the `rewrite-html` CloudFront function so S3 finds the right placeholder file directly — no SPA fallback needed. See [aws/layers/frontend_hosting/main.tf](aws/layers/frontend_hosting/main.tf) (`aws_cloudfront_function.rewrite_html`) and the offline test harness [aws/layers/frontend_hosting/test_rewrite_html.mjs](aws/layers/frontend_hosting/test_rewrite_html.mjs). The function maps `/my-shops/1/staff/2/hours → /my-shops/_/staff/_/hours.html`, etc. Apply with `terragrunt apply` on the `frontend_hosting` layer; the function is live the moment Terraform finishes (no CloudFront invalidation needed for the function itself, but invalidate `/my-shops/*`, `/shops/*`, `/reservations/*` to flush any cached fallback responses from before the fix).

**Trade-off baked in:** the regex assumes dynamic IDs are numeric. If you add slug/UUID routes later, broaden the rewrite (and the test harness) accordingly.

**Don't reintroduce** server-component `redirect()` from `next/navigation` on any top-level page either — that bakes a `<meta http-equiv="refresh">` into the static export which would also clobber any future fallback handling. Root redirects must run from a client-side `useEffect`.

**Celery worker crash-loops with `ValueError: A rediss:// URL must have parameter ssl_cert_reqs and this must be set to CERT_REQUIRED, CERT_OPTIONAL, or CERT_NONE` (no OTP / reminder / confirmation emails go out)**
AWS ElastiCache emits `rediss://` (TLS) URLs without SSL options. Celery's redis **result backend** ([celery/backends/redis.py](https://github.com/celery/celery)) reads `ssl_cert_reqs` from the `redis_backend_use_ssl` settings dict — NOT from URL query params, so appending `?ssl_cert_reqs=CERT_NONE` to the URL doesn't help. The broker (kombu) only warns; the result backend hard-raises. Fix in [backend/config/settings.py](backend/config/settings.py): set both `CELERY_BROKER_USE_SSL` and `CELERY_REDIS_BACKEND_USE_SSL` to `{"ssl_cert_reqs": ssl.CERT_NONE}` when the URL starts with `rediss://`. `CERT_NONE` is acceptable — wire is VPC-private and SG-locked; TLS still encrypts, we just skip CA-chain verification (ElastiCache's certs aren't in Python's default trust store anyway).

**Outbound emails don't arrive even when Celery is running (no error in worker logs)**
SES is in **sandbox mode** by default — you can only send TO addresses that are AWS-verified, and only FROM verified identities. Check status:
```bash
AWS_PROFILE=reservation-stage aws sesv2 get-account --region ap-southeast-1 --query 'ProductionAccessEnabled'
AWS_PROFILE=reservation-stage aws sesv2 list-email-identities --region ap-southeast-1
```
`ProductionAccessEnabled: false` + identity with `VerifiedForSendingStatus: None` = the verification email was sent but never clicked. Either click the link Amazon sent (check inbox + spam), or request production access via the SES console (Account dashboard → "Request production access"). Until one of those, every send to an unverified recipient silently fails / bounces.

**`terragrunt apply` fails with `InvalidPermission.Duplicate: the specified rule ... already exists` on a security group rule**
You (or a previous run) created the rule manually via the AWS Console / CLI before adding it to Terraform. AWS rejects the duplicate; Terraform has no state for it. Fix: import the existing rule into Terraform state, then re-apply. The resource address depends on the module path — for the internal ALB's CloudFront prefix-list ingress, that's:
```bash
AWS_PROFILE=reservation-stage terragrunt import \
  'module.alb_internal["svc-ecs-reservation-stage-api"].aws_vpc_security_group_ingress_rule.this["ingress_cloudfront_origin_facing"]' \
  <sgr-XXXXXXXX>   # the security-group-rule ID from `aws ec2 describe-security-group-rules`
```
Single-quote the address (zsh expands `[...]`). Re-apply afterward — expect "0 changes".

**Empty commit (`git commit --allow-empty`) doesn't trigger the frontend-deploy workflow**
Both [.github/workflows/frontend-deploy.yml](.github/workflows/frontend-deploy.yml) and [.github/workflows/backend-deploy.yml](.github/workflows/backend-deploy.yml) are path-filtered (`paths: ["frontend/**" ...]`). An empty commit changes no files, so the workflow filter never matches and GitHub skips the run. To force a frontend rebuild without touching code, either (a) re-run the last frontend-deploy from the **Actions** tab (the workflow re-reads `vars.NEXT_PUBLIC_API_URL` at runtime, so config-only changes get picked up), or (b) touch any file under `frontend/` (a comment edit is enough) and push. Same applies to backend-deploy with `aws/**` and `backend/**`.

**Requests hit `/api/api/<path>` (doubled prefix) and 404 / 504**
The frontend axios client in [frontend/src/lib/api.ts](frontend/src/lib/api.ts) sets `baseURL = ${NEXT_PUBLIC_API_URL}/api` — it appends `/api` itself. If you also include `/api` in the env var (e.g. `NEXT_PUBLIC_API_URL=https://....cloudfront.net/api`), you end up with `/api/api/...`. Fix: `NEXT_PUBLIC_API_URL` must be the **origin only** (no path), e.g. `https://dx1epgde94eqq.cloudfront.net`. Update **Settings → Environments → staging → Variables** and re-run the frontend-deploy workflow — Next.js bakes `NEXT_PUBLIC_*` at build time, so changing the var alone does nothing.

**Every request to `https://<distribution>.cloudfront.net/api/...` returns `504 Gateway Timeout` (CloudFront HTML error page) after exactly ~30s**
The internal ALB's security group only allows the VPC CIDR, but CloudFront VPC Origin requests reach the ALB sourced from the AWS-managed prefix list `com.amazonaws.global.cloudfront.origin-facing` — NOT from the VPC origin ENI's private IP, even though the ENI lives in your VPC. With no matching ingress rule, the ALB silently drops the connection and CloudFront returns 504 after its 30s origin timeout. Fix: allow that prefix list inbound on the ALB security group. Codified in [aws/layers/ecs/main.tf](aws/layers/ecs/main.tf) via a `data "aws_ec2_managed_prefix_list" "cloudfront_origin_facing"` lookup + `ingress_cloudfront_origin_facing` rule on `module.alb_internal`. Verify success with `curl -i https://<dist>.cloudfront.net/api/` → expect `200` in ~1–2s instead of `504` after 30s.

**Frontend at `https://dx1epgde94eqq.cloudfront.net` loads, but every API call returns 404 / 502 / `NetworkError`**
The CloudFront `/api/*` (or `/ws/*`) behavior is missing, the VPC origin isn't deployed yet, or `NEXT_PUBLIC_API_URL` was wrong at build time. Check, in order:
1. `aws cloudfront get-distribution --id <id> --query 'Distribution.DistributionConfig.CacheBehaviors'` — should list a behavior with `PathPattern: /api/*` and an `OriginId` matching the VPC origin.
2. `aws cloudfront list-vpc-origins` — should show one `Deployed` VPC origin pointing at the internal ALB ARN. CloudFront update propagation takes 5–15 min after `terragrunt apply`; the API call returns immediately but the distribution status will be `InProgress` for a while. Check `aws cloudfront get-distribution --id <id> --query 'Distribution.Status'` — wait for `Deployed`.
3. View source on the deployed page and grep for the API URL — Next.js bakes `NEXT_PUBLIC_*` at build time. If it still says `localhost:8000`, the GitHub Environment variable wasn't set before the last frontend build; fix it in **Settings → Environments → staging → Variables → `NEXT_PUBLIC_API_URL`**, then re-run the frontend-deploy workflow.

**`terragrunt apply` on `frontend_hosting` fails with `Error: Unsupported argument` for `vpc_origin_config` or `aws_cloudfront_vpc_origin` resource not found**
The AWS terraform provider in this layer is older than 5.74. `aws_cloudfront_vpc_origin` and the `origin.vpc_origin_config` block were added in provider 5.74 (Nov 2024). Fix: bump `version = ">= 5.74"` in [aws/accounts/_common/versions_override.tf](aws/accounts/_common/versions_override.tf) and run `terragrunt init -upgrade` in the layer before re-applying.

**Django returns `DisallowedHost at /api/...` or `400 Bad Request: Invalid HTTP_HOST header` when called through CloudFront**
CloudFront's "AllViewer" origin-request policy forwards the viewer's `Host` header (`dx1epgde94eqq.cloudfront.net`) to the origin. Django's `ALLOWED_HOSTS` must contain it. Quick fix: keep `DJANGO_ALLOWED_HOSTS = "*"` for staging (already the case in [parameters/env.yaml](aws/accounts/stage/ap-southeast-1/parameters/env.yaml)). For prod, add the explicit hostnames. After updating the SSM param, re-run the backend-deploy workflow to roll new task defs.

**`terragrunt apply` in CI fails with `AccessDenied ... s3:PutEncryptionConfiguration` (or `s3:PutBucketPolicy`) on the state bucket**
Terragrunt re-checks the remote-state bucket's settings (SSE, root-access policy, enforced TLS) every run and tries to update if they differ from its expected values. The state bucket was bootstrapped once with the admin profile, and the CI deploy role only has state read/write perms — not bucket-management perms. Fix: [terragrunt_base.hcl](aws/accounts/terragrunt_base.hcl) sets `skip_bucket_ssencryption = true`, `skip_bucket_root_access = true`, `skip_bucket_enforced_tls = true` so terragrunt trusts the existing settings instead of trying to enforce them. If you need to legitimately change those settings, do it once from local with the admin profile.

**`terragrunt apply` in CI fails with `Error: Backend initialization required, please run "terraform init"` / `Reason: Initial configuration of the requested backend "s3"`**
The S3 backend config in [terragrunt_base.hcl](aws/accounts/terragrunt_base.hcl) and the AWS provider in [_common/providers.tf](aws/accounts/_common/providers.tf) both default to using a named AWS CLI profile (`reservation-stage`, set in [stage/account.hcl](aws/accounts/stage/account.hcl)). That works locally — `aws configure --profile reservation-stage` — but breaks in CI, where credentials come from OIDC env vars and no named profile exists. Terraform tries to init the backend with the non-existent profile, can't authenticate, and the next command sees an uninitialized backend.
Fix: [terragrunt_base.hcl](aws/accounts/terragrunt_base.hcl) now detects CI (via the `CI` env var that GitHub Actions sets automatically) and substitutes `profile = null` for the backend + `profile_name = ""` for the provider, falling back to the env-var credential chain. Local dev still uses the named profile.

**`terragrunt apply` fails with `BucketAlreadyExists` on the frontend bucket**
S3 bucket names are **globally unique** across all AWS accounts. Edit `frontend_bucket_name` in [aws/accounts/stage/ap-southeast-1/region.hcl](aws/accounts/stage/ap-southeast-1/region.hcl) (and/or the prod one) — add a suffix like `-936146782254` or your initials. Re-run apply.

**`next build` fails with `useSearchParams() should be wrapped in a suspense boundary at page "/X"` (during `Generating static pages`)**
Any client page that calls `useSearchParams()` (directly or via a child component) must be wrapped in `<Suspense>` for static export — otherwise Next bails out of prerendering. Fix: split the component, put the `useSearchParams` body in a `*Inner` function, and export a default that wraps it in `<Suspense fallback={...}>`. See [verify-email/page.tsx](frontend/src/app/verify-email/page.tsx) or [reservations/page.tsx](frontend/src/app/reservations/page.tsx) for the pattern. If the search-params consumer is a child component reached through a `_client.tsx`, wrap the JSX in the `_client.tsx` instead (see [my-shops/[id]/reservations/_client.tsx](frontend/src/app/my-shops/[id]/reservations/_client.tsx)).

**`next build` warns `Invalid next.config.mjs options detected: Expected object, received boolean at "devIndicators"`**
Next 15 changed `devIndicators` from a boolean toggle to an object. Either remove the field (default behavior is fine — indicators only show in `next dev`) or pass `{ appIsrStatus: false, buildActivity: false }`. We just removed it from [next.config.mjs](frontend/next.config.mjs).

**`next build` fails locally with "Page X is missing generateStaticParams"**
The page is either a client component (`"use client"`) — generateStaticParams can't live there — or it returns an empty array (Next 15.1 quirk). See [Dynamic routes under static export](#dynamic-routes-under-static-export) for the page/`_client.tsx` split pattern.

**`next build` fails in CI with `Cannot find module '.../node_modules/next/constants' ... Did you mean to import "next/constants.js"?`**
Importing `next/constants` from `next.config.mjs` works locally (CommonJS resolution) but fails under stricter ESM resolution in the CI Node runtime. Fix: don't import it — inline the constant string. We need `phase === "phase-development-server"` to skip `output: "export"` in `next dev` so dynamic routes still work locally; that string is stable, so [frontend/next.config.mjs](frontend/next.config.mjs) compares to it directly instead of importing `PHASE_DEVELOPMENT_SERVER`.

**`next dev` fails locally with "Page X is missing generateStaticParams" when visiting a real ID like `/shops/1`**
You set `output: "export"` unconditionally and `next dev` is now rejecting any non-placeholder ID. Fix: make the `output: export` setting conditional on the build phase so dev mode keeps server-rendering — see [frontend/next.config.mjs](frontend/next.config.mjs) (it checks `phase === "phase-development-server"`).

**Signup / `/api/auth/request-otp/` returns 200 but the OTP never arrives in the inbox**
Two layered traps:

1. **`EMAIL_BACKEND=console` is the dev default** — the OTP is rendered as a full email but printed to `docker compose logs web` instead of being sent over SMTP. The API still returns success. To see the code, tail the web container:
   ```bash
   docker compose logs -f web | grep -A40 "verification code"
   ```
   To send real mail from local dev instead, follow [Recipe B (AWS SES)](#recipe-b--aws-ses-production) — or pull the SES creds straight out of SSM:
   ```bash
   aws ssm get-parameter --name /reservation/stage/ses/smtp_username --with-decryption \
     --region ap-southeast-1 --profile reservation-stage --query 'Parameter.Value' --output text
   aws ssm get-parameter --name /reservation/stage/ses/smtp_password --with-decryption \
     --region ap-southeast-1 --profile reservation-stage --query 'Parameter.Value' --output text
   ```
   Paste them into `backend/.env`'s `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD`, set `EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend` + `EMAIL_HOST=email-smtp.ap-southeast-1.amazonaws.com`, then `docker compose restart web worker`.

2. **Email failures are intentionally silent.** `apps/core/emails.py:send_template_email` catches all exceptions and logs a `warning` instead of raising, and `RegisterView.perform_create` further swallows that with `pass` so a broken mailer doesn't block signups. If the OTP isn't landing even on SMTP, check the warning log:
   ```bash
   docker compose logs web worker | grep -i 'send_template_email failed\|smtp'
   ```
   Common causes: still in SES sandbox + recipient not verified (`MessageRejected: Email address is not verified`), wrong region in `EMAIL_HOST` (each SES region has a different SMTP endpoint), or a `From:` address that isn't the verified sender.

3. **`request-otp/` never reveals whether the email exists.** It always returns `{"detail": "If that email exists, a code has been sent."}` to avoid account enumeration. If you call it with an unregistered email, you get a 200 but nothing happens. Register first.

**`docker compose up` fails with `Bind for 0.0.0.0:8000 failed: port is already allocated`**
Something else on the host is holding port 8000. Find and stop it:
```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN
```
Common culprits: a previous `web` container that never shut cleanly (`docker rm -f reservationapp-web-1`); an orphaned compose project from running `docker compose up` inside `backend/` instead of the repo root (`docker compose -p backend down`); an unrelated host process such as a stray `uvicorn`/`runserver` you started by hand. If the host process is something you want to keep running, remap the host side of the port in [docker-compose.yml](docker-compose.yml) (`"8001:8000"`) and update `CORS_ALLOWED_ORIGINS` + the frontend's `NEXT_PUBLIC_API_URL` to match.

**Backend deploy fails in the `migrate` job with `Invalid type for parameter containerDefinitions[0].entryPoint, value: None, type: <class 'NoneType'>, valid types: <class 'list'>, <class 'tuple'>`**
The migrate job clones the API task definition and tries to clear `entryPoint` so its own `command = ["sh","-c","python manage.py migrate ..."]` runs cleanly (the API task def sets `entrypoint = ["sh","-c"]` in [region.hcl](aws/accounts/stage/ap-southeast-1/region.hcl), which would otherwise produce `sh -c sh -c "..."`). Setting `.entryPoint = null` in jq produces `"entryPoint": null` in the JSON, and botocore rejects it client-side before the API call — the field must be a list or omitted entirely. Fix: use `del(.entryPoint)` in the jq filter (see [.github/workflows/backend-deploy.yml](.github/workflows/backend-deploy.yml)).

**Customer-facing slot times are shifted by the UTC offset (e.g. shop sets 9 AM–5 PM, customer sees 5 PM–1 AM)**
[backend/apps/reservations/availability.py](backend/apps/reservations/availability.py) calls `timezone.get_current_timezone()` to combine the shop's naive `WeekdayHours.open_time`/`close_time` with the booking date. That returns Django's `TIME_ZONE`, so if the project is set to `UTC` while owners enter hours in local time, the slots come out shifted by exactly the local offset. Fix: set `DJANGO_TIME_ZONE=Asia/Manila` (default) — DB storage stays UTC because `USE_TZ=True`, this only changes how naive `time` values are interpreted.

---

## Deferred to later phases

Intentionally not in v1 (see [app_ideas.md §7](app_ideas.md)):

- Deposits / partial payment (full-amount checkout only)
- Customer-initiated refund flow (currently shop-owner-only)
- Assigning services to specific staff via UI (model + M2M exist; admin only)
- SMS reminders (held — held due to cost; see [app_ideas.md §8](app_ideas.md). Email + in-app notification cover signup OTP, appointment reminders, and recurring maintenance reminders today.)
- Native mobile app (React Native sharing the API)
- Multi-language / multi-currency (PayMongo is PHP-only anyway)
- PostGIS geospatial migration (current Haversine + bounding box is fine for v1 scale)
- 2FA, social login (Google)
- Marking commission entries as settled from the admin UI (data is in `CommissionLedger.settled_at` — admin can flip via Django admin)
- Support follow-ups: admins-list endpoint + proper assignee dropdown (currently Assign-to-me / Unassign only); customer-side unread indicator (needs `has_unread_admin_reply` flag); shop-owner-scoped ticket views; WebSocket real-time updates on threads

---

## Notes

- Timestamps are stored UTC; render in user local time on the client.
- Locations use lat/lng + Haversine in v1.
- Commission is recorded but not collected automatically — the platform settles with shops off-platform monthly.
