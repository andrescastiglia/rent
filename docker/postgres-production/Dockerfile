# syntax=docker/dockerfile:1
FROM postgres:17.9-bookworm AS extensions
RUN apt-get update && apt-get install -y --no-install-recommends build-essential ca-certificates curl pkg-config libgeos-dev libproj-dev libjson-c-dev libxml2-dev libpq-dev postgresql-server-dev-17 && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN curl -fsSL https://download.osgeo.org/postgis/source/postgis-3.5.3.tar.gz -o postgis.tar.gz \
 && echo '650e44de788d38175e3719df1d2ca4356bd987f54fe3d2030808de76464a2a06  postgis.tar.gz' | sha256sum -c - \
 && tar -xzf postgis.tar.gz && cd postgis-3.5.3 \
 && ./configure --with-pgconfig=/usr/lib/postgresql/17/bin/pg_config --without-raster --without-topology --without-protobuf --without-sfcgal \
 && make -j2 && make install
RUN curl -fsSL https://github.com/pgvector/pgvector/archive/refs/tags/v0.8.5.tar.gz -o vector.tar.gz \
 && echo '6f88a5cbdde31666f4b6c1a6b75c51dcbeffe58f9a7d2b26e502d5a6e5e14d44  vector.tar.gz' | sha256sum -c - \
 && tar -xzf vector.tar.gz && cd pgvector-0.8.5 && make PG_CONFIG=/usr/lib/postgresql/17/bin/pg_config OPTFLAGS='' -j2 && make PG_CONFIG=/usr/lib/postgresql/17/bin/pg_config install
FROM postgres:17.9-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libgeos-c1v5 libproj25 libjson-c5 libxml2 && rm -rf /var/lib/apt/lists/*
COPY --from=extensions /usr/lib/postgresql/17/lib/ /usr/lib/postgresql/17/lib/
COPY --from=extensions /usr/share/postgresql/17/extension/ /usr/share/postgresql/17/extension/
ENV PGDATA=/var/lib/postgresql/data/pgdata
USER postgres
