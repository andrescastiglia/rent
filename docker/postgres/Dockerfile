# syntax=docker/dockerfile:1

ARG POSTGIS_IMAGE=postgis/postgis:16-3.5

FROM ${POSTGIS_IMAGE} AS pgvector-builder

ARG PG_MAJOR=16
ARG PGVECTOR_VERSION=0.8.5
ARG PGVECTOR_SHA256=6f88a5cbdde31666f4b6c1a6b75c51dcbeffe58f9a7d2b26e502d5a6e5e14d44

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        postgresql-server-dev-${PG_MAJOR} \
    && curl --fail --location --show-error \
        "https://github.com/pgvector/pgvector/archive/refs/tags/v${PGVECTOR_VERSION}.tar.gz" \
        --output /tmp/pgvector.tar.gz \
    && echo "${PGVECTOR_SHA256}  /tmp/pgvector.tar.gz" | sha256sum --check --strict \
    && mkdir /tmp/pgvector \
    && tar --extract --gzip --file /tmp/pgvector.tar.gz \
        --directory /tmp/pgvector --strip-components=1 \
    && make -C /tmp/pgvector OPTFLAGS="" \
    && make -C /tmp/pgvector install DESTDIR=/tmp/pgvector-install

FROM ${POSTGIS_IMAGE}

ARG PG_MAJOR=16
ARG PGVECTOR_VERSION=0.8.5

LABEL org.opencontainers.image.title="RentFlow PostgreSQL" \
      org.opencontainers.image.description="PostgreSQL 16 with PostGIS and pgvector" \
      org.opencontainers.image.version="16-postgis3.5-pgvector${PGVECTOR_VERSION}" \
      org.opencontainers.image.source="https://github.com/pgvector/pgvector"

COPY --from=pgvector-builder \
    /tmp/pgvector-install/usr/lib/postgresql/${PG_MAJOR}/lib/vector.so \
    /usr/lib/postgresql/${PG_MAJOR}/lib/vector.so
COPY --from=pgvector-builder \
    /tmp/pgvector-install/usr/share/postgresql/${PG_MAJOR}/extension/ \
    /usr/share/postgresql/${PG_MAJOR}/extension/
