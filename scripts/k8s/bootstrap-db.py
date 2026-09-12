#!/usr/bin/env python3
import os, psycopg2
from psycopg2 import sql
connection = psycopg2.connect(dbname='postgres')
connection.autocommit = True
with connection.cursor() as cursor:
    for role, key in [('rent_user','APP_PASSWORD'),('rent_backup','BACKUP_PASSWORD')]:
        cursor.execute('SELECT 1 FROM pg_roles WHERE rolname=%s', (role,))
        if not cursor.fetchone(): cursor.execute(sql.SQL('CREATE ROLE {} LOGIN').format(sql.Identifier(role)))
        cursor.execute(sql.SQL('ALTER ROLE {} PASSWORD {}').format(sql.Identifier(role),sql.Literal(os.environ[key])))
    cursor.execute('GRANT pg_read_all_data TO rent_backup')
    cursor.execute("SELECT 1 FROM pg_database WHERE datname='rent_db'")
    if not cursor.fetchone(): cursor.execute("CREATE DATABASE rent_db OWNER rent_user TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8'")
connection.close()
connection = psycopg2.connect(dbname='rent_db')
connection.autocommit = True
with connection.cursor() as cursor:
    for extension in ['postgis','vector','unaccent','pgcrypto','uuid-ossp']:
        cursor.execute(sql.SQL('CREATE EXTENSION IF NOT EXISTS {}').format(sql.Identifier(extension)))
connection.close()
print('Dedicated Rent database, roles and extensions ready.')
