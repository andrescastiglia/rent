#!/usr/bin/env python3
"""Scan existing sources/coverage locally, then fail on unresolved findings."""
import argparse
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--scanner", default="sonar-scanner")
    args = parser.parse_args()
    base = os.environ.get("SONAR_HOST_URL", "http://127.0.0.1:9003").rstrip("/")
    url = urllib.parse.urlsplit(base)
    if url.scheme not in ("http", "https") or url.hostname not in ("localhost", "127.0.0.1", "::1"):
        parser.error("SONAR_HOST_URL must identify a local SonarQube server")
    token = os.environ.get("SONAR_TOKEN")
    if not token:
        parser.error("SONAR_TOKEN is required")
    scanner = shutil.which(args.scanner)
    if not scanner:
        parser.error("SonarScanner is unavailable; specify --scanner")
    root = Path(__file__).resolve().parents[2]
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    headers = {"Authorization": "Basic " + base64.b64encode((token + ":").encode()).decode()}

    def request(endpoint, **params):
        query = urllib.parse.urlencode(params)
        req = urllib.request.Request(base + endpoint + "?" + query, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)

    with (output / "scan.log").open("w") as log:
        result = subprocess.run(
            [scanner, "-Dsonar.qualitygate.wait=true", "-Dsonar.qualitygate.timeout=300",
             "-Dsonar.working.directory=" + str(output / "scannerwork")],
            cwd=root, env={**os.environ, "SONAR_HOST_URL": base},
            stdout=log, stderr=subprocess.STDOUT, check=False,
        )
    project = "andrescastiglia_rent"
    issues = []
    page = 1
    while True:
        response = request("/api/issues/search", componentKeys=project, resolved="false", ps=500, p=page)
        issues.extend(response["issues"])
        if page * 500 >= response["paging"]["total"]:
            break
        page += 1
    hotspots = request("/api/hotspots/search", projectKey=project, status="TO_REVIEW", ps=500)
    gate = request("/api/qualitygates/project_status", projectKey=project)
    metrics = request("/api/measures/component", component=project,
                      metricKeys="coverage,line_coverage,branch_coverage,duplicated_lines_density,violations,security_hotspots")
    data = {"issues": issues, "hotspots": hotspots, "gate": gate, "metrics": metrics}
    for name, value in data.items():
        (output / (name + ".json")).write_text(json.dumps(value, indent=2) + "\n")
    summary = {"scannerExit": result.returncode, "unresolvedIssues": len(issues),
               "unreviewedHotspots": hotspots["paging"]["total"],
               "qualityGate": gate["projectStatus"]["status"]}
    measures = {item["metric"]: float(item["value"]) for item in metrics["component"]["measures"]}
    summary["coverage"] = measures.get("coverage")
    summary["coveragePassed"] = measures.get("coverage", 0) >= 85
    (output / "result.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary))
    return int(result.returncode != 0 or bool(issues) or summary["unreviewedHotspots"] > 0
               or summary["qualityGate"] != "OK" or not summary["coveragePassed"])


if __name__ == "__main__":
    raise SystemExit(main())
