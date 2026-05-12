# Reservation App - Ideas & Specification

> **Implementation status: Phase 1 ✅ Complete · Phase 2 ✅ Complete · Phase 3 partial.** Phase 1 + Phase 2 items below are built and wired end-to-end. Phase 3 has admin dashboard, email verification, password reset, and cross-shop service discovery. Online payments, SMS, native mobile, and i18n remain deferred. See [README.md](README.md) for run instructions and a per-feature implementation map.

## 0. Platform & Delivery

- **v1 is a web application only** — no native iOS/Android app. Native mobile is deferred to Phase 3.
- **Mobile-first responsive design** is a hard requirement. The site must work and look good on phones (≥360px width), tablets, and desktops.
  - Build mobile-first in TailwindCSS (default styles target small screens, then `sm:` / `md:` / `lg:` breakpoints scale up).
  - Touch-friendly hit targets (min 44×44px), no hover-only interactions, large tap zones for time-slot picking.
  - Test against iOS Safari + Android Chrome at minimum.
- **PWA-ready** (Phase 2): add manifest + service worker so users can "Add to Home Screen" and get an app-like experience without a native build.
- **Containerized with Docker.** Everything runs in containers — local dev, CI, and production.
  - One service per container: `web` (Django/DRF + Daphne for ASGI), `worker` (Celery), `beat` (Celery Beat), `db` (Postgres), `redis`, `frontend` (Next.js), `nginx` (reverse proxy in prod).
  - Local dev orchestrated by `docker-compose.yml` with hot-reload volumes for both backend and frontend.
  - Separate `Dockerfile` for backend and frontend; production images are multi-stage builds (slim runtime).
  - `.env` files per environment (`.env.dev`, `.env.prod`); never bake secrets into images.

## 1. Tech Stack

### Backend
- **Django** - main web framework
- **Django REST Framework (DRF)** - REST API layer
- **Celery** - async task queue (sending emails/SMS, reminders, cleanup jobs)
- **Redis** - Celery broker, caching, and Django Channels layer
- **Django Channels** - WebSocket support for real-time notifications and live booking updates
- **PostgreSQL** - primary database

### Frontend
- **React** with **Next.js** (App Router) - SSR for SEO on shop discovery pages
- **TailwindCSS** + **shadcn/ui** - styling and components
- **TanStack Query** - data fetching and cache
- **Zustand** or **Redux Toolkit** - client state
- **Socket.io client** or native WebSocket - real-time updates from Django Channels

### Infrastructure / DevOps
- **Docker** + **docker-compose** for local dev
- **Nginx** as reverse proxy
- **AWS S3** (or equivalent) for media uploads (shop photos, service images)
- **GitHub Actions** for CI/CD
- **Sentry** for error tracking

---

## 2. User Roles

### Admin
- Platform owner / super-admin
- Manages all shops, customers, categories, disputes
- Reviews and approves new shop registrations
- Access to platform-wide analytics

### Shop Owner
- Registers a shop (or multiple shops)
- Manages services, pricing, staff, schedules
- Views and manages incoming reservations
- Sees revenue and booking analytics

### Customer
- Browses shops and services
- Books reservations
- Manages their own bookings
- Reviews shops after a completed service

> **Phase 1 focus:** Shop Owner + Customer features. Admin features come later.

---

## 3. Service Categories (no food)

- Hair & Beauty (haircut, hair color, manicure, pedicure)
- Wellness (massage, spa, sauna)
- Home Services (aircon cleaning, plumbing, electrical, pest control)
- Automotive (car repair, car wash, detailing, tire change)
- Fitness & Training (personal trainer, yoga session)
- Pet Services (grooming, vet checkup)
- Tech / Repair (phone repair, laptop repair)

---

## 4. Core Features

### 4.1 Shop Owner Features
- **Shop registration & profile**
  - Name, description, photos, address (with map pin), contact info
  - Operating hours (per weekday, plus holiday overrides)
  - Categories / tags
- **Service management**
  - Add / edit / delete services
  - Per service: name, description, duration, price, buffer time, photos
  - Optional: assign service to specific staff
- **Staff management**
  - Add staff members with their own working hours
  - Assign services each staff member can perform
- **Schedule & availability**
  - Auto-generated availability slots based on shop hours, staff hours, and service duration
  - Block off time (vacations, breaks) manually
