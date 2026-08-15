#!/bin/sh

set -e

# Collect static files
python manage.py collectstatic --noinput
python manage.py makemigrations
python manage.py migrate

# Start the Gunicorn server
exec gunicorn --bind :8000 --workers 2 --threads 2 --timeout 120 --reload s_link_backend.wsgi:application