#!/usr/bin/env python3
"""One-time Rent-only freeze after a verified rehearsal, before the final dump."""
import json, os, re, subprocess, sys
from pathlib import Path
if os.geteuid()!=0 or sys.argv[1:]!=['--freeze']:raise SystemExit('Run as root with --freeze after the restore rehearsal')
root=Path('/etc/rent-kubernetes')
if (root/'active').exists():raise SystemExit('Already migrated; use the Kubernetes maintenance procedure')
if not (root/'rehearsal-verified').exists():raise SystemExit('Verified rehearsal marker required')
root.mkdir(mode=0o700,exist_ok=True)
def save(name,content):
    path=root/name
    if not path.exists():path.write_text(content);path.chmod(0o600)
cron=subprocess.check_output(['crontab','-u','deploy','-l'],text=True)
lines=cron.splitlines()
rent_lines=[i for i,line in enumerate(lines) if line.strip() and not line.lstrip().startswith('#') and ('/var/www/rent/' in line or '$BATCH_BIN' in line or line.startswith('BATCH_LOG=/var/log/rent'))]
if not rent_lines and not (root/'maintenance-active').exists():raise SystemExit('No Rent cron entries found; inspect before proceeding')
pm2=['sudo','-u','deploy','pm2']
processes=json.loads(subprocess.check_output(pm2+['jlist'],text=True))
names=['rent-backend','rent-frontend','rent-rag-worker']
if not set(names).issubset({p['name'] for p in processes}):raise SystemExit('Expected legacy Rent process names missing')
save('native-crontab.txt',cron)
save('native-pm2.json',json.dumps([p for p in processes if p['name'] in names]))
vhost=Path('/etc/nginx/sites-enabled/rent').resolve();original=vhost.read_text()
save('nginx-before-kubernetes.conf',original)
maintenance='    include /etc/rent-kubernetes/maintenance.conf;\n'
(root/'maintenance.conf').write_text('add_header Retry-After 3600 always;\nreturn 503;\n')
(root/'maintenance.conf').chmod(0o600)
if maintenance not in original:
    updated,count=re.subn(r'(?m)^(server\s*\{\s*\n)',r'\1'+maintenance,original)
    if not count:raise SystemExit('Unexpected Rent vhost structure')
    vhost.write_text(updated)
    try:subprocess.run(['nginx','-t'],check=True,capture_output=True)
    except Exception:vhost.write_text(original);raise
    subprocess.run(['systemctl','reload','nginx'],check=True)
(root/'maintenance-active').touch(mode=0o600)
for i in rent_lines:lines[i]='# rent-kubernetes migration: '+lines[i]
subprocess.run(['crontab','-u','deploy','-'],input='\n'.join(lines)+'\n',text=True,check=True)
subprocess.run(pm2+['stop',*names],check=True,stdout=subprocess.DEVNULL)
subprocess.run(pm2+['save'],check=True,stdout=subprocess.DEVNULL)
# PM2 rotates dump.pm2 into dump.pm2.bak. Save again so its recovery fallback
# also contains the stopped Rent processes instead of resurrecting old writers.
subprocess.run(pm2+['save'],check=True,stdout=subprocess.DEVNULL)
print('Rent maintenance enabled, native schedules disabled and three PM2 processes stopped. Wait for in-flight tasks and sessions before the final dump.')