- **Reservation management**
  - Inbox of upcoming bookings
  - Confirm / reschedule / cancel
  - Mark as completed / no-show
  - **Add walk-in booking** (manual entry: existing customer search OR guest name+phone)
  - See customer's no-show / cancellation history when reviewing requests
  - Real-time notifications via WebSocket
- **Analytics dashboard**
  - Revenue (daily / weekly / monthly)
  - Most-booked services
  - Repeat-customer rate
  - No-show rate

### 4.2 Customer Features
- **Discovery**
  - Search shops by category, name, location (radius)
  - "Find shops near me" button → browser geolocation prompt (with city/zip fallback if denied)
  - Filter by rating, price range, availability today/this week
  - Sort by distance, rating, popularity
- **Shop page**
  - Photos, description, services list with prices
  - Reviews & ratings
  - Open hours, address with map
- **Booking flow**
  - Pick service → pick staff (optional) → pick date/time slot → confirm
  - See total price up front
  - **Pay on arrival** (no online payment in v1)
- **My reservations**
  - Upcoming, past, cancelled tabs
  - Reschedule (within shop's policy) or cancel
  - Add to Google / Apple calendar
- **Reminders**
  - Email + push (and optional SMS) reminders 24h and 1h before
- **Reviews**
  - Leave 1-5 star rating + text review after a completed reservation
- **Favorites**
  - Save favorite shops for quick rebooking

### 4.3 Cross-cutting
- **Authentication**
  - Email/password + social login (Google)
  - JWT or session auth
  - Email verification, password reset
- **Notifications**
  - In-app (Django Channels) for live updates
  - Email (Celery + SMTP/SendGrid)
  - Optional SMS (Twilio) for reminders
- **Payments (Phase 2)**
  - PayMongo so each shop receives payouts directly
  - Deposit / full payment / pay-on-arrival options
  - Refund flow tied to cancellation policy
- **Internationalization**
  - i18n on frontend, timezone-aware datetimes on backend

---

## 5. Suggested Data Model (high level)

- `User` (custom Django user with `role` enum: admin / shop_owner / customer; customers also carry `no_show_count_90d`, `cancellation_strikes_90d`, `restricted_until` for the strike system)
- `Shop` (owner FK -> User [a shop owner can have many shops], name, address, **latitude, longitude** (for radius search), hours, status, commission_rate, **cancellation_window_hours** (override of platform default))
- `Staff` (shop FK, user FK optional, working hours)
- `ServiceCategory`
- `Service` (shop FK, category FK, name, duration, price, buffer)
- `StaffService` (M2M: which staff can perform which service)
- `Reservation` (customer FK [nullable for walk-ins], shop FK, service FK, staff FK, start_at, end_at, status, total_price, commission_amount, notes, payment_method=`pay_on_arrival`, source=`online`/`walk_in`, created_by_shop bool, guest_name, guest_phone)
- `ReservationStatusHistory` (audit trail)
- `Review` (customer FK, shop FK, reservation FK, rating, comment)
- `Favorite` (customer FK, shop FK)
- `CommissionLedger` (shop FK, reservation FK, amount, period, settled_at) — tracks platform commission owed per completed reservation, since v1 has no online payment collection
- `Notification` (user FK, type, payload, read_at)

### Reservation status state machine
`pending` → `confirmed` → `completed`
With branches: `cancelled_by_customer`, `cancelled_by_shop`, `no_show`, `rescheduled`

---

## 6. Key Technical Considerations

### Availability calculation
- Compute open slots on the fly from: shop hours ∩ staff hours ∩ service duration ∩ existing reservations ∩ blocked time
- Cache per (shop, date) in Redis with short TTL; invalidate on new booking
- Prevent double-booking with DB-level unique constraint on (staff, time-range) using PostgreSQL `tstzrange` + GiST exclusion constraint

### Real-time updates
- Django Channels group per shop for shop-owner dashboards
- Group per user for customer's "my reservations" page
- Push events on: new booking, status change, cancellation

### Background jobs (Celery)
- Send confirmation emails on booking
- Send reminder emails/SMS at scheduled times (Celery Beat or `apply_async(eta=...)`)
- Auto-mark `no_show` after grace period
- Nightly cleanup of expired pending reservations
- Generate daily/weekly analytics rollups

### Security
- Rate limit booking endpoint to prevent slot-hoarding
- Permissions: customers can only see their own reservations; shop owners only their shop's data
- CSRF on session endpoints, JWT rotation if using JWT
- Validate timezone server-side; store everything in UTC

---

## 7. Suggested Build Phases

### Phase 1 - MVP (Shop Owner + Customer) — ✅ Implemented
- ✅ Auth + roles (custom User, JWT, role permissions)
- ✅ **Multi-shop ownership** (one shop owner → many shops, with a shop switcher in dashboard)
- ✅ Shop CRUD + service CRUD (lat/lng on Shop; geocoding hook ready for Mapbox/Nominatim integration)
- ✅ Public shop discovery + search, **"Find shops near me" geolocation** + city/zip fallback (bounding-box + Haversine, no PostGIS yet)
- ✅ Booking flow with availability calculation, **pay on arrival only**
- ✅ "My reservations" for customers, "Inbox" for shop owners
- ✅ **Walk-in / manual booking** by shop owners (guest_name + guest_phone supported)
- ✅ **Cancellation policy**: platform default windows + per-shop override + 90-day strike system (auto-decay via Celery Beat)
- ✅ Email confirmations + 24h/1h reminders (HTML + text templates, Celery-driven)
- ✅ Basic reviews (one per completed reservation, with shop reply)
- ✅ **Commission tracking**: record commission per completed online reservation in `CommissionLedger` (walk-ins excluded)
- ✅ **Real-time WebSocket notifications** (originally Phase 2 — pulled forward; shop owners get live booking pings, customers get status updates)

### Phase 2 — implemented
- ✅ Customer favorites UI (heart toggle on shop page + /favorites page)
- ✅ Reply-to-review UI on shop detail page for owners
- ✅ Address auto-geocoding via Nominatim on shop create/update
- ✅ Basic staff CRUD UI (add / activate / remove)
- ✅ Per-staff weekly schedule UI
- ✅ Customer-side staff selection at booking
- ✅ Reservation reschedule UI
- ✅ Shop publish / pause action
- ✅ Edit shop / edit service / delete service UIs
- ✅ Walk-in booking UI for shop owners
- ✅ Image uploads (shop photos)
- ✅ PWA manifest + service worker (Add-to-Home-Screen, app-shell cache)
- ✅ `/health/` endpoint for orchestrator probes
- ✅ Backend tests for booking lifecycle, commission, strikes, reschedule

### Phase 3 — partial progress
- ✅ Admin dashboard (overview, pending-shops approval, commission ledger summary)
- ✅ Email verification on register + resend
- ✅ Password reset (forgot + confirm)
- ✅ Cross-shop service discovery search
- ✅ Online payments via PayMongo (GCash / GrabPay / Maya / cards) — see §8.7 for the platform-collects-then-settles model
- ✅ Shop-owner-initiated refunds via PayMongo (`POST /api/payments/reservations/<id>/refund/`)
- ✅ Per-shop analytics endpoint + dashboard page (revenue, completion + no-show rate, top services)
- ✅ Code-quality round: shared `core/emails.py`, `HoursEditor` + `SlotPicker` components, `formatApiError` helper, configurable `FRONTEND_URL`
- ✅ Test coverage: payments lifecycle + webhook signing, account tokens, shop hours + availability overrides
- ✅ Customer ↔ shop chat (real-time via Channels, edit messages, mark-unread-from, per-room unread badges + global nav badge) — see §8.13 for design notes
- ⏳ Deposits / customer-initiated refunds
- ⏳ SMS reminders (Twilio)
- ⏳ Native mobile app (React Native, sharing the API)
- ⏳ Multi-language / multi-currency
- ⏳ 2FA, social login (Google)

---

## 8. Decisions Made

### 8.1 Multi-shop owners
A single shop owner can own and manage multiple shops. Data model: `Shop.owner` is FK to `User` (one owner → many shops). Shop owner dashboard has a shop switcher.

### 8.2 Payments
No online payments in v1. **Pay on arrival** only. Stripe integration is deferred to Phase 3.

### 8.3 Monetization (commission)
- **Commission-based.** The platform takes a percentage of each completed reservation's total price.
- Platform default commission rate, with per-shop override (admin-set, e.g. for promotional deals).
- Recorded per reservation in `CommissionLedger`. Since there's no online payment in v1, settlement happens off-platform (admin invoices the shop monthly).
- Commission only applies to reservations marked `completed` — not cancelled / no-show / walk-in (walk-ins handled separately, see 8.6).

### 8.4 Cancellation policy
**Pattern: platform default + per-shop override + strike system** (no fees, since no online payments).

- **Platform default windows:**
  - Cancel >24h before start: free
  - Cancel <24h: counts as 1 strike
  - Cancel <2h or no-show: counts as 1 strike (no-show = 1 strike, harsher tracking)
- **Per-shop override:** shops can tighten the free-cancel window (e.g. 48h for spas/long appointments) via `Shop.cancellation_window_hours`. They cannot loosen the strike rules.
- **Strike system (in lieu of fees):**
  - 3 strikes in rolling 90 days → customer flagged; shop must manually approve their next booking at that shop, or platform-wide "restricted" status.
  - No-show counter is tracked separately and shown to shop owners when they review a booking request.
- **Shop-side cancellation:** shop owner can cancel/reschedule with a reason. Excessive shop-side cancellations are tracked for admin review (Phase 3).
- **Implementation:** all enforcement runs in a Celery task on cancellation/no-show events; strikes auto-expire after 90 days.

### 8.5 Location & geolocation
- **Customer side:** use the browser **Geolocation API** (`navigator.geolocation.getCurrentPosition`).
  - Triggered explicitly by a "Find shops near me" button — no auto-prompt on page load (better grant rate, less creepy).
  - Browser handles the permission prompt natively.
  - **Fallback:** if denied or unavailable, show a city/zip text input that geocodes server-side.
- **Shop side:** when registering a shop, the address is geocoded to lat/lng (server-side, e.g. via Nominatim/Mapbox). Stored on `Shop.latitude` / `Shop.longitude`.
- **v1 query approach:** **bounding-box + Haversine** in raw SQL — avoids the PostGIS dependency. Good enough for radius search at our scale.
- **Phase 2:** migrate to PostGIS (`ST_DWithin`, `geography` type) once the radius query becomes a hotspot or we need polygon/region features.

### 8.6 Walk-ins
**Pattern: manual booking by shop owner** (the 80% solution; reuses the Reservation model).

- Shop owner has an "Add walk-in" button on their dashboard:
  - Pick service + staff + time
  - Either **search existing customer** by name/phone, OR enter **guest name + phone** (no account required)
  - Save → slot is blocked off and behaves like any other reservation
- Data model changes:
  - `Reservation.customer` is **nullable**
  - Add `Reservation.guest_name`, `Reservation.guest_phone` for walk-ins without an account
  - Add `Reservation.source` (`online` / `walk_in`) and `Reservation.created_by_shop` bool
- Walk-ins skip the customer-facing flow entirely (no email confirmation, no reminders unless phone is provided + opt-in SMS in Phase 2).
- **Walk-in queue** (a separate "now serving" queue without time slots, common in barbershops) is **deferred** — it's a different UX and not needed for v1.
- **Commission rule for walk-ins:** open question — most platforms exclude walk-ins from commission since the platform didn't drive the booking. **Default: walk-ins are NOT commissioned** in v1; admin can revisit later.

### 8.7 Online payments — PayMongo
**Provider: PayMongo** (PHP-only, supports GCash / GrabPay / Maya / Visa / Mastercard / JCB).

- v1 still defaults to **pay-on-arrival**; online payment is opt-in per booking.
- **No marketplace split.** PayMongo doesn't have a Stripe-Connect equivalent. So all customer payments land in the **platform's** PayMongo account, then the platform settles with shops off-platform (bank transfer / GCash) on a regular cadence.
- **Flow** (PayMongo Checkout Sessions):
  1. Customer books a slot → Reservation in `pending`, `payment_method=online`.
  2. Backend calls PayMongo `checkout_sessions.create` with the booking total in centavos.
  3. Customer is redirected to PayMongo's hosted page; on success, PayMongo redirects back to our `success_url`.
  4. PayMongo POSTs a `checkout_session.payment.paid` (or similar) **webhook**; our handler verifies the signature, marks the `Payment` row paid, and transitions the Reservation from `pending` → `confirmed`.
  5. Reservation lifecycle continues normally; `transition` to `completed` writes the commission entry as before.
- **Data model:**
  - `Payment` (reservation OneToOne, provider, provider_session_id, amount, currency, status, paid_at, raw_payload) — replaces the `Payment` model placeholder from §5.
  - `Reservation.payment_method` choices: `pay_on_arrival`, `online`.
- **Security:** webhooks verified via HMAC SHA-256 of the raw body using `PAYMONGO_WEBHOOK_SECRET` against the `Paymongo-Signature` header.
- **Refunds (deferred):** PayMongo supports refunds via API but a full refund policy / partial refund flow is Phase 3.
- **Currency:** PHP only in v1 (PayMongo's only supported currency).

### 8.13 Chat (customer ↔ shop)
- **One conversation per (customer, shop) pair.** No group chats, no DMs between customers. The shop owner replies as themselves; multiple owners are out of scope (one owner per shop in v1).
- **Customer initiates.** A "Chat" button on the active shop's detail page opens or re-opens the room (idempotent get-or-create). Shop owners cannot start cold conversations.
- **Storage stays in Postgres** even though chat is the highest-write surface. At this app's scale this is fine — Discord ran chat on Postgres for billions of messages before sharding. The index `(room_id, created_at)` keeps the message-list query trivial.
- **Real-time uses the existing Channels stack.** Two consumer groups:
  - `chat.room.<id>` — joined by anyone with the room open. Receives `chat.message`, `chat.message_edited`, `chat.read_state`.
  - `user.<id>` — the existing notifications group. Receives `chat.new_message` so the nav badge updates without an open room socket.
- **Reads are tracked by a per-user cursor** (`ChatParticipant.last_read_message`) pointing at the highest message seen. Unread = messages in the room past the cursor that the user didn't send. This is cheaper than per-message read receipts and makes "mark unread" trivial.
- **"Mark unread from here" rewinds the cursor** to the predecessor of the chosen message (or null if it's the first message in the room). The target and everything after re-enter the unread tally — and the room jumps back to the top of the chat list.
- **Edits are allowed indefinitely; soft-delete is in the model but no UI yet.** Edit sets `edited_at`; the body cannot become empty. Only the sender can edit (enforced in the service layer).
- **Writes always go through REST.** The WebSocket is read-only (broadcasts only). Keeps auth + validation in one place and avoids state divergence between socket and REST clients.

---

## 9. Use Cases

Phase tags: **[P1]** = MVP, **[P2]** = phase 2, **[P3]** = phase 3.

### 9.1 Shop Owner

#### Account & onboarding
- Register as a shop owner (email/password or Google) **[P1]**
- Verify email **[P1]**
- Login / logout **[P1]**
- Reset forgotten password **[P1]**
- Update own profile (name, phone, avatar) **[P1]**
- Delete own account (with grace period if shops still active) **[P2]**

#### Multi-shop management
- Create a new shop **[P1]**
- Edit shop details (name, description, contact, address) **[P1]**
- Re-geocode shop address if moved **[P1]**
- Upload / reorder / delete shop photos **[P1]**
- Set operating hours per weekday **[P1]**
- Add date-specific overrides (holidays, special hours) **[P1]**
- Assign categories / tags to shop **[P1]**
- Activate / deactivate (pause) a shop temporarily **[P1]**
- Delete a shop (only if no upcoming reservations) **[P1]**
- Switch between owned shops in the dashboard **[P1]**

#### Service management
- Add a service (name, description, duration, price, buffer time) **[P1]**
- Edit a service **[P1]**
- Delete / archive a service (archive if it has historical bookings) **[P1]**
- Upload service photos **[P1]**
- Assign service to a category **[P1]**
- Restrict a service to specific staff (only some staff can perform it) **[P2]**

#### Staff management **[P2]**
- Add a staff member (name, role, photo, optionally linked user account)
- Set per-staff working hours
- Define which services each staff member can perform
- Block staff time (vacation, sick day, training)
- Remove a staff member (reassign or release upcoming reservations)

#### Schedule & availability
- View daily / weekly / monthly calendar **[P1]**
- Block off time manually (breaks, deep-clean, maintenance) **[P1]**
- Override hours for a specific date **[P1]**
- See live capacity vs bookings for the day **[P1]**

#### Reservation management
- View inbox of upcoming reservations **[P1]**
- Filter / search reservations (date, status, customer, service, staff) **[P1]**
- Confirm a reservation **[P1]**
- Reject a reservation (with reason) **[P1]**
- Reschedule a reservation (with reason, customer notified) **[P1]**
- Cancel a reservation (with reason) **[P1]**
- Mark reservation as `completed` **[P1]**
- Mark reservation as `no_show` **[P1]**
- Add internal notes on a reservation (not visible to customer) **[P1]**
- Add a walk-in / manual booking (existing customer or guest name+phone) **[P1]**
- View customer's history (past visits, no-show count, strike count) before approving **[P1]**
- Manually approve a strike-flagged customer's request **[P1]**

#### Reviews
- View reviews left on the shop **[P1]**
- Reply publicly to a review **[P2]**
- Flag a review as inappropriate (admin escalation) **[P2]**

#### Notifications
- Receive in-app notification on a new booking **[P2 (real-time); P1 has email only]**
- Receive email on new booking / cancellation / reschedule **[P1]**
- Mark notifications as read **[P2]**
- Configure notification preferences (per channel, per event type) **[P2]**

#### Cancellation policy
- Configure shop's cancellation window (only stricter than platform default) **[P1]**
- View list of customers currently flagged on this shop **[P1]**

#### Analytics & reporting
- View revenue (daily / weekly / monthly) per shop **[P1 basic; P3 advanced]**
- View booking volume over time **[P1]**
- See most-booked services **[P1]**
- See no-show rate, repeat-customer rate **[P1]**
- Export reservations / revenue to CSV **[P3]**

#### Commission / billing
- View commission ledger (what is owed to the platform) per shop **[P1]**
- Download monthly commission statement **[P3]**
- View commission rate applied (with override if set by admin) **[P1]**

---

### 9.2 Customer

#### Account & onboarding
- Register (email/password or Google) **[P1]**
- Verify email **[P1]**
- Login / logout **[P1]**
- Reset forgotten password **[P1]**
- Update profile (name, phone, avatar) **[P1]**
- Delete own account **[P2]**

#### Discovery
- Browse all shops **[P1]**
- Search shops by name **[P1]**
- Filter shops by category **[P1]**
- Filter by rating, price range **[P1]**
- Filter by availability today / this week **[P1]**
- Sort by distance, rating, popularity **[P1]**
- Click "Find shops near me" → grant browser geolocation → see nearby shops **[P1]**
- Fallback: type a city / zip code to find shops **[P1]**
- View shops on a map **[P2]**

#### Shop page
- View shop details (photos, description, hours, address) **[P1]**
- View shop's services and prices **[P1]**
- View shop's reviews and rating **[P1]**
- View shop's staff (when staff feature ships) **[P2]**
- View shop on a map / get directions **[P1]**
- Save shop to favorites / unsave **[P2]**

#### Booking flow
- Pick a service **[P1]**
- Optionally pick a specific staff member **[P2]**
- View available time slots for chosen date **[P1]**
- Select a slot **[P1]**
- Add notes for the shop (e.g. "first-time visit") **[P1]**
- See total price and "pay on arrival" disclosure **[P1]**
- Confirm booking → receive confirmation email **[P1]**
- See cancellation policy before confirming **[P1]**

#### My reservations
- View upcoming reservations **[P1]**
- View past reservations **[P1]**
- View cancelled reservations **[P1]**
- View full reservation details **[P1]**
- Cancel a reservation (subject to policy; warned about strikes) **[P1]**
- Request reschedule (shop must approve) **[P1]**
- Add reservation to Google / Apple calendar (.ics) **[P1]**
- Get directions to the shop **[P1]**

#### Reminders & notifications
- Receive booking confirmation email immediately **[P1]**
- Receive 24-hour reminder email **[P1]**
- Receive 1-hour reminder email **[P1]**
- Receive in-app / push notifications on shop status changes **[P2]**
- Optional SMS reminders **[P3]**
- Manage notification preferences **[P2]**

#### Reviews
- Leave a review (rating 1–5 + text) after a `completed` reservation **[P1]**
- Edit own review within an edit window (e.g. 7 days) **[P1]**
- Delete own review **[P1]**

#### Favorites **[P2]**
- Save a shop to favorites
- Unsave
- View list of favorite shops
- Quick-rebook the same service from a favorite

#### Account health & policy
- View own no-show count and active strikes **[P1]**
- See "restricted" status and reason if blocked from booking **[P1]**
- View cancellation policy for any shop before booking **[P1]**

---

### 9.3 Cross-cutting use cases (both roles)
- View terms of service / privacy policy **[P1]**
- Submit a support / contact form **[P2]**
- Receive transactional emails (verification, password reset, booking events) **[P1]**
- Stay logged in across sessions ("remember me") **[P1]**
- Two-factor authentication **[P3]**
