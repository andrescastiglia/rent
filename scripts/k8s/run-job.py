#!/usr/bin/env python3
"""Generate an allowlisted administration Job from the deployed backup template."""
import argparse,json,re,subprocess
p=argparse.ArgumentParser();p.add_argument('action',choices=['bootstrap','migrate']);p.add_argument('sha');p.add_argument('--image');args=p.parse_args()
if not re.fullmatch('[0-9a-f]{40}',args.sha):raise SystemExit('Full release SHA required')
k=['k3s','kubectl','-n','rent']
cron=json.loads(subprocess.check_output(k+['get','cronjob','database-backup','-o','json']))
spec=cron['spec']['jobTemplate']['spec'];spec['ttlSecondsAfterFinished']=604800
spec['template']['metadata']['labels']['app']=args.action
container=spec['template']['spec']['containers'][0]
container['name']=args.action
if args.image:container['image']=args.image
container['envFrom']=[{'secretRef':{'name':'postgres-bootstrap' if args.action=='bootstrap' else 'postgres-migration'}}]
container['env'] += [{'name':'POSTGRES_HOST','value':'postgres.rent.svc.cluster.local'},{'name':'POSTGRES_DB','value':'rent_db'},{'name':'MIGRATIONS_SKIP_ENV_FILE','value':'true'}]
container['command']=['python3','/app/scripts/bootstrap-db.py'] if args.action=='bootstrap' else ['bash','/app/migrations/run-migrations.sh']
name='rent-'+args.action+'-'+args.sha[:12]
if args.action=='bootstrap':name+='-'+container['image'].rsplit(':',1)[-1][:12]
print(json.dumps({'apiVersion':'batch/v1','kind':'Job','metadata':{'name':name,'namespace':'rent','labels':{'app.kubernetes.io/part-of':'rent'}},'spec':spec}))
