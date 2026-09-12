#!/usr/bin/env python3
"""Keep rehearsal reservations isolated from production and all writers suspended."""
import json, os, subprocess, sys, tempfile
from pathlib import Path
import yaml
script=Path(__file__).with_name('render.py')
with tempfile.TemporaryDirectory() as temporary:
    images=Path(temporary)/'images.json'
    images.write_text(json.dumps({app:'ghcr.io/andrescastiglia/rent-'+app+'@sha256:'+'0'*64 for app in ['backend','frontend','batch','postgres','maintenance']}))
    for flags,replicas,postgres_cpu,backup_cpu in [([],1,'250m','100m'),(['--stage'],0,'250m','100m'),(['--stage','--rehearsal'],0,'50m','25m')]:
        output=subprocess.check_output([sys.executable,str(script),str(images),*flags],text=True)
        resources=list(yaml.safe_load_all(output))
        for resource in resources:
            kind=resource['kind'];spec=resource.get('spec',{})
            if kind=='Deployment':assert spec['replicas']==replicas
            if kind=='StatefulSet':
                budget=spec['template']['spec']['containers'][0]['resources']
                assert budget['requests']=={'cpu':postgres_cpu,'memory':'512Mi'}
                assert budget['limits']=={'cpu':'1','memory':'1536Mi'}
            if kind=='CronJob':
                assert spec['suspend']==(replicas==0)
                if resource['metadata']['name']=='database-backup':assert spec['jobTemplate']['spec']['template']['spec']['containers'][0]['resources']['requests']['cpu']==backup_cpu
    invalid=subprocess.run([sys.executable,str(script),str(images),'--rehearsal'],capture_output=True)
    assert invalid.returncode!=0 and not invalid.stdout
print('Production budgets and writer-free rehearsal rendering verified.')
