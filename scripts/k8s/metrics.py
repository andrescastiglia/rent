#!/usr/bin/env python3
"""Emit infrastructure-only backup status; never include URLs or credentials."""
import json, os, sys, time, urllib.request
kind = sys.argv[1]
value = float(sys.argv[2])
metrics = [{'name': os.getenv('METRIC_PREFIX','rent.backup') + '.' + kind, 'type': 'gauge', 'value': value,
            'timestamp': int(time.time()), 'attributes': {'service.name': os.getenv('SERVICE_NAME','rent-backup'), 'backup.kind': os.getenv('BACKUP_KIND', 'database')}}]
key = os.getenv('NEW_RELIC_LICENSE_KEY')
if key:
    req = urllib.request.Request('https://metric-api.newrelic.com/metric/v1',
        data=json.dumps([{'metrics': metrics}]).encode(),
        headers={'Api-Key': key, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            if response.status != 202: raise RuntimeError('Metrics rejected')
    except Exception:
        print('Backup metric delivery failed', file=sys.stderr)
