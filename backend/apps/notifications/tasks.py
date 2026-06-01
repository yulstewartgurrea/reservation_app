"""Celery tasks for the notifications app — maintenance reminder dispatcher."""

from celery import shared_task


@shared_task
def dispatch_due_maintenance_reminders() -> str:
    from .services import dispatch_due_maintenance_reminders as _dispatch

    result = _dispatch()
    return f"maintenance reminders: sent={result['sent']} failed={result['failed']}"
