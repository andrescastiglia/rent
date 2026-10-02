"""Parser regressions and isolated PostgreSQL atomicity/concurrency checks."""
import hashlib
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import uuid

BUILDER = Path(__file__).resolve().parents[1] / "build-runner.py"
SPEC = importlib.util.spec_from_file_location("migration_builder", BUILDER)
builder = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = builder
SPEC.loader.exec_module(builder)


class ParserTests(unittest.TestCase):
    def test_function_body_and_comments_do_not_end_the_outer_transaction(self):
        sql = "-- BEGIN;\nBEGIN; DO $$ BEGIN PERFORM 'COMMIT;'; END $$; /* COMMIT; */ COMMIT;"
        body = builder.atomic_body(sql)
        self.assertIn("DO $$ BEGIN PERFORM 'COMMIT;'; END $$;", body)
        self.assertEqual(len(builder.statements(body)), 1)

    def test_rejects_commands_and_transaction_escape(self):
        for sql in [r"\! touch /tmp/escape", "BEGIN; COMMIT; COMMIT;", "ROLLBACK;", "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;"]:
            with self.subTest(sql=sql), self.assertRaises(ValueError):
                builder.atomic_body(sql)

    def test_unterminated_quotes_and_comments_fail(self):
        for sql in ["SELECT 'open", "DO $$ open", "/* open"]:
            with self.subTest(sql=sql), self.assertRaises(ValueError):
                builder.statements(sql)

    def test_quoted_delimiters_nested_comments_and_escape_strings_are_preserved(self):
        source = r'''BEGIN; SELECT E'quote\';COMMIT;', "COMMIT;"; /* outer /* BEGIN; */ inner */ COMMIT;'''
        body = builder.atomic_body(source)
        self.assertEqual(len(builder.statements(body)), 1)
        self.assertIn(r"E'quote\';COMMIT;'", body)

    def test_transaction_pairs_must_be_ordered_and_unambiguous(self):
        for source in ["COMMIT; BEGIN;", "BEGIN READ ONLY; COMMIT;", "BEGIN; SELECT 1;", "END;", "SAVEPOINT s;", "START TRANSACTION;"]:
            with self.subTest(source=source), self.assertRaises(ValueError):
                builder.atomic_body(source)

    def test_builder_rejects_invalid_lock_and_unknown_baseline(self):
        for timeout in [0, 3601]:
            with self.subTest(timeout=timeout), self.assertRaises(ValueError):
                builder.build_sql([], lock_timeout=timeout)
        with self.assertRaises(ValueError):
            builder.build_sql([], baseline_through="001_missing.sql")

    def test_inventory_checksum_covers_the_exact_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "001_test.sql"
            data = b"CREATE TABLE test(id int);\n"
            path.write_bytes(data)
            self.assertEqual(builder.inventory(Path(directory))[0].checksum, hashlib.sha256(data).hexdigest())
            (Path(directory) / "invalid.sql").write_text("SELECT 1;")
            with self.assertRaises(ValueError):
                builder.inventory(Path(directory))


