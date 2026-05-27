from django.core.management.base import BaseCommand
from django.utils.text import slugify

from apps.shops.models import Category


# Single shared taxonomy. Shops tag themselves with one or more of these
# (M:N); services pick exactly one (FK). The unified `apps.shops.Category`
# table backs both `/api/shops/categories/` and `/api/services/categories/`
# so the two browse-page sidebars show the same options.
CATEGORIES = [
    "Hair & Beauty",
    "Wellness",
    "Home Services",
    "Automotive",
    "Fitness & Training",
    "Pet Services",
    "Tech / Repair",
]


class Command(BaseCommand):
    help = "Seed default categories used by both shops and services."

    def handle(self, *args, **options):
        created = 0
        for name in CATEGORIES:
            _, was_created = Category.objects.get_or_create(
                slug=slugify(name), defaults={"name": name}
            )
            if was_created:
                created += 1

        self.stdout.write(
            self.style.SUCCESS(f"Seeded {created} categories (total: {Category.objects.count()}).")
        )
