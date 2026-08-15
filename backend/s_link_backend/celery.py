import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "s_link_backend.settings")

app = Celery("s_link_backend")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

