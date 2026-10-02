#!/usr/bin/env python3
"""Build one locked psql session, with atomic SQL/history per migration."""
import argparse
import hashlib
import re
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Statement:
    start: int
    end: int
    tokens: tuple[str, ...]


def statements(source: str) -> list[Statement]:
    """Find SQL boundaries without treating function bodies/comments as SQL."""
    result: list[Statement] = []
    tokens: list[str] = []
    start = index = 0
    size = len(source)
    while index < size:
        if source.startswith("--", index):
            newline = source.find("\n", index + 2)
            index = size if newline == -1 else newline + 1
        elif source.startswith("/*", index):
            depth = 1
            index += 2
            while index < size and depth:
                if source.startswith("/*", index):
                    depth += 1
                    index += 2
                elif source.startswith("*/", index):
                    depth -= 1
                    index += 2
                else:
                    index += 1
            if depth:
                raise ValueError("Unterminated SQL block comment")
        elif source[index] in "'\"":
            quote = source[index]
            escape = quote == "'" and index > 0 and source[index - 1] in "eE"
            index += 1
            while index < size:
                if escape and source[index] == "\\":
                    index += 2
                elif source[index] == quote:
                    index += 1
                    if index < size and source[index] == quote:
                        index += 1
                    else:
                        break
                else:
                    index += 1
            else:
                raise ValueError("Unterminated SQL quote")
            tokens.append("<QUOTED>")
        elif source[index] == "$" and (
            match := re.match(r"\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$", source[index:])
        ):
            delimiter = match.group()
            end = source.find(delimiter, index + len(delimiter))
            if end == -1:
                raise ValueError("Unterminated SQL dollar quote")
            index = end + len(delimiter)
            tokens.append("<QUOTED>")
        elif source[index] == "\\":
            raise ValueError("psql commands are forbidden inside migration files")
        elif source[index] == ";":
            if tokens:
                result.append(Statement(start, index + 1, tuple(tokens)))
            start = index + 1
            tokens = []
            index += 1
        elif source[index].isalpha() or source[index] == "_":
            end = index + 1
            while end < size and (source[end].isalnum() or source[end] == "_"):
                end += 1
            tokens.append(source[index:end].upper())
            index = end
        else:
            index += 1
    if tokens:
        result.append(Statement(start, size, tuple(tokens)))
    return result


def atomic_body(source: str) -> str:
    parsed = statements(source)
    # Some historical files put a BEGIN/COMMIT pair after earlier DDL. Flatten
    # that pair too, so *all* statements share the runner's transaction.
    boundaries = [statement for statement in parsed if statement.tokens[0] in {"BEGIN", "COMMIT"}]
    if boundaries and (len(boundaries) != 2
                       or boundaries[0].tokens not in (("BEGIN",), ("BEGIN", "WORK"), ("BEGIN", "TRANSACTION"))
                       or boundaries[1].tokens not in (("COMMIT",), ("COMMIT", "WORK"), ("COMMIT", "TRANSACTION"))):
        raise ValueError("One BEGIN requires one matching COMMIT; the runner owns transactions")
    for statement in parsed:
        if statement in boundaries:
            continue
        tokens = statement.tokens
        if tokens[0] in {"BEGIN", "COMMIT", "ROLLBACK", "END", "ABORT", "SAVEPOINT", "RELEASE"} or tokens[:2] in {
            ("START", "TRANSACTION"), ("PREPARE", "TRANSACTION"), ("SET", "TRANSACTION"), ("DISCARD", "ALL")
        } or tokens[:5] == ("SET", "SESSION", "CHARACTERISTICS", "AS", "TRANSACTION"):
            raise ValueError("Only one outer BEGIN/COMMIT pair is allowed; the runner owns transactions")
    for boundary in reversed(boundaries):
        source = source[:boundary.start] + source[boundary.end:]
    return source


@dataclass(frozen=True)
class Migration:
    name: str
    checksum: str
    body: str


