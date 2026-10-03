"""Exercise the report wrapper with isolated provider and database fixtures."""
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


WRAPPER = Path(__file__).resolve().parents[3] / "batch/scripts/generate-all-reports.sh"


class GenerateReportsTests(unittest.TestCase):
    def invoke(self, owners="owner-a\nowner-b\n", fail_owner="", args=()):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            calls = root / "calls.jsonl"
            scripts = {
                "psql": "#!/bin/bash\nprintf '%s' \"$FIXTURE_OWNERS\"\n",
                "date": "#!/bin/bash\nif [[ ${1:-} == -d ]]; then echo 2026-09; else echo 2026-10-01; fi\n",
                "node": "#!/usr/bin/env python3\nimport json,os,sys\n"
                        "with open(os.environ['FIXTURE_CALLS'],'a') as f: f.write(json.dumps(sys.argv[1:])+'\\n')\n"
                        "sys.exit(1 if os.environ['FIXTURE_FAIL_OWNER'] in sys.argv[1:] else 0)\n",
            }
            for name, content in scripts.items():
                path = root / name
                path.write_text(content)
                path.chmod(0o700)
            result = subprocess.run(
                ["bash", str(WRAPPER), *args],
                env={"PATH": str(root) + os.pathsep + os.environ["PATH"],
                     "DATABASE_URL": "postgresql://fixture.invalid/test",
                     "FIXTURE_OWNERS": owners, "FIXTURE_FAIL_OWNER": fail_owner,
                     "FIXTURE_CALLS": str(calls)},
                capture_output=True, text=True, check=False,
            )
            commands = [json.loads(line) for line in calls.read_text().splitlines()] if calls.exists() else []
            return result, commands

    def test_preview_passes_month_owner_log_and_mode_to_both_reports(self):
        result, calls = self.invoke(args=("--dry-run", "--log", "/tmp/report.log"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 4)
        for call, owner, report_type in zip(calls, ["owner-a", "owner-a", "owner-b", "owner-b"],
                                            ["monthly", "settlement", "monthly", "settlement"]):
            self.assertEqual(call, ["dist/index.js", "reports", "--log", "/tmp/report.log", "--dry-run",
                                    "--type", report_type, "--owner-id", owner, "--month", "2026-09"])

    def test_failure_continues_other_owners_and_exits_nonzero(self):
        result, calls = self.invoke(fail_owner="owner-a")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(len(calls), 4)
        self.assertIn("2 failed reports", result.stderr)

    def test_empty_owner_list_is_successful_without_report_commands(self):
        result, calls = self.invoke(owners="")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
