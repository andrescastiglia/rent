#!/usr/bin/env python3
"""Render the Kustomize overlay with checked immutable image references."""
import argparse, json, re, shutil, subprocess, tempfile
from pathlib import Path
import yaml
parser=argparse.ArgumentParser()
parser.add_argument('images')
parser.add_argument('--stage',action='store_true')
args=parser.parse_args()
images=json.loads(Path(args.images).read_text())
expected={'backend','frontend','batch','postgres','maintenance'}
if set(images)!=expected: raise SystemExit('Five immutable image references are required')
for app,image in images.items():
    if not re.fullmatch('ghcr.io/andrescastiglia/rent-'+app+r'@sha256:[0-9a-f]{64}',image): raise SystemExit('Invalid image digest for '+app)
root=Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory() as temporary:
    path=Path(temporary)/'k8s'
    shutil.copytree(root/'k8s',path)
    overlay=path/'overlays/production/kustomization.yaml'
    config=yaml.safe_load(overlay.read_text())
    config['images']=[{'name':'ghcr.io/andrescastiglia/rent-'+app,'newName':image.split('@')[0],'digest':image.split('@')[1]} for app,image in images.items()]
    if args.stage:
        for replica in config['replicas']: replica['count']=0
        config['patches'][0]['patch']='- op: replace\n  path: /spec/suspend\n  value: true\n'
    overlay.write_text(yaml.safe_dump(config))
    cmd=['k3s','kubectl'] if shutil.which('k3s') else ['kubectl']
    subprocess.run(cmd+['kustomize',str(overlay.parent)],check=True)
