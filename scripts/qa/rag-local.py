#!/usr/bin/env python3
"""Prepare or evaluate RAG against a dedicated loopback database, without builds."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["prepare", "evaluate"])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--container", default="rent-plan-postgres")
    parser.add_argument("--database", default="rent_rag_local_20261002")
    parser.add_argument("--database-port", type=int, default=55432)
    parser.add_argument("--api-port", type=int, default=3302)
    parser.add_argument("--provider-settings", type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"rent_rag_local_[a-z0-9_]+", args.database):
        parser.error("database must use the dedicated rent_rag_local_ prefix")
    if not 1024 <= args.api_port <= 65535 or not 1024 <= args.database_port <= 65535:
        parser.error("ports must be between 1024 and 65535")
    root = Path(__file__).resolve().parents[2]
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    user = os.environ.get("RENT_RAG_DATABASE_USER", "test")
    password = os.environ.get("RENT_RAG_DATABASE_PASSWORD", "test")
    env = {
        **os.environ, "NODE_ENV": "test", "HOST": "127.0.0.1", "PORT": str(args.api_port),
        "POSTGRES_HOST": "127.0.0.1", "POSTGRES_PORT": str(args.database_port),
        "POSTGRES_DB": args.database, "POSTGRES_USER": user, "POSTGRES_PASSWORD": password,
        "DATABASE_URL": "postgresql://" + urllib.parse.quote(user, safe="") + ":" +
        urllib.parse.quote(password, safe="") + f"@127.0.0.1:{args.database_port}/{args.database}",
        "JWT_SECRET": "isolated-rag-validation-secret", "JWT_REFRESH_SECRET": "isolated-rag-refresh",
        "OTEL_SDK_DISABLED": "true", "NEW_RELIC_ENABLED": "false", "PYROSCOPE_ENABLED": "false",
        "BFA_ENABLED": "false", "MERCADOLIBRE_ENABLED": "false", "MERCADOPAGO_PAYOUTS_ENABLED": "false",
        "AI_RETRIEVAL_MODE": "HYBRID",
        "AI_RAG_EXTERNAL_READ_ENABLED": "true",
        "AI_RAG_ENABLED_COMPANY_IDS": "10000000-0000-0000-0000-000000000001,20000000-0000-0000-0000-000000000001",
        "MIGRATIONS_SKIP_ENV_FILE": "true", "MIGRATIONS_CONTAINER_NAME": args.container,
        "LOG_DIR": str(output), "LOG_LEVEL": "info",
    }
    env.pop("ELECTRON_RUN_AS_NODE", None)

    def run(command, name, cwd=root, input_text=None):
        with (output / (name + ".log")).open("w") as log:
            subprocess.run(command, cwd=cwd, env=env, input=input_text, text=True,
                           stdout=log, stderr=subprocess.STDOUT, check=True)

    if args.action == "prepare":
        # createdb fails if the destination exists; never reset an existing database.
        run(["docker", "exec", args.container, "createdb", "-U", user, args.database], "create")
        sql = ["docker", "exec", "-i", args.container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", args.database]
        run(sql, "initialize", input_text=(root / "scripts/init-db.sql").read_text())
        run(["bash", "migrations/run-migrations.sh", "--baseline-through", "090_add_ai_rag_shadow_comparisons.sql", "--force-baseline-through"], "migrate")
        fixtures = (root / "scripts/reset_data.sql").read_text()
        # Only this just-created disposable database can bypass immutable-counter
        # TRUNCATE guards. Restore triggers before inserting/validating fixtures.
        fixtures = fixtures.replace(
            "EXECUTE 'TRUNCATE TABLE ' || v_tables || ' RESTART IDENTITY CASCADE';",
            "SET LOCAL session_replication_role = replica;\n"
            "        EXECUTE 'TRUNCATE TABLE ' || v_tables || ' RESTART IDENTITY CASCADE';\n"
            "        SET LOCAL session_replication_role = origin;",
        )
        run(sql, "fixtures", input_text=fixtures)
        print("Prepared isolated RAG database and fictitious fixtures; no provider calls made.")
        return

    if not args.provider_settings:
        parser.error("evaluate requires --provider-settings (private JSON outside the repository)")
    settings = json.loads(args.provider_settings.read_text())
    allowed = {"OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL", "AI_RAG_MODEL",
               "AI_EMBEDDING_MODEL", "AI_EMBEDDING_DIMENSIONS", "AI_EMBEDDING_VERSION", "AI_RAG_MIN_SIMILARITY"}
    if not settings.get("OPENAI_API_KEY") or not settings.get("AI_RAG_MIN_SIMILARITY"):
        parser.error("provider access and a calibrated similarity threshold are required")
    env.update({key: str(value) for key, value in settings.items() if key in allowed})
    for binary in ["backend/dist/main.js", "batch/dist/index.js"]:
        if not (root / binary).is_file():
            parser.error("existing build is missing: " + binary)
    with (output / "api.log").open("w") as api_log, (output / "worker.log").open("w") as worker_log:
        api = subprocess.Popen(["node", "dist/main.js"], cwd=root / "backend", env=env,
                               stdout=api_log, stderr=subprocess.STDOUT)
        worker = None
        try:
            for _ in range(60):
                if api.poll() is not None:
                    raise RuntimeError("local RAG API stopped; inspect api.log")
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{args.api_port}/health", timeout=2):
                        break
                except OSError:
                    time.sleep(1)
            else:
                raise RuntimeError("local RAG API did not become ready")
            run(["node", "dist/index.js", "rag-backfill", "--entity", "all", "--batch-size", "50", "--concurrency", "2"], "backfill", root / "batch")
            run(["node", "dist/index.js", "rag-verify", "--entity", "all", "--sample-size", "1000"], "verify", root / "batch")
            worker = subprocess.Popen(["node", "dist/index.js", "rag-sync", "--poll-interval", "250"],
                                      cwd=root / "batch", env=env, stdout=worker_log, stderr=subprocess.STDOUT)
            run(["node", "scripts/run-rag-eval.js", "--base-url", f"http://127.0.0.1:{args.api_port}",
                 "--strict", "--report", str(output / "evaluation.json")], "evaluation", root / "backend")
            print("Real-provider RAG evaluation passed; evidence saved without credentials.")
        finally:
            for process in [worker, api]:
                if process is not None:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()


if __name__ == "__main__":
    main()
