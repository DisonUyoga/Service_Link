FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY ./scripts /scripts
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt 

COPY . /app/

EXPOSE 8000

# Convert Windows line endings and make executable
RUN sed -i 's/\r$//' /scripts/run.sh && chmod +x /scripts/run.sh

ENV PATH="/scripts:/py/bin:$PATH"

# USER app

CMD ["sh", "/scripts/run.sh"]