# syntax=docker/dockerfile:1
FROM postgres:17.9-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends restic python3 python3-psycopg2 curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY migrations /app/migrations
COPY scripts/k8s /app/scripts
WORKDIR /app
USER postgres
ENTRYPOINT []
CMD ["bash", "/app/scripts/backup.sh"]
