from django.core.management.base import BaseCommand

from apps.locations.services import seed_psgc


class Command(BaseCommand):
    help = "Seed PSGC regions / provinces / cities / barangays from the bundled JSON."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Wipe and reseed all four PSGC tables even if already populated.",
        )

    def handle(self, *args, **options):
        result = seed_psgc(force=options["force"])

        if result.get("skipped"):
            self.stdout.write(
                self.style.WARNING(
                    "PSGC data already present — skipping. Use --force to reseed."
                )
            )
            return

        self.stdout.write(
            self.style.SUCCESS(
                "Seeded PSGC: "
                f"{result['regions']} regions, "
                f"{result['provinces']} provinces, "
                f"{result['cities']} cities/municipalities, "
                f"{result['barangays']} barangays."
            )
        )
