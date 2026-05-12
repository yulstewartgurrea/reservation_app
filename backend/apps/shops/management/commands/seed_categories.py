from django.core.management.base import BaseCommand
from django.utils.text import slugify

from apps.services.models import ServiceCategory
from apps.shops.models import ShopCategory


SHOP_CATEGORIES = [
    "Hair & Beauty",
    "Wellness",
    "Home Services",
    "Automotive",
    "Fitness & Training",
    "Pet Services",
    "Tech / Repair",
]

SERVICE_CATEGORIES = [
    "Haircut",
    "Hair Color",
    "Manicure",
    "Pedicure",
    "Massage",
    "Spa",
    "Sauna",
    "Aircon Cleaning",
    "Plumbing",
    "Electrical",
    "Pest Control",
    "Car Repair",
    "Car Wash",
    "Car Detailing",
    "Tire Change",
    "Personal Training",
    "Yoga Session",
    "Pet Grooming",
    "Vet Checkup",
    "Phone Repair",
    "Laptop Repair",
]


class Command(BaseCommand):
    help = "Seed default shop and service categories."

    def handle(self, *args, **options):
        created_shop = 0
        for name in SHOP_CATEGORIES:
            _, created = ShopCategory.objects.get_or_create(
                slug=slugify(name), defaults={"name": name}
            )
            if created:
                created_shop += 1

        created_service = 0
        for name in SERVICE_CATEGORIES:
            _, created = ServiceCategory.objects.get_or_create(
                slug=slugify(name), defaults={"name": name}
            )
            if created:
                created_service += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {created_shop} shop categories and {created_service} service categories."
            )
        )
