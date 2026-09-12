#!/usr/bin/env python3
"""Change only the Rent vhost; retain routing, TLS and other applications."""
from pathlib import Path
import re,subprocess
path=Path('/etc/nginx/sites-enabled/rent').resolve()
text=path.read_text()
backup=Path('/etc/rent-kubernetes/nginx-before-kubernetes.conf')
if not backup.exists(): backup.write_text(text);backup.chmod(0o600)
# Explicit proxy_pass replacements avoid changing shared upstream definitions.
updated=re.sub(r'(?m)^(\s*proxy_pass\s+)http://backend(?=[/;])',r'\1http://127.0.0.1:30081',text)
updated=re.sub(r'(?m)^(\s*proxy_pass\s+)http://frontend(?=[/;])',r'\1http://127.0.0.1:30080',updated)
updated=updated.replace('http://127.0.0.1:3001','http://127.0.0.1:30081').replace('http://127.0.0.1:3000','http://127.0.0.1:30080')
# A dedicated include supplies the temporary Rent maintenance response.
updated=updated.replace('    include /etc/rent-kubernetes/maintenance.conf;\n','')
if 'http://127.0.0.1:30081' not in updated or 'http://127.0.0.1:30080' not in updated: raise SystemExit('Unexpected Rent nginx upstreams; no changes applied')
path.write_text(updated)
try:
 subprocess.run(['nginx','-t'],check=True,capture_output=True)
 subprocess.run(['systemctl','reload','nginx'],check=True)
except Exception:
 path.write_text(text)
 raise
Path('/etc/rent-kubernetes/maintenance-active').unlink(missing_ok=True)
print('Rent nginx routes switched to private Kubernetes NodePorts.')
