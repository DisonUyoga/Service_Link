#!/bin/sh
set -e

echo "Applying Django migrations..."
python manage.py makemigrations
python manage.py migrate

echo "Starting service: $*"
exec "$@"

