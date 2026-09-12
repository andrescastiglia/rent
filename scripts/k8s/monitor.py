#!/usr/bin/env python3
"""Persistent acceptance observation and low-cardinality New Relic health metrics."""
import datetime,json,os,shutil,subprocess,time,urllib.request
from pathlib import Path
if not Path('/etc/rent-kubernetes/active').exists():raise SystemExit(0)
root=Path('/var/lib/rent-kubernetes');root.mkdir(mode=0o700,exist_ok=True)
path=root/'observation.json'
now=int(time.time())
state=json.loads(path.read_text()) if path.exists() else {'started_at':now,'checks':0,'failed_checks':0}
def get(kind):return json.loads(subprocess.check_output(['k3s','kubectl','-n','rent','get',kind,'-o','json'],stderr=subprocess.DEVNULL))
healthy=True
try:
    for port in [30080,30081]:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/health',timeout=10) as r:healthy &= r.status==200
    for item in get('deployments')['items']:
        healthy &= item['status'].get('availableReplicas',0)==1
    postgres=get('statefulsets')['items']
    healthy &= bool(postgres) and all(x['status'].get('readyReplicas',0)==1 for x in postgres)
    backup=next(x for x in get('cronjobs')['items'] if x['metadata']['name']=='database-backup')
    last=backup.get('status',{}).get('lastSuccessfulTime')
    last_timestamp=int(datetime.datetime.fromisoformat(last.replace('Z','+00:00')).timestamp()) if last else 0
except Exception:
    healthy=False;last_timestamp=0
state.update(last_check=now,checks=state['checks']+1,last_healthy=healthy,last_scheduled_backup=last_timestamp)
if not healthy:state['failed_checks']+=1
state['status']='observing'
if now-state['started_at']>=86400:
    state['status']='verified' if healthy and state['failed_checks']==0 and now-last_timestamp<=86400 else 'needs-review'
path.write_text(json.dumps(state,indent=2));path.chmod(0o600)
runtime=json.loads(subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify(require('node:util').parseEnv(require('node:fs').readFileSync(process.argv[1],'utf8'))))",'/etc/rent-kubernetes/runtime-source.env']))
env={**os.environ,'NEW_RELIC_LICENSE_KEY':runtime['NEW_RELIC_LICENSE_KEY'],'METRIC_PREFIX':'rent.platform','SERVICE_NAME':'rent-platform'}
disk=shutil.disk_usage('/srv/k3s/rent/postgresql')
metrics={'unhealthy':0 if healthy else 1,'disk_used_percent':100*disk.used/disk.total,'backup_age_seconds':now-last_timestamp if last_timestamp else now-state['started_at']}
for name,value in metrics.items():subprocess.run(['python3',str(Path(__file__).with_name('metrics.py')),name,str(value)],env=env,check=False)
print(json.dumps({'healthy':healthy,'observation':state['status'],'checks':state['checks'],'failed_checks':state['failed_checks']}))
