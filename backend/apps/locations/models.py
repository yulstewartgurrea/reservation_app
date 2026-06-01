"""Philippine Standard Geographic Code (PSGC) location master tables.

Read-only reference data seeded from `data/psgc_hierarchy.json` via the
`seed_psgc` management command. All PSGC `code` values are zero-padded
strings (e.g. "012801001"), so every code is a CharField — never an integer.
"""

from django.db import models


class Region(models.Model):
    code = models.CharField(max_length=12, primary_key=True)
    name = models.CharField(max_length=128)
    region_name = models.CharField(max_length=64, blank=True)
    island_group = models.CharField(max_length=16, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Province(models.Model):
    code = models.CharField(max_length=12, primary_key=True)
    name = models.CharField(max_length=128)
    # one of: province | district | independent-city
    type = models.CharField(max_length=24)
    region = models.ForeignKey(
        Region,
        on_delete=models.CASCADE,
        related_name="provinces",
    )

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class CityMunicipality(models.Model):
    code = models.CharField(max_length=12, primary_key=True)
    name = models.CharField(max_length=128)
    # one of: city | municipality | sub-municipality | independent-city
    type = models.CharField(max_length=24)
    is_capital = models.BooleanField(default=False)
    province = models.ForeignKey(
        Province,
        on_delete=models.CASCADE,
        related_name="cities",
    )

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "Cities / municipalities"

    def __str__(self) -> str:
        return self.name


class Barangay(models.Model):
    code = models.CharField(max_length=12, primary_key=True)
    name = models.CharField(max_length=128)
    city = models.ForeignKey(
        CityMunicipality,
        on_delete=models.CASCADE,
        related_name="barangays",
    )

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name
