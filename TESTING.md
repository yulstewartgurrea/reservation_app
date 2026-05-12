# Testing report

This document maps every use case from [app_ideas.md §9](app_ideas.md) to the tests that cover it, the result, and any bugs found and fixed during testing.

## Headline

| Layer | Result |
|-------|--------|
| **Backend integration tests** | **99 / 99 passing** (added 67, baseline was 32) |
| **Frontend TypeScript type check** | **0 errors** across 30 pages + 7 components |
| **Frontend production build** | **All 31 routes compile** (`next build` succeeds) |
| **Frontend HTTP smoke test** | **All 30 UI routes return 200** against `next start` |
| **Real bugs found & fixed** | **4** (see [§ Bugs found](#bugs-found-and-fixed)) |

## How to reproduce

```bash
# Backend
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py makemigrations --settings=config.test_settings
.venv/bin/python manage.py test --settings=config.test_settings

# Frontend
cd frontend
npm install
npx tsc --noEmit
npx next build
npx next start -p 3001 &
for r in / /login /register /shops /services /reservations /dashboard /admin; do
  curl -sS -o /dev/null -w "%{http_code} $r\n" http://localhost:3001$r
done
```

The integration tests use sqlite in-memory + in-memory channels + eager Celery (`config.test_settings`) — no Docker, no Postgres, no Redis required.

## Bugs found and fixed

These were real production bugs surfaced by the integration test pass:

1. **`AttributeError: module 'rest_framework.permissions' has no attribute 'PermissionDenied'`** in `apps/services/views.py` — wrong import path. Fixed by importing from `rest_framework.exceptions`.
2. **`TypeError: create_walk_in() missing 1 required keyword-only argument: 'staff'`** — the serializer omits the field when not provided, so the keyword arg blew up. Fixed by giving `staff` a default of `None` in the function signature.
3. **`TypeError: create_customer_reservation() missing 1 required keyword-only argument: 'staff'`** — same root cause as #2, in the customer booking path.
4. **`useSearchParams() should be wrapped in a suspense boundary`** — Next.js 15 static-generation requirement that broke `next build`. Fixed by wrapping each affected page in a `<Suspense>` boundary (`/reset-password`, `/verify-email`, `/shops`, `/shops/[id]/book`).

Bonus cleanup found while testing:
- `Favorite` model had no `Meta.ordering`, causing a `UnorderedObjectListWarning` from DRF pagination. Added `ordering = ["-created_at"]`.

## Use case coverage

Phase tags map to [app_ideas.md §9](app_ideas.md). Each row shows: the use case, the test file/method, and pass/fail.

### §9.1 Shop owner use cases

| Use case | Test | Result |
|---|---|---|
| Register as shop owner | `ShopOwnerAccountTests::test_register_as_shop_owner` | ✅ |
| Login | `ShopOwnerAccountTests::test_login_returns_jwt_pair` | ✅ |
| `me` endpoint returns role | `ShopOwnerAccountTests::test_me_endpoint_returns_role` | ✅ |
| Create new shop | `MultiShopOwnershipTests::test_create_shop_seeds_default_hours` | ✅ |
| Shop starts in `pending` | `MultiShopOwnershipTests::test_create_shop_starts_pending` | ✅ |
| Publish then pause shop | `MultiShopOwnershipTests::test_owner_can_publish_then_pause_shop` | ✅ |
| Only owner can publish | `MultiShopOwnershipTests::test_only_owner_can_publish` | ✅ |
| `mine` lists only owner's shops | `MultiShopOwnershipTests::test_mine_lists_only_owners_shops` | ✅ |
| Edit shop | `MultiShopOwnershipTests::test_owner_can_edit_shop` | ✅ |
| Delete shop | `MultiShopOwnershipTests::test_owner_can_delete_shop` | ✅ |
| `GET hours` returns 7 rows | `HoursManagementTests::test_get_hours_returns_seven_rows` | ✅ |
| `PUT hours` updates all days | `HoursManagementTests::test_put_hours_updates_all_days` | ✅ |
| Create date override | `HoursManagementTests::test_create_override_for_holiday` | ✅ |
| Delete override | `HoursManagementTests::test_delete_override` | ✅ |
| Owner cannot update other shop's hours | `ShopHoursAPITests::test_non_owner_cannot_update_hours` | ✅ |
| Override marks day closed → 0 slots | `AvailabilityWithOverridesTests::test_override_marking_day_closed_yields_no_slots` | ✅ |
| Override narrows hours | `AvailabilityWithOverridesTests::test_override_with_narrower_hours_limits_slots` | ✅ |
| No slots in the past | `AvailabilityWithOverridesTests::test_no_slots_in_the_past` | ✅ |
| Add a service | `ServiceCRUDTests::test_create_service` | ✅ |
| Cannot add service to other shop | `ServiceCRUDTests::test_cannot_create_service_for_other_shop` | ✅ |
| Edit service | `ServiceCRUDTests::test_edit_service` | ✅ |
| Delete service | `ServiceCRUDTests::test_delete_service` | ✅ |
| Add staff | `StaffManagementTests::test_add_staff` | ✅ |
| Deactivate staff | `StaffManagementTests::test_deactivate_staff` | ✅ |
| Set per-staff weekly hours | `StaffManagementTests::test_set_staff_weekly_hours` | ✅ |
| Inbox filtered to own shops | `ReservationInboxTests::test_inbox_lists_only_own_shop_reservations` | ✅ |
| Confirm a reservation | `ReservationInboxTests::test_owner_can_confirm_reservation` | ✅ |
| Complete writes commission | `ReservationInboxTests::test_owner_can_complete_reservation_and_writes_commission` | ✅ |
| Mark no-show | `ReservationInboxTests::test_owner_can_mark_no_show` | ✅ |
| Walk-in booking creates confirmed reservation | `ReservationInboxTests::test_owner_walk_in_creates_confirmed_reservation` | ✅ |
| Analytics endpoint shape | `ShopAnalyticsTests::test_analytics_endpoint_returns_expected_shape` | ✅ |
| Analytics rejects non-owner | `ShopAnalyticsTests::test_analytics_rejects_non_owner` | ✅ |

### §9.2 Customer use cases

| Use case | Test | Result |
|---|---|---|
| Register as customer | `CustomerAccountTests::test_register_as_customer` | ✅ |
| Register rejects `admin` role | `CustomerAccountTests::test_register_rejects_invalid_role` | ✅ |
| Public shop list | `DiscoveryTests::test_list_shops_public` | ✅ |
| List excludes pending shops | `DiscoveryTests::test_list_excludes_pending_shops` | ✅ |
| Search by name | `DiscoveryTests::test_search_by_name` | ✅ |
| Filter by city | `DiscoveryTests::test_filter_by_city` | ✅ |
| `nearby` returns closest first | `DiscoveryTests::test_nearby_returns_closest_first` | ✅ |
| `nearby` validates inputs | `DiscoveryTests::test_nearby_validates_inputs` | ✅ |
| Cross-shop service search | `DiscoveryTests::test_cross_shop_service_search` | ✅ |
| Availability returns slots | `BookingFlowTests::test_availability_returns_slots` | ✅ |
| Book pending reservation | `BookingFlowTests::test_book_creates_pending_reservation` | ✅ |
| Book with specific staff | `BookingFlowTests::test_book_with_specific_staff` | ✅ |
| Book with online payment | `BookingFlowTests::test_book_with_online_payment_method` | ✅ |
| Cannot book service from different shop | `BookingFlowTests::test_cannot_book_service_from_different_shop` | ✅ |
| List only own reservations | `MyReservationsTests::test_lists_only_own_reservations` | ✅ |
| Customer can cancel | `MyReservationsTests::test_customer_can_cancel_own_reservation` | ✅ |
| Customer can reschedule | `MyReservationsTests::test_customer_can_reschedule_own_reservation` | ✅ |
| Customer cannot complete | `MyReservationsTests::test_customer_cannot_complete_own_reservation` | ✅ |
| Leave review on completed | `ReviewFlowTests::test_leave_review_on_completed_reservation` | ✅ |
| Cannot review uncompleted | `ReviewFlowTests::test_cannot_review_uncompleted_reservation` | ✅ |
| Cannot review someone else's reservation | `ReviewFlowTests::test_cannot_review_someone_elses_reservation` | ✅ |
| Delete own review | `ReviewFlowTests::test_customer_can_delete_own_review` | ✅ |
| Save favorite | `FavoritesFlowTests::test_save_favorite` | ✅ |
| Unsave favorite | `FavoritesFlowTests::test_unsave_favorite` | ✅ |
| List only own favorites | `FavoritesFlowTests::test_list_only_own_favorites` | ✅ |
| Restricted user cannot book | `CustomerStrikeTests::test_restricted_user_cannot_book` | ✅ |

### §9 Cross-cutting

| Use case | Test | Result |
|---|---|---|
| Email-token round trip | `EmailTokenTests::test_round_trip` | ✅ |
| Garbage email token rejected | `EmailTokenTests::test_garbage_token_invalid` | ✅ |
| Expired email token rejected | `EmailTokenTests::test_expired_token_rejected` | ✅ |
| Reset-token round trip | `ResetTokenTests::test_round_trip` | ✅ |
| Password change invalidates reset token | `ResetTokenTests::test_password_change_invalidates_existing_token` | ✅ |
| Verify-email endpoint | `AuthEndpointTests::test_verify_email_endpoint_marks_user_verified` | ✅ |
| Reset request doesn't leak account existence | `AuthEndpointTests::test_password_reset_request_does_not_leak` | ✅ |
| Reset confirm changes password | `AuthEndpointTests::test_password_reset_confirm_changes_password` | ✅ |
| Reset confirm rejects short password | `AuthEndpointTests::test_password_reset_confirm_rejects_short_password` | ✅ |
| Reservation lifecycle: pending creation + history | `ReservationCreateTests::test_create_reservation_writes_history` | ✅ |
| Conflict detection | `ReservationCreateTests::test_double_booking_same_staff_blocked` | ✅ |
| Walk-in commission excluded | `ReservationCreateTests::test_walk_in_excluded_from_commission` | ✅ |
| Commission rate per-shop override | `CommissionTests::test_commission_uses_shop_override_when_set` | ✅ |
| Commission falls back to platform default | `CommissionTests::test_commission_falls_back_to_platform_default` | ✅ |
| Late cancel inside window earns strike | `StrikeTests::test_late_cancel_inside_window_earns_strike` | ✅ |
| Early cancel no strike | `StrikeTests::test_early_cancel_outside_window_no_strike` | ✅ |
| Strike limit restricts user | `StrikeTests::test_strike_limit_restricts_user` | ✅ |
| Reschedule moves times | `RescheduleTests::test_reschedule_moves_times` | ✅ |
| Reschedule blocked when completed | `RescheduleTests::test_reschedule_blocked_when_completed` | ✅ |
| New booking pushes notification to shop owner | `NotificationCreationViaSignalsTests::test_new_booking_pushes_notification_to_shop_owner` | ✅ |
| New booking pushes notification to customer | `NotificationCreationViaSignalsTests::test_new_booking_pushes_notification_to_customer` | ✅ |
| Notifications API lists only own | `NotificationRESTAPITests::test_list_returns_only_own_notifications` | ✅ |
| Mark one notification read | `NotificationRESTAPITests::test_mark_one_read` | ✅ |
| Mark all read | `NotificationRESTAPITests::test_mark_all_read` | ✅ |
| Unauthenticated cannot list notifications | `NotificationRESTAPITests::test_unauthenticated_cannot_list` | ✅ |
| Customer cannot access admin overview | `AdminPermissionsTests::test_customer_cannot_access_admin_overview` | ✅ |
| Shop owner cannot access admin overview | `AdminPermissionsTests::test_shop_owner_cannot_access_admin_overview` | ✅ |
| Admin can access admin overview | `AdminPermissionsTests::test_admin_can_access_admin_overview` | ✅ |
| Pending shops appear in queue | `AdminApprovalFlowTests::test_pending_shops_appears_in_queue` | ✅ |
| Approve shop flips status | `AdminApprovalFlowTests::test_approve_shop_flips_status` | ✅ |
| Admin overview shape | `AdminOverviewShapeTests::test_overview_shape` | ✅ |
| Admin commission endpoint | `AdminOverviewShapeTests::test_commission_endpoint` | ✅ |
| PayMongo dev-fake checkout URL | `StartCheckoutDevModeTests::test_start_checkout_returns_dev_fake_url_when_unconfigured` | ✅ |
| `start_checkout` is idempotent | `StartCheckoutDevModeTests::test_start_checkout_is_idempotent` | ✅ |
| `mark_paid` auto-confirms reservation | `StartCheckoutDevModeTests::test_mark_paid_auto_confirms_pending_reservation` | ✅ |
| Valid PayMongo webhook signature | `WebhookSignatureTests::test_valid_signature_marks_paid` | ✅ |
| Invalid PayMongo webhook signature | `WebhookSignatureTests::test_bad_signature_rejected` | ✅ |
| Checkout endpoint authorization | `CheckoutEndpointTests::test_checkout_endpoint_requires_owner_of_reservation` | ✅ |
| Checkout returns URL | `CheckoutEndpointTests::test_checkout_endpoint_returns_url` | ✅ |
| Dev-confirm completes payment | `CheckoutEndpointTests::test_dev_confirm_completes_payment` | ✅ |

### Frontend route smoke test

Method: `next build` to compile every route, then `next start` and `curl` each path. All 30 returned **200 OK**.

| Route | Method | Status |
|---|---|---|
| `/` | GET | 200 ✅ |
| `/login` | GET | 200 ✅ |
| `/register` | GET | 200 ✅ |
| `/forgot-password` | GET | 200 ✅ |
| `/reset-password` | GET | 200 ✅ |
| `/verify-email` | GET | 200 ✅ |
| `/shops` | GET | 200 ✅ |
| `/services` | GET | 200 ✅ |
| `/favorites` | GET | 200 ✅ |
| `/reservations` | GET | 200 ✅ |
| `/dashboard` | GET | 200 ✅ |
| `/admin` | GET | 200 ✅ |
| `/admin/commission` | GET | 200 ✅ |
| `/admin/pending-shops` | GET | 200 ✅ |
| `/shops/[id]` | GET | 200 ✅ |
| `/shops/[id]/book` | GET | 200 ✅ |
| `/reservations/[id]/review` | GET | 200 ✅ |
| `/reservations/[id]/reschedule` | GET | 200 ✅ |
| `/dashboard/shops/new` | GET | 200 ✅ |
| `/dashboard/shops/[id]` | GET | 200 ✅ |
| `/dashboard/shops/[id]/edit` | GET | 200 ✅ |
| `/dashboard/shops/[id]/hours` | GET | 200 ✅ |
| `/dashboard/shops/[id]/overrides` | GET | 200 ✅ |
| `/dashboard/shops/[id]/photos` | GET | 200 ✅ |
| `/dashboard/shops/[id]/staff` | GET | 200 ✅ |
| `/dashboard/shops/[id]/staff/[staffId]/hours` | GET | 200 ✅ |
| `/dashboard/shops/[id]/services/new` | GET | 200 ✅ |
| `/dashboard/shops/[id]/services/[serviceId]/edit` | GET | 200 ✅ |
| `/dashboard/shops/[id]/walk-in` | GET | 200 ✅ |
| `/dashboard/shops/[id]/analytics` | GET | 200 ✅ |

## What this testing pass does not cover

- **Real browser interaction** (mouse clicks, form fills, JS-driven navigation). The integration tests cover the API the UI calls; a Playwright pass with mouse/keyboard would add additional confidence. Not run here because installing Chromium + headless drivers in this environment is heavy.
- **Visual regression / screenshot diffing.** Same reason as above.
- **Real PayMongo sandbox round-trip.** The dev-fake mode is exercised; real PayMongo calls are mocked behind the `_is_configured()` check.
- **Real SMTP delivery.** Email tests use Django's locmem backend; production requires a real SMTP provider.
- **Concurrency / load.** Single-request tests only.

## Files

| Path | Purpose |
|---|---|
| [backend/apps/core/test_factories.py](backend/apps/core/test_factories.py) | Reusable test fixture builders (`make_customer`, `make_shop`, `make_reservation`, etc.) |
| [backend/apps/shops/tests/test_shop_owner_flows.py](backend/apps/shops/tests/test_shop_owner_flows.py) | §9.1 — 28 tests |
| [backend/apps/reservations/tests/test_customer_flows.py](backend/apps/reservations/tests/test_customer_flows.py) | §9.2 — 26 tests |
| [backend/apps/notifications/tests.py](backend/apps/notifications/tests.py) | Notifications REST + signal-driven creation — 6 tests |
| [backend/apps/admin_panel/tests.py](backend/apps/admin_panel/tests.py) | Admin permissions + approval + ledger — 7 tests |
| [backend/apps/reservations/tests/test_lifecycle.py](backend/apps/reservations/tests/test_lifecycle.py) | Reservation lifecycle, commission, strikes, reschedule (existing) — 11 tests |
| [backend/apps/payments/tests/test_payments.py](backend/apps/payments/tests/test_payments.py) | PayMongo lifecycle + webhook signing (existing) — 7 tests |
| [backend/apps/accounts/tests/test_tokens.py](backend/apps/accounts/tests/test_tokens.py) | Email + reset tokens, auth endpoints (existing) — 9 tests |
| [backend/apps/shops/tests/test_hours_and_availability.py](backend/apps/shops/tests/test_hours_and_availability.py) | Hours API + availability (existing) — 5 tests |
