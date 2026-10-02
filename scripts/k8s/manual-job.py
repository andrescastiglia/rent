#!/usr/bin/env python3
import argparse,json,subprocess,time
from pathlib import Path
ALLOWED=['billing','overdue','reminders','lease-renewal-alerts','sync-indices','sync-rates','reports','reconcile-bank']
p=argparse.ArgumentParser();p.add_argument('operation',choices=ALLOWED);p.add_argument('dry_run',choices=['true','false']);args=p.parse_args()
if not Path('/etc/rent-kubernetes/active').exists() or Path('/etc/rent-kubernetes/maintenance-active').exists():raise SystemExit('Rent is not available for manual operations')
k=['k3s','kubectl','--as=system:serviceaccount:rent:deployer','-n','rent']
# Reconciliation is manual until its schedule is explicitly enabled. Reuse the
# deployed batch template, retaining its digest, Secrets and database readiness.
template='reports' if args.operation=='reconcile-bank' else args.operation
cron=json.loads(subprocess.check_output(k+['get','cronjob',template,'-o','json']))
spec=cron['spec']['jobTemplate']['spec']
spec['template']['spec']['containers'][0]['args']=['/app/deploy/run-exclusive.cjs',args.operation,'dist/index.js',args.operation]+(['--dry-run'] if args.dry_run=='true' else [])
if args.operation=='reconcile-bank':
    spec['template']['spec']['containers'][0].setdefault('env',[]).append({'name':'BACKEND_INTERNAL_URL','value':'http://backend.rent.svc.cluster.local:3001'})
name=args.operation+'-manual-'+str(int(time.time()))
job={'apiVersion':'batch/v1','kind':'Job','metadata':{'name':name,'namespace':'rent'},'spec':spec}
subprocess.run(k+['create','-f','-'],input=json.dumps(job).encode(),check=True,stdout=subprocess.DEVNULL)
print(name)
