"""
Run the Celery worker:      celery -A celery_worker.celery worker --loglevel=info
Run the Celery beat scheduler (separate process): celery -A celery_worker.celery beat --loglevel=info

On Windows, add `--pool=solo` to the worker command.
"""
from app import create_app
from app.celery_app import init_celery

flask_app = create_app()
celery = init_celery(flask_app)

# Import so every @celery.task in app/tasks.py is registered on this app.
from app import tasks  # noqa: E402,F401
