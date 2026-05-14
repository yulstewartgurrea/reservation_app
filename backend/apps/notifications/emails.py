"""Notification-specific emails (separate from booking-flow emails)."""

from apps.core.emails import get_frontend_url, send_template_email


def send_maintenance_reminder_email(reminder) -> bool:
    customer = reminder.customer
    return send_template_email(
        to=customer.email,
        subject=f"{reminder.shop.name}: {reminder.title} is due",
        text_template="emails/maintenance_reminder.txt",
        html_template="emails/maintenance_reminder.html",
        context={
            "customer_name": customer.first_name or customer.username or customer.email.split("@")[0],
            "reminder": reminder,
            "shop": reminder.shop,
            "frontend_url": get_frontend_url(),
        },
    )