def inventory(directory: Path) -> list[Migration]:
    files = list(directory.glob("*.sql"))
    for path in files:
        if not re.fullmatch(r"[0-9]{3,}_[A-Za-z0-9_-]+\.sql", path.name):
            raise ValueError(f"Invalid migration filename: {path.name}")
    files.sort(key=lambda path: (int(path.name.split("_", 1)[0]), path.name))
    result = []
    for path in files:
        data = path.read_bytes()
        try:
            body = atomic_body(data.decode("utf-8"))
        except (UnicodeError, ValueError) as error:
            raise ValueError(f"{path.name}: {error}") from error
        result.append(Migration(path.name, hashlib.sha256(data).hexdigest(), body))
    return result


def literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def fail_if(condition: str, message: str) -> str:
    return f"DO $rent_runner$ BEGIN IF {condition} THEN RAISE EXCEPTION {literal(message)}; END IF; END $rent_runner$;"


def build_sql(migrations: list[Migration], *, dry_run=False, status=False, baseline_all=False,
              baseline_through="", adopt_legacy_checksums=False, lock_timeout=30) -> str:
    if not 1 <= lock_timeout <= 3600:
        raise ValueError("Lock timeout must be an integer between 1 and 3600 seconds")
    names = [migration.name for migration in migrations]
    if baseline_through and baseline_through not in names:
        raise ValueError(f"Baseline migration does not exist: {baseline_through}")
    sql = [
        r"\set ON_ERROR_STOP on",
        "SET standard_conforming_strings = on;",
        "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS had_history,",
        "       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('companies', 'users')) AS initialized",
        r"\gset",
    ]
    if not status:
        # Two integer keys provide a dedicated, database-scoped migration lock.
        # Re-read state after acquisition: another runner may have just committed.
        sql[2:2] = [
            r"\echo Waiting for the database migration lock",
            f"SET lock_timeout = '{lock_timeout}s';",
            "SELECT pg_advisory_lock(1380273748, 1) AS migration_lock",
            r"\gset",
            "SET lock_timeout = '0';",
        ]
    sql += [
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'schema_migrations' AND column_name = 'checksum_sha256') AS has_checksum",
        r"\gset",
    ]
    if status:
        sql += [r"\if :had_history", r"\if :has_checksum",
                "SELECT migration_name, executed_at, checksum_sha256, CASE WHEN checksum_sha256 IS NULL THEN 'legacy-unverified' ELSE 'tracked' END AS verification FROM public.schema_migrations ORDER BY migration_name;",
                r"\else", "SELECT migration_name, executed_at, 'legacy-unverified' AS verification FROM public.schema_migrations ORDER BY migration_name;",
                r"\endif", r"\else", r"\echo No migrations executed yet", r"\endif"]
        return "\n".join(sql) + "\n"
    sql += [r"\if :had_history", r"\else", r"\if :initialized"]
    if not baseline_all and not baseline_through:
        sql.append(fail_if("TRUE", "Refusing to auto-baseline an initialized database without schema_migrations; verify the snapshot boundary and use --baseline-through with --force-baseline-through"))
    sql += [r"\endif", r"\endif"]
    if not dry_run:
        sql += ["BEGIN;", "CREATE TABLE IF NOT EXISTS public.schema_migrations (id SERIAL PRIMARY KEY, migration_name VARCHAR(255) NOT NULL UNIQUE, executed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, checksum_sha256 VARCHAR(64) CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'));",
                "ALTER TABLE public.schema_migrations ADD COLUMN IF NOT EXISTS checksum_sha256 VARCHAR(64) CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$');", "COMMIT;",
                r"\set has_checksum true"]
    # Validate every tracked checksum before any pending business SQL runs.
    sql += [r"\if :has_checksum"]
    for migration in migrations:
        sql.append(fail_if(
            f"EXISTS (SELECT 1 FROM public.schema_migrations WHERE migration_name = {literal(migration.name)} AND checksum_sha256 IS NOT NULL AND checksum_sha256 <> {literal(migration.checksum)})",
            f"Checksum mismatch: {migration.name}; restore the applied file and create a new migration"))
    available = ", ".join(literal(name) for name in names)
    missing = f"migration_name NOT IN ({available})" if names else "TRUE"
    sql.append(fail_if(f"EXISTS (SELECT 1 FROM public.schema_migrations WHERE checksum_sha256 IS NOT NULL AND {missing})", "A migration with a tracked checksum is missing from this release"))
    sql += [r"\endif"]
    baseline_names = set(names if baseline_all else names[:names.index(baseline_through) + 1] if baseline_through else [])
    if baseline_names:
        sql += [r"\if :had_history", r"\else", r"\if :initialized"]
        if dry_run:
            sql += [r"\echo DRY RUN: verified snapshot migrations would be baselined"]
        else:
            sql += ["BEGIN;"]
            for migration in migrations:
                if migration.name in baseline_names:
                    sql.append(f"INSERT INTO public.schema_migrations (migration_name, checksum_sha256) VALUES ({literal(migration.name)}, {literal(migration.checksum)});")
            sql += ["COMMIT;"]
        sql += [r"\endif", r"\endif"]
    sql += [r"\if :had_history"]
    if adopt_legacy_checksums and not dry_run:
        sql += ["BEGIN;"]
        for migration in migrations:
            sql.append(f"UPDATE public.schema_migrations SET checksum_sha256 = {literal(migration.checksum)} WHERE migration_name = {literal(migration.name)} AND checksum_sha256 IS NULL;")
        sql += ["COMMIT;", r"\echo Reviewed legacy checksums adopted; historical execution timestamps preserved"]
    else:
        sql += [r"\if :has_checksum", "SELECT EXISTS (SELECT 1 FROM public.schema_migrations WHERE checksum_sha256 IS NULL) AS unverified_history", r"\gset", r"\else", r"\set unverified_history true", r"\endif",
                r"\if :unverified_history", r"\echo WARNING: legacy history has no checksums; review originals before --adopt-legacy-checksums", r"\endif"]
    sql += [r"\endif"]
    for migration in migrations:
        if dry_run:
            sql += [r"\if :had_history", f"SELECT EXISTS (SELECT 1 FROM public.schema_migrations WHERE migration_name = {literal(migration.name)}) AS migration_applied", r"\gset", r"\else"]
            if migration.name in baseline_names:
                sql += [r"\if :initialized", r"\set migration_applied true", r"\else", r"\set migration_applied false", r"\endif"]
            else:
                sql += [r"\set migration_applied false"]
            sql += [r"\endif"]
        else:
            sql += [f"SELECT EXISTS (SELECT 1 FROM public.schema_migrations WHERE migration_name = {literal(migration.name)}) AS migration_applied", r"\gset"]
        sql += [r"\if :migration_applied", f"\\echo Skipping already applied: {migration.name}", r"\else"]
        if dry_run:
            sql += [f"\\echo DRY RUN: would apply {migration.name}"]
        else:
            sql += [f"\\echo Applying {migration.name}", "BEGIN;", migration.body.rstrip(), ";",
                    f"INSERT INTO public.schema_migrations (migration_name, checksum_sha256) VALUES ({literal(migration.name)}, {literal(migration.checksum)});", "COMMIT;"]
        sql += [r"\endif"]
    sql += ["SELECT pg_advisory_unlock(1380273748, 1) AS migration_unlocked", r"\gset"]
    return "\n".join(sql) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True, type=Path)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--baseline-all", action="store_true")
    parser.add_argument("--baseline-through", default="")
    parser.add_argument("--adopt-legacy-checksums", action="store_true")
    parser.add_argument("--lock-timeout", type=int, default=30)
    args = vars(parser.parse_args())
    directory = args.pop("directory")
    try:
        output = build_sql(inventory(directory), **args)
    except (OSError, ValueError) as error:
        print(f"Migration validation failed: {error}", file=sys.stderr)
        return 1
    sys.stdout.write(output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
