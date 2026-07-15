#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <postgres-container-id-or-name>" >&2
    exit 2
fi

container="$1"
pgvector_version="0.8.5"
pgvector_sha256="6f88a5cbdde31666f4b6c1a6b75c51dcbeffe58f9a7d2b26e502d5a6e5e14d44"

docker exec --user root \
    --env "PGVECTOR_VERSION=$pgvector_version" \
    --env "PGVECTOR_SHA256=$pgvector_sha256" \
    "$container" bash -euo pipefail -c '
        pg_major="$(pg_config --version | awk "{print \$2}" | cut -d. -f1)"
        apt-get update
        apt-get install -y --no-install-recommends build-essential ca-certificates curl "postgresql-server-dev-${pg_major}"
        curl --fail --location --show-error \
            "https://github.com/pgvector/pgvector/archive/refs/tags/v${PGVECTOR_VERSION}.tar.gz" \
            --output /tmp/pgvector.tar.gz
        echo "${PGVECTOR_SHA256}  /tmp/pgvector.tar.gz" | sha256sum --check --strict
        mkdir /tmp/pgvector
        tar --extract --gzip --file /tmp/pgvector.tar.gz --directory /tmp/pgvector --strip-components=1
        make -C /tmp/pgvector OPTFLAGS=""
        make -C /tmp/pgvector install
        rm -rf /tmp/pgvector /tmp/pgvector.tar.gz /var/lib/apt/lists/*
    '
