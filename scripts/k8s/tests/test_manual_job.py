"""Verify manual operations use deployed templates without contacting a cluster."""
import contextlib
import io
import json
import runpy
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "manual-job.py"


class ManualJobTests(unittest.TestCase):
    def invoke(self, operation, dry_run="true", active=True, maintenance=False):
        template = {
            "spec": {"jobTemplate": {"spec": {
                "backoffLimit": 0,
                "template": {"spec": {
                    "containers": [{"name": "batch", "image": "deployed@sha256:123",
                                    "env": [{"name": "NEW_RELIC_APP_NAME", "value": "Rent"}],
                                    "volumeMounts": [{"name": "runtime"}]}],
                    "initContainers": [{"name": "wait-for-database"}],
                }},
            }}}}
        def available(path):
            if str(path) == "/etc/rent-kubernetes/active":
                return active
            return maintenance
        output = io.StringIO()
        with patch("sys.argv", [str(SCRIPT), operation, dry_run]), \
             patch("pathlib.Path.exists", available), \
             patch("subprocess.check_output", return_value=json.dumps(template).encode()) as read, \
             patch("subprocess.run") as create, \
             patch("time.time", return_value=100), \
             contextlib.redirect_stdout(output):
            runpy.run_path(str(SCRIPT), run_name="__main__")
        return read, create, output.getvalue()

    def test_reconciliation_reuses_current_image_and_internal_backend(self):
        read, create, output = self.invoke("reconcile-bank")
        self.assertIn("reports", read.call_args.args[0])
        job = json.loads(create.call_args.kwargs["input"])
        container = job["spec"]["template"]["spec"]["containers"][0]
        self.assertEqual(container["image"], "deployed@sha256:123")
        self.assertEqual(container["args"], ["/app/deploy/run-exclusive.cjs", "reconcile-bank",
                                             "dist/index.js", "reconcile-bank", "--dry-run"])
        self.assertIn({"name": "BACKEND_INTERNAL_URL", "value": "http://backend.rent.svc.cluster.local:3001"}, container["env"])
        self.assertEqual(job["spec"]["backoffLimit"], 0)
        self.assertEqual(job["spec"]["template"]["spec"]["initContainers"], [{"name": "wait-for-database"}])
        self.assertEqual(output.strip(), "reconcile-bank-manual-100")

    def test_live_operation_does_not_add_dry_run(self):
        read, create, _ = self.invoke("reports", "false")
        self.assertIn("reports", read.call_args.args[0])
        job = json.loads(create.call_args.kwargs["input"])
        self.assertNotIn("--dry-run", job["spec"]["template"]["spec"]["containers"][0]["args"])

    def test_report_preview_runs_both_reports_for_all_owners(self):
        _, create, _ = self.invoke("reports")
        job = json.loads(create.call_args.kwargs["input"])
        container = job["spec"]["template"]["spec"]["containers"][0]
        self.assertEqual(container["args"][:3], ["/app/deploy/run-exclusive.cjs", "reports", "-e"])
        self.assertIn('"scripts/generate-all-reports.sh", "--dry-run"', container["args"][3])
        self.assertEqual(job["spec"]["template"]["metadata"]["labels"]["app"], "reports")

    def test_reconciliation_has_its_own_monitoring_label(self):
        _, create, _ = self.invoke("reconcile-bank")
        job = json.loads(create.call_args.kwargs["input"])
        self.assertEqual(job["spec"]["template"]["metadata"]["labels"]["app"], "reconcile-bank")

    def test_unsupported_index_preview_creates_no_job(self):
        with patch("subprocess.run") as create, self.assertRaisesRegex(SystemExit, "does not support"):
            self.invoke("sync-indices")
        create.assert_not_called()

    def test_no_writes_during_maintenance_or_before_activation(self):
        for options in [{"active": False}, {"maintenance": True}]:
            with self.subTest(options=options), self.assertRaises(SystemExit):
                self.invoke("reports", **options)

    def test_unknown_operation_or_invalid_mode_is_rejected(self):
        for operation, mode in [("shell", "true"), ("reports", "maybe")]:
            with self.subTest(operation=operation), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                self.invoke(operation, mode)


if __name__ == "__main__":
    unittest.main()
