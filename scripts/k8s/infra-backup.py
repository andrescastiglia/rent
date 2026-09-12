#!/usr/bin/env python3
"""Root-only recovery bundle. The PostgreSQL data backup is a separate CronJob."""
import json,os,shutil,subprocess,tempfile,time
from pathlib import Path

def parse_env(path):
    return json.loads(subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify(require('node:util').parseEnv(require('node:fs').readFileSync(process.argv[1],'utf8'))))",str(path)]))
env={**os.environ,**parse_env('/etc/rent-backup/r2.env')}
env['RESTIC_REPOSITORY']=env['RESTIC_REPOSITORY'].rsplit('/',1)[0]+'/infrastructure'
env['RESTIC_CACHE_DIR']='/var/cache/rent-restic'
env['BACKUP_KIND']='infrastructure'
runtime=parse_env('/etc/rent-kubernetes/runtime-source.env')
env['NEW_RELIC_LICENSE_KEY']=runtime['NEW_RELIC_LICENSE_KEY']
metrics=str(Path(__file__).with_name('metrics.py'))
def run(argv):subprocess.run(argv,env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
try:
    name='rent-infra-'+str(int(time.time()))
    run(['k3s','etcd-snapshot','save','--name',name])
    snapshots=list(Path('/var/lib/rancher/k3s/server/db/snapshots').glob(name+'*'))
    if len(snapshots)!=1:raise RuntimeError('Snapshot not identified')
    with tempfile.TemporaryDirectory(prefix='rent-infra-',dir='/var/backups') as temporary:
        stage=Path(temporary)
        shutil.copytree('/etc/rent-kubernetes',stage/'rent-kubernetes')
        shutil.copytree('/etc/rancher/k3s',stage/'k3s-config')
        shutil.copy2('/var/lib/rancher/k3s/server/token',stage/'k3s-server-token')
        shutil.copy2(snapshots[0],stage/'etcd.snapshot')
        shutil.copy2('/etc/nginx/sites-enabled/rent',stage/'nginx-rent.conf')
        # An explicit group prevents rotating temporary paths from defeating retention.
        run(['restic','backup','--host','oracle-rent','--tag','infrastructure',str(stage)])
        run(['restic','forget','--host','oracle-rent','--tag','infrastructure','--group-by','host,tags','--keep-daily','14','--keep-weekly','8','--keep-monthly','12','--prune'])
        run(['restic','check'])
    snapshots[0].unlink()
    run(['python3',metrics,'success','1'])
    run(['python3',metrics,'last_success_timestamp',str(int(time.time()))])
    print('Encrypted Rent infrastructure backup verified.')
except Exception:
    subprocess.run(['python3',metrics,'success','0'],env=env,check=False)
    raise SystemExit('Infrastructure backup failed; inspect protected host diagnostics')
