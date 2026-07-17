# syntax=docker/dockerfile:1

ARG POSTGIS_IMAGE=postgis/postgis:16-3.5-alpine
ARG GO_IMAGE=golang:1.26.5-alpine

FROM ${POSTGIS_IMAGE} AS pgvector-builder

ARG PG_MAJOR=16
ARG PGVECTOR_VERSION=0.8.5
ARG PGVECTOR_SHA256=6f88a5cbdde31666f4b6c1a6b75c51dcbeffe58f9a7d2b26e502d5a6e5e14d44

RUN apk add --no-cache \
        build-base \
        ca-certificates \
        curl \
        postgresql${PG_MAJOR}-dev \
    && curl --fail --location --show-error \
        "https://github.com/pgvector/pgvector/archive/refs/tags/v${PGVECTOR_VERSION}.tar.gz" \
        --output /tmp/pgvector.tar.gz \
    && echo "${PGVECTOR_SHA256}  /tmp/pgvector.tar.gz" | sha256sum -c \
    && mkdir /tmp/pgvector \
    && tar --extract --gzip --file /tmp/pgvector.tar.gz \
        --directory /tmp/pgvector --strip-components=1 \
    && make -C /tmp/pgvector OPTFLAGS="" with_llvm=no \
    && make -C /tmp/pgvector install with_llvm=no DESTDIR=/tmp/pgvector-install

FROM ${GO_IMAGE} AS gosu-builder

ARG GOSU_VERSION=1.19

RUN CGO_ENABLED=0 go install "github.com/tianon/gosu@${GOSU_VERSION}"

FROM ${POSTGIS_IMAGE}

ARG PG_MAJOR=16
ARG PGVECTOR_VERSION=0.8.5

LABEL org.opencontainers.image.title="RentFlow PostgreSQL" \
      org.opencontainers.image.description="PostgreSQL 16 with PostGIS and pgvector" \
      org.opencontainers.image.version="16-postgis3.5-pgvector${PGVECTOR_VERSION}" \
      org.opencontainers.image.source="https://github.com/pgvector/pgvector"

COPY --from=pgvector-builder \
    /tmp/pgvector-install/usr/local/lib/postgresql/vector.so \
    /usr/local/lib/postgresql/vector.so
COPY --from=pgvector-builder \
    /tmp/pgvector-install/usr/local/share/postgresql/extension/ \
    /usr/local/share/postgresql/extension/
COPY --from=gosu-builder /go/bin/gosu /usr/local/bin/gosu
