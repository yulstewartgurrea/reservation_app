# CLAUDE.md

Operating instructions for Claude Code when working in this repo. Keep this file short — defer architecture and feature docs to [README.md](README.md) and [app_ideas.md](app_ideas.md).

## What this project is

A multi-shop service reservation platform (haircuts, spas, car wash, repair, etc.). Customers book time slots; shop owners manage bookings; admin approves shops and tracks commission. Pay-on-arrival or PayMongo. Commission-based monetization.

**Read first:** [README.md](README.md) for stack, all endpoints, all pages, env vars, tests. [app_ideas.md](app_ideas.md) for the decisions log (§8 explains commission, cancellation, walk-ins, geolocation, PayMongo payout model).

## Stack at a glance

- **Backend:** Django 5 + DRF + Channels + Celery + Beat + Redis + PostgreSQL — `backend/`
- **Frontend:** Next.js 15 (App Router) + Tailwind + TanStack Query + Zustand — `frontend/`
- **Payments:** PayMongo (PHP-only). **Never Stripe.**
- **Infra:** Docker Compose — 7 services (db, redis, web, worker, beat, frontend)

## Working agreements

### Decisions to honor (don't undo)
- **PayMongo, not Stripe.** All payment code goes through `apps/payments/paymongo.py`. PayMongo has no Connect-equivalent — the platform collects, then settles with shops off-platform. Don't try to architect for split payouts.
- **Pay-on-arrival is the default.** Online payment is opt-in per booking via `Reservation.payment_method = "online"`.
- **Walk-ins are NOT commissioned.** Commission only applies to `completed` `online`-source reservations.
- **Currency is PHP only.** PayMongo limitation; don't add multi-currency handling.
- **No PostGIS in v1.** Geo search uses Haversine + bounding box in plain SQL.

### Code-quality bar
- **Test what you change.** Add to the relevant `apps/<name>/tests/` directory. Run with `docker compose exec web python manage.py test --settings=config.test_settings`.
- **No duplication.** Reuse existing shared bones before creating new ones:
  - Email: `apps/core/emails.py` `send_template_email`
  - Hours UI: `frontend/src/components/HoursEditor.tsx`
  - Slot picker: `frontend/src/components/SlotPicker.tsx`
  - Forms: `ShopForm`, `ServiceForm`
  - Errors: `frontend/src/lib/errors.ts` `formatApiError` — never use `JSON.stringify(err)` to display API errors
- **Service-layer pattern.** Business logic lives in `apps/<name>/services.py`, not in views. Models stay thin; serializers don't carry business rules.
- **Transactions.** Wrap multi-step writes with `@transaction.atomic`.
- **Permissions on every endpoint.** Default `IsAuthenticated`; explicit `permissions.AllowAny` for public reads. Use `IsCustomer`, `IsShopOwner`, `IsAdmin` from `apps/accounts/permissions.py`.
- **Secrets via env.** Never hardcode keys. New env vars go in `backend/.env.example` and the README env table.

### UX bar
- Mobile-first: 44px tap targets, full-width primary buttons on phones, no hover-only interactions.
- Friendly errors via `formatApiError`.
- Loading states + empty states with hints.
- Status pills for state (paid/refunded/pending).
- Confirmation dialogs on destructive actions.

## How to develop

```bash
# everything
docker compose up --build

# tests
docker compose exec web python manage.py test --settings=config.test_settings

# migrations after model changes
docker compose exec web python manage.py makemigrations
docker compose exec web python manage.py migrate

# Django shell
docker compose exec web python manage.py shell
```

The `web` container auto-runs `makemigrations → migrate → seed_categories → runserver` on startup.

For local dev without a PayMongo sandbox account, leave `PAYMONGO_SECRET_KEY` empty: the client returns a fake checkout URL and `POST /api/payments/reservations/<id>/dev-confirm/` simulates the webhook.

## Continuing work

When the user says "pls continue":
1. Open with a `TodoWrite` listing 5–10 concrete tasks.
2. Pick from the deferred list at the bottom of [README.md](README.md) — current top of queue: deposits / partial payment, customer-initiated refund flow, SMS reminders (Twilio), settling commission entries from admin UI.
3. Each round ships feature + tests + doc updates (README and/or app_ideas.md).
4. End with a 1-paragraph summary and a one-line offer to continue with a specific next item.

## Don't

- Don't add features not in the spec without asking.
- Don't introduce libraries when an existing one works (Tailwind not styled-components; TanStack Query not SWR; etc.).
- Don't create new docs files when content fits in README or app_ideas.md.
- Don't bypass the service layer by putting business logic in views.
- Don't break the dev-fake PayMongo mode — local dev must stay runnable without an API key.
