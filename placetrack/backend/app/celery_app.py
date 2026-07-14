import os

from celery import Celery
from celery.schedules import crontab

celery = Celery(
    "placetrack",
    broker=os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/2"),
    backend=os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/3"),
    include=["app.tasks"],
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    result_expires=60 * 60 * 24,  # 1 day
    beat_schedule={
        # (a) Scheduled Job - Daily deadline reminders, every day at 09:00 UTC
        "daily-deadline-reminders": {
            "task": "app.tasks.send_daily_deadline_reminders",
            "schedule": crontab(hour=9, minute=0),
        },
        # (b) Scheduled Job - Monthly Activity Report, 1st of the month, 06:00 UTC
        "monthly-activity-report": {
            "task": "app.tasks.generate_monthly_activity_report",
            "schedule": crontab(hour=6, minute=0, day_of_month=1),
        },
    },
)


def init_celery(flask_app):
    """Make every celery task run inside `flask_app`'s application context
    so tasks can freely use the ORM, current_app.config, etc."""

    class ContextTask(celery.Task):
        def __call__(self, *args, **kwargs):
            with flask_app.app_context():
                return self.run(*args, **kwargs)

    celery.Task = ContextTask
    return celery
