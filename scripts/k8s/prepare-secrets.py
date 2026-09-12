#!/usr/bin/env python3
"""Run as root on oracle. Never print credential data or use shell interpolation."""
import argparse, base64, json, os, secrets, subprocess
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, quote, unquote

parser = argparse.ArgumentParser()
parser.add_argument('runtime_file')
args = parser.parse_args()
root = Path('/etc/rent-kubernetes')
root.mkdir(mode=0o700, exist_ok=True)

# Preserve a rollback copy before changing mounted runtime files.
previous = root / 'secrets-before-release.json'
if (root/'active').exists() and not previous.exists():
    raw = json.loads(subprocess.check_output(['k3s','kubectl','-n','rent','get','secrets','-o','json']))
    for item in raw['items']:
        item['metadata'] = {k:item['metadata'][k] for k in ['name','namespace']}
    fd = os.open(previous, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd,'w') as file: json.dump(raw,file)

pki = root / 'pki'
pki.mkdir(mode=0o700, exist_ok=True)
def command(argv): subprocess.run(argv, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
def password(name):
    path = root / name
    if not path.exists():
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as file: file.write(secrets.token_urlsafe(48))
    return path.read_text().strip()
def parse_env(path):
    return json.loads(subprocess.check_output(['node', '-e', "process.stdout.write(JSON.stringify(require('node:util').parseEnv(require('node:fs').readFileSync(process.argv[1],'utf8'))))", str(path)]))
def apply_secret(name, data):
    obj = {'apiVersion':'v1','kind':'Secret','metadata':{'name':name,'namespace':'rent'},'type':'Opaque','data':{k:base64.b64encode(v.encode()).decode() for k,v in data.items()}}
    subprocess.run(['k3s','kubectl','apply','--server-side','--field-manager=rent-secrets','-f','-'],input=json.dumps(obj).encode(),check=True,stdout=subprocess.DEVNULL)
if not (pki/'ca.crt').exists():
    command(['openssl','req','-x509','-newkey','rsa:3072','-nodes','-keyout',str(pki/'ca.key'),'-out',str(pki/'ca.crt'),'-days','3650','-subj','/CN=Rent PostgreSQL CA'])
if not (pki/'server.crt').exists():
    command(['openssl','req','-new','-newkey','rsa:3072','-nodes','-keyout',str(pki/'server.key'),'-out',str(pki/'server.csr'),'-subj','/CN=postgres.rent.svc.cluster.local'])
    (pki/'server.ext').write_text('subjectAltName=DNS:postgres,DNS:postgres.rent,DNS:postgres.rent.svc,DNS:postgres.rent.svc.cluster.local\nextendedKeyUsage=serverAuth\n')
    command(['openssl','x509','-req','-in',str(pki/'server.csr'),'-CA',str(pki/'ca.crt'),'-CAkey',str(pki/'ca.key'),'-CAcreateserial','-out',str(pki/'server.crt'),'-days','825','-extfile',str(pki/'server.ext')])
for path in pki.iterdir(): path.chmod(0o600)
runtime = parse_env(args.runtime_file)
url = urlsplit(runtime['DATABASE_URL'])
app_user = unquote(url.username or '')
app_password = unquote(url.password or '')
if app_user != 'rent_user' or not app_password: raise RuntimeError('Expected Rent-specific PostgreSQL credentials')
runtime['DATABASE_URL'] = urlunsplit(('postgresql',quote(app_user,safe='')+':'+quote(app_password,safe='')+'@postgres.rent.svc.cluster.local:5432','/rent_db','',''))
runtime.update(POSTGRES_HOST='postgres.rent.svc.cluster.local',POSTGRES_PORT='5432',POSTGRES_USER=app_user,POSTGRES_PASSWORD=app_password,POSTGRES_DB='rent_db',DATABASE_SSL_MODE='verify-full',DATABASE_SSL_CA_FILE='/run/postgres/ca.crt')
# Administrator APIs and backup credentials never enter business application pods.
for key in ['NEW_RELIC_API_KEY','NEW_RELIC_ACCOUNT_ID']: runtime.pop(key,None)
for app in ['backend','batch','frontend']:
    data = runtime if app != 'frontend' else {k:v for k,v in runtime.items() if k.startswith('NEXT_PUBLIC_') or k in ['NEW_RELIC_LICENSE_KEY','NEW_RELIC_ENABLED']}
    def dotenv_value(value):
        delimiter = next((q for q in ['\"', "'", '`'] if q not in value), None)
        if delimiter is None: raise RuntimeError('Runtime value cannot be serialized losslessly')
        return delimiter + value + delimiter
    text = ''.join(k+'='+dotenv_value(v)+'\n' for k,v in data.items())
    apply_secret('rent-'+app+'-runtime', {'runtime.env':text})
admin = password('admin-password')
backup = password('backup-password')
apply_secret('postgres-admin', {'password':admin})
apply_secret('postgres-ca', {'ca.crt':(pki/'ca.crt').read_text()})
apply_secret('postgres-tls', {'tls.crt':(pki/'server.crt').read_text(),'tls.key':(pki/'server.key').read_text()})
apply_secret('postgres-bootstrap', {'PGUSER':'postgres','PGPASSWORD':admin,'APP_PASSWORD':app_password,'BACKUP_PASSWORD':backup})
apply_secret('postgres-maintenance', {'PGUSER':'postgres','PGPASSWORD':admin})
apply_secret('postgres-migration', {'PGUSER':app_user,'PGPASSWORD':app_password,'POSTGRES_USER':app_user,'POSTGRES_PASSWORD':app_password})
apply_secret('postgres-backup', {'PGUSER':'rent_backup','PGPASSWORD':backup})
backup_env = parse_env('/etc/rent-backup/r2.env')
backup_env['NEW_RELIC_LICENSE_KEY'] = runtime['NEW_RELIC_LICENSE_KEY']
backup_env['RESTIC_CACHE_DIR'] = '/tmp/restic-cache'
apply_secret('rent-backup-env', backup_env)
print('Rent runtime, TLS and backup Secrets reconciled without disclosing credentials.')
