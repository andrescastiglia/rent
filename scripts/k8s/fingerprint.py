#!/usr/bin/env python3
"""Order-independent complete row hashes for migration/restore verification.

Only table names, counts and hashes leave PostgreSQL; business data stays there.
Run after freezing writers, not as a substitute for a consistent pg_dump.
"""
import json, os, psycopg2
from psycopg2 import sql
connection = psycopg2.connect(os.getenv('DATABASE_URL', ''))
connection.set_session(readonly=True, isolation_level='REPEATABLE READ')
result = {}
with connection.cursor() as cursor:
    cursor.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
    for (table,) in cursor.fetchall():
        cursor.execute(sql.SQL("SELECT count(*), encode(digest(COALESCE(string_agg(h, '' ORDER BY h),''),'sha256'),'hex') FROM (SELECT encode(digest(row_to_json(t)::text,'sha256'),'hex') h FROM public.{} t) s").format(sql.Identifier(table)))
        count, digest = cursor.fetchone()
        result[table] = {'rows': count, 'sha256': digest}
print(json.dumps(result, sort_keys=True))
connection.close()
