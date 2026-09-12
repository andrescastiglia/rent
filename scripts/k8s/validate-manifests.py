#!/usr/bin/env python3
"""Structural acceptance checks for destructive or deployment-blocking mistakes."""
import sys,yaml
items=[d for d in yaml.safe_load_all(open(sys.argv[1])) if d]
by_kind={}
for item in items:by_kind.setdefault(item['kind'],[]).append(item)
runtime=next(c['data'] for c in by_kind['ConfigMap'] if c['metadata']['name']=='rent-runtime')
assert 'APP_URL' not in runtime, 'Public payment return URLs must retain production configuration'
assert runtime['PGSSLMODE']=='verify-full' and runtime['PGSSLROOTCERT']=='/run/postgres/ca.crt'
pv=by_kind['PersistentVolume'][0]
assert pv['spec']['persistentVolumeReclaimPolicy']=='Retain'
assert pv['spec']['local']['path']=='/srv/k3s/rent/postgresql'
stateful=by_kind['StatefulSet'][0]['spec']
assert stateful['replicas']==1
assert set(stateful['persistentVolumeClaimRetentionPolicy'].values())=={'Retain'}
assert len(by_kind['CronJob'])==13
names={c['metadata']['name'] for c in by_kind['CronJob']}
assert len(names)==13 and 'rag-purge-audit' in names
for job in by_kind['CronJob']:
    assert job['spec']['timeZone']=='Etc/UTC'
    assert job['spec']['concurrencyPolicy']=='Forbid'
    assert job['spec']['jobTemplate']['spec']['backoffLimit']==0
    container=job['spec']['jobTemplate']['spec']['template']['spec']['containers'][0]
    if job['metadata']['name'] not in ['database-backup','restore-drill']:
        assert container['args'][0]=='/app/deploy/run-exclusive.cjs'
for item in by_kind['Deployment']:
    pod=item['spec']['template']['spec']
    assert pod['automountServiceAccountToken'] is False
    assert pod['securityContext']['runAsNonRoot'] is True
    container=pod['containers'][0]
    assert container['securityContext']['readOnlyRootFilesystem'] is True
    if item['metadata']['name']!='rag-worker':
        assert container['livenessProbe']['httpGet']['path']=='/health/live'
        assert container['readinessProbe']['httpGet']['path']=='/health'
for service in by_kind['Service']:
    if service['metadata']['name'].startswith('postgres'):
        assert service['spec'].get('type','ClusterIP')=='ClusterIP'
print('Retained storage, isolated database, safe probes and exclusive schedules verified.')