@unittest.skipUnless(os.environ.get("MIGRATION_TESTS_INTEGRATION") == "true", "requires an isolated local PostgreSQL container")
class PostgreSQLTests(unittest.TestCase):
    def setUp(self):
        self.database = "rent_migration_check_" + uuid.uuid4().hex
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.psql("postgres", f'CREATE DATABASE "{self.database}";')
        self.addCleanup(lambda: self.psql("postgres", f'DROP DATABASE "{self.database}" WITH (FORCE);'))

    def command(self, database):
        return ["docker", "exec", "-i", os.environ.get("MIGRATIONS_CONTAINER_NAME", "rent-plan-postgres"), "psql", "-X", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-U", os.environ["POSTGRES_USER"], "-d", database]

    def psql(self, database, sql, success=True):
        result = subprocess.run(self.command(database), input=sql, text=True, capture_output=True, timeout=30)
        if success:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result.stdout.strip()

    def migration(self, name, sql):
        (Path(self.directory.name) / name).write_text(sql)

    def sql(self):
        return builder.build_sql(builder.inventory(Path(self.directory.name)))

    def test_sql_failure_rolls_back_changes_and_history_together(self):
        self.migration("001_table.sql", "CREATE TABLE record(value int);")
        self.migration("002_failure.sql", "INSERT INTO record VALUES(1); SELECT * FROM missing_table;")
        self.psql(self.database, self.sql(), success=False)
        self.assertEqual(self.psql(self.database, "SELECT count(*) FROM record;"), "0")
        self.assertEqual(self.psql(self.database, "SELECT count(*) FROM schema_migrations;"), "1")

    def test_two_executors_apply_each_migration_once(self):
        self.migration("001_table.sql", "CREATE TABLE record(value int); INSERT INTO record VALUES(1); SELECT pg_sleep(0.25);")
        sql = self.sql()
        first = subprocess.Popen(self.command(self.database), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        first.stdin.write(sql)
        first.stdin.close()
        second = subprocess.run(self.command(self.database), input=sql, text=True, capture_output=True, timeout=30)
        first.wait(timeout=30)
        self.assertEqual(first.returncode, 0, first.stderr.read())
        first.stdout.close()
        first.stderr.close()
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(self.psql(self.database, "SELECT count(*) FROM record;"), "1")
        self.assertEqual(self.psql(self.database, "SELECT count(*) FROM schema_migrations;"), "1")

    def test_changed_applied_file_blocks_pending_sql(self):
        self.migration("001_table.sql", "CREATE TABLE record(value int);")
        self.psql(self.database, self.sql())
        self.migration("001_table.sql", "CREATE TABLE record(value int); -- changed")
        self.migration("002_insert.sql", "INSERT INTO record VALUES(2);")
        self.psql(self.database, self.sql(), success=False)
        self.assertEqual(self.psql(self.database, "SELECT count(*) FROM record;"), "0")

    def test_update_preserves_existing_data_and_tracks_new_checksum(self):
        self.migration("001_table.sql", "CREATE TABLE record(value int); INSERT INTO record VALUES(7);")
        self.psql(self.database, self.sql())
        self.migration("002_extend.sql", "ALTER TABLE record ADD COLUMN note text;")
        self.psql(self.database, self.sql())
        self.assertEqual(self.psql(self.database, "SELECT value FROM record;"), "7")
        self.assertEqual(self.psql(self.database, "SELECT count(*) FROM schema_migrations WHERE checksum_sha256 IS NOT NULL;"), "2")

    def test_history_failure_rolls_back_the_business_sql(self):
        self.migration("001_table.sql", "CREATE TABLE record(value int);")
        self.psql(self.database, self.sql())
        self.psql(self.database, "ALTER TABLE schema_migrations ADD CONSTRAINT block_new_history CHECK (migration_name='001_table.sql');")
        self.migration("002_insert.sql", "INSERT INTO record VALUES(9);")
        self.psql(self.database, self.sql(), success=False)
        self.assertEqual(self.psql(self.database, "SELECT count(*) FROM record;"), "0")
        self.assertEqual(self.psql(self.database, "SELECT count(*) FROM schema_migrations;"), "1")

    def test_missing_applied_file_blocks_new_business_sql(self):
        self.migration("001_table.sql", "CREATE TABLE record(value int);")
        self.psql(self.database, self.sql())
        (Path(self.directory.name) / "001_table.sql").unlink()
        self.migration("002_insert.sql", "INSERT INTO record VALUES(9);")
        self.psql(self.database, self.sql(), success=False)
        self.assertEqual(self.psql(self.database, "SELECT count(*) FROM record;"), "0")

    def test_dry_run_and_status_do_not_create_history_or_apply_sql(self):
        self.migration("001_table.sql", "CREATE TABLE record(value int);")
        inventory = builder.inventory(Path(self.directory.name))
        for options in [{"dry_run": True}, {"status": True}]:
            self.psql(self.database, builder.build_sql(inventory, **options))
            self.assertEqual(self.psql(self.database, "SELECT to_regclass('public.record') IS NULL AND to_regclass('public.schema_migrations') IS NULL;"), "t")

    def test_initialized_snapshot_requires_a_reviewed_baseline(self):
        self.psql(self.database, "CREATE TABLE companies(id int); CREATE TABLE record(value int); INSERT INTO record VALUES(7);")
        self.migration("001_snapshot.sql", "CREATE TABLE companies(id int); CREATE TABLE record(value int);")
        self.migration("002_extend.sql", "ALTER TABLE record ADD COLUMN note text;")
        self.psql(self.database, self.sql(), success=False)
        self.assertEqual(self.psql(self.database, "SELECT to_regclass('public.schema_migrations') IS NULL;"), "t")
        reviewed = builder.build_sql(builder.inventory(Path(self.directory.name)), baseline_through="001_snapshot.sql")
        self.psql(self.database, reviewed)
        self.assertEqual(self.psql(self.database, "SELECT value FROM record;"), "7")
        self.assertEqual(self.psql(self.database, "SELECT count(*) FROM schema_migrations WHERE checksum_sha256 IS NOT NULL;"), "2")

    def test_legacy_checksum_adoption_preserves_execution_evidence(self):
        self.migration("001_table.sql", "CREATE TABLE record(value int);")
        self.psql(self.database, "CREATE TABLE record(value int); CREATE TABLE schema_migrations(id serial PRIMARY KEY,migration_name varchar(255) NOT NULL UNIQUE,executed_at timestamptz NOT NULL DEFAULT now()); INSERT INTO schema_migrations(migration_name,executed_at) VALUES('001_table.sql','2026-01-01T00:00:00Z');")
        self.psql(self.database, builder.build_sql(builder.inventory(Path(self.directory.name)), adopt_legacy_checksums=True))
        self.assertEqual(self.psql(self.database, "SELECT checksum_sha256 IS NOT NULL AND executed_at='2026-01-01T00:00:00Z'::timestamptz FROM schema_migrations;"), "t")
        self.migration("001_table.sql", "CREATE TABLE record(value int); -- changed after adoption")
        self.psql(self.database, self.sql(), success=False)


if __name__ == "__main__":
    unittest.main()
