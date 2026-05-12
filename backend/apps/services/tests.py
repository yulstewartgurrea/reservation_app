"""Tests for the ServicePhoto endpoints + cover_photo serializer field."""

from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.test_factories import make_service, make_shop, make_shop_owner
from apps.services.models import ServicePhoto


def _fake_image(name: str = "test.png") -> SimpleUploadedFile:
    """Minimal 1x1 PNG for upload tests. Avoids Pillow magic-checking failures."""
    png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00\x01"
        b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    return SimpleUploadedFile(name, png, content_type="image/png")


class ServicePhotoEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner)
        self.service = make_service(shop=self.shop)

    def test_owner_can_upload_photo(self):
        self.client.force_authenticate(self.owner)
        response = self.client.post(
            f"/api/services/{self.service.id}/photos/",
            data={"image": _fake_image()},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(ServicePhoto.objects.filter(service=self.service).exists())

    def test_non_owner_cannot_upload(self):
        outsider = make_shop_owner()
        self.client.force_authenticate(outsider)
        response = self.client.post(
            f"/api/services/{self.service.id}/photos/",
            data={"image": _fake_image()},
            format="multipart",
        )
        self.assertEqual(response.status_code, 403)

    def test_list_photos_is_public(self):
        ServicePhoto.objects.create(service=self.service, image=_fake_image())
        response = self.client.get(f"/api/services/{self.service.id}/photos/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)

    def test_owner_can_delete_photo(self):
        photo = ServicePhoto.objects.create(service=self.service, image=_fake_image())
        self.client.force_authenticate(self.owner)
        response = self.client.delete(
            f"/api/services/{self.service.id}/photos/{photo.id}/"
        )
        self.assertEqual(response.status_code, 204)
        self.assertFalse(ServicePhoto.objects.filter(id=photo.id).exists())

    def test_cover_photo_picks_first_gallery_photo(self):
        ServicePhoto.objects.create(
            service=self.service, image=_fake_image("a.png"), sort_order=0
        )
        ServicePhoto.objects.create(
            service=self.service, image=_fake_image("b.png"), sort_order=1
        )
        response = self.client.get(f"/api/services/{self.service.id}/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIsNotNone(body["cover_photo"])
        # Cover is the *first* photo (sort_order 0). Django may add a suffix to
        # avoid filename collisions, so match the stem rather than the literal name.
        self.assertRegex(body["cover_photo"], r"/services/a[\w]*\.png$")
        self.assertEqual(len(body["gallery"]), 2)
