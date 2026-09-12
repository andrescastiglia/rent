#!/usr/bin/env python3
import json, re, sys
from pathlib import Path
folder, sha = sys.argv[1:]
if not re.fullmatch('[0-9a-f]{40}',sha): raise SystemExit('Full SHA required')
result={}
for app in ['backend','frontend','batch','postgres','maintenance']:
    data=json.loads((Path(folder)/(app+'.json')).read_text())
    if data['sha']!=sha or data['app']!=app: raise SystemExit('Image revision mismatch')
    result[app]=data['image']
print(json.dumps(result,indent=2))
