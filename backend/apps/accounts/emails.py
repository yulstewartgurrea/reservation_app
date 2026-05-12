"""Account-flow emails: verify + password reset."""

from apps.core.emails import get_frontend_url, send_template_email


def send_verification_email(user, token: str) -> bool:
    link = f"{get_frontend_url()}/verify-email?token={token}"
    return send_template_email(
        to=user.email,
        subject="Verify your Reserva email",
        text_template="emails/verify_email.txt",
        html_template="emails/verify_email.html",
        context={"user": user, "link": link},
    )


def send_password_reset_email(user, token: str) -> bool:
    link = f"{get_frontend_url()}/reset-password?token={token}"
    return send_template_email(
        to=user.email,
        subject="Reset your Reserva password",
        text_template="emails/password_reset.txt",
        html_template="emails/password_reset.html",
        context={"user": user, "link": link},
    )
