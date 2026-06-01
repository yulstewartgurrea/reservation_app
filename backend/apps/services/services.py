"""Business logic for the services app.

Mirrors the service-layer pattern used in `apps.reservations.services`: views
stay thin, multi-step writes are wrapped in `@transaction.atomic`, and no
business rule lives in a serializer or a Django signal.
"""

from decimal import Decimal

from django.db import transaction

from .models import Service, ServicePriceHistory


@transaction.atomic
def update_service(*, service: Service, validated_data: dict, changed_by=None) -> Service:
    """Apply a validated update to a Service, recording price changes.

    The price comparison is made against the *persisted* value (re-read inside
    the transaction) — not whatever is on the in-memory instance — so a
    price change is detected exactly once and a single `ServicePriceHistory`
    row is appended atomically with the update. Updates that don't move the
    price create no history row.
    """
    old_price: Decimal = Service.objects.values_list("price", flat=True).get(
        pk=service.pk
    )

    for field, value in validated_data.items():
        setattr(service, field, value)
    service.save()

    new_price: Decimal = service.price
    if new_price != old_price:
        ServicePriceHistory.objects.create(
            service=service,
            old_price=old_price,
            new_price=new_price,
            changed_by=changed_by,
        )
    return service
