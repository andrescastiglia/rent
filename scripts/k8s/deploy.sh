#!/usr/bin/env bash
# Called by Ansible on oracle; applications are never built on the host.
set -euo pipefail
images="$(realpath "$1")"
sha="$2"
mode="${3:-release}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]]
cd "$(dirname "$0")/../.."
root=/etc/rent-kubernetes
mkdir -p "$root"
rollback() {
  status=$?
  trap - ERR
  if [ -f "$root/active" ] && [ -f "$root/deployed.yaml" ]; then
    if [ -f "$root/secrets-before-release.json" ]; then
      k3s kubectl apply --server-side --field-manager=rent-secrets -f "$root/secrets-before-release.json" >/dev/null || true
    fi
    k3s kubectl apply -f "$root/deployed.yaml" >/dev/null || true
    echo 'Restored previous Kubernetes application definitions; database writes were retained.' >&2
  else
    echo 'Initial activation failed. The restored database is retained; do not reactivate the old writers without reconciliation.' >&2
  fi
  exit "$status"
}
trap rollback ERR
if [ "$mode" != stage ] && [ ! -f "$root/active" ] && [ ! -f "$root/migration-ready" ]; then
  echo 'Final frozen database restore must be verified before activation.' >&2
  exit 1
fi
if [ "$mode" != stage ] && [ ! -f "$root/active" ] && [ "$(cat "$root/migration-ready")" != "$sha" ]; then
  echo 'Verified restore SHA does not match the release.' >&2
  exit 1
fi
# PostgreSQL upgrades are separate operations; application releases retain its
# already tested digest rather than restarting the database on every app tag.
python3 - "$images" <<'PY'
import json,subprocess,sys
p=sys.argv[1];images=json.load(open(p))
r=subprocess.run(['k3s','kubectl','-n','rent','get','statefulset','postgres','-o','json'],capture_output=True,text=True)
if r.returncode==0:
    image=json.loads(r.stdout)['spec']['template']['spec']['containers'][0]['image']
    if '@sha256:' in image:
        images['postgres']=image
        with open(p,'w') as f:json.dump(images,f)
PY
python3 scripts/k8s/render.py "$images" --stage > "$root/staged.yaml"
# Select explicitly by kind so staging a release never scales existing apps down.
python3 - "$root/staged.yaml" <<'PY' | k3s kubectl apply -f - >/dev/null
import sys,yaml
items=[x for x in yaml.safe_load_all(open(sys.argv[1])) if x and x['kind']!='Deployment']
print(yaml.safe_dump_all(items))
PY
k3s kubectl -n rent rollout status statefulset/postgres --timeout=300s
maintenance="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["maintenance"])' "$images")"
run_admin_job() {
  action="$1"
  timeout="$2"
  python3 scripts/k8s/run-job.py "$action" "$sha" --image "$maintenance" > "$root/$action-job.json"
  job_name="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["metadata"]["name"])' "$root/$action-job.json")"
  # Job templates are immutable. Reuse an existing release Job instead of
  # attempting to replace its image on a repeated release invocation.
  if ! k3s kubectl -n rent get job "$job_name" >/dev/null 2>&1; then
    k3s kubectl create -f "$root/$action-job.json" >/dev/null
  fi
  k3s kubectl -n rent wait --for=condition=complete "job/$job_name" --timeout="$timeout"
}
run_admin_job bootstrap 180s
if [ "$mode" = stage ]; then
  # Create zero-replica deployments only during the initial rehearsal.
  if ! k3s kubectl -n rent get deployment backend >/dev/null 2>&1; then
    python3 - "$root/staged.yaml" <<'PY' | k3s kubectl apply -f - >/dev/null
import sys,yaml
print(yaml.safe_dump_all([x for x in yaml.safe_load_all(open(sys.argv[1])) if x and x['kind']=='Deployment']))
PY
  fi
  echo 'Database staged; application writers and all schedules remain suspended.'
  exit 0
fi
run_admin_job migrate 600s
python3 scripts/k8s/render.py "$images" > "$root/candidate.yaml"
# First activate HTTP applications. RAG and schedules follow the public switch.
python3 - "$root/candidate.yaml" <<'PY' | k3s kubectl apply -f - >/dev/null
import sys,yaml
items=[x for x in yaml.safe_load_all(open(sys.argv[1])) if x and x['kind']=='Deployment' and x['metadata']['name']!='rag-worker']
print(yaml.safe_dump_all(items))
PY
for app in backend frontend; do k3s kubectl -n rent rollout status "deployment/$app" --timeout=300s; done
curl --fail --silent --max-time 15 http://127.0.0.1:30080/health >/dev/null
curl --fail --silent --max-time 15 http://127.0.0.1:30081/health >/dev/null
python3 scripts/k8s/switch-nginx.py
python3 - "$root/candidate.yaml" <<'PY' | k3s kubectl apply -f - >/dev/null
import sys,yaml
print(yaml.safe_dump_all([x for x in yaml.safe_load_all(open(sys.argv[1])) if x and (x['kind']=='CronJob' or (x['kind']=='Deployment' and x['metadata']['name']=='rag-worker'))]))
PY
k3s kubectl -n rent rollout status deployment/rag-worker --timeout=300s
install -m 600 "$root/candidate.yaml" "$root/deployed.yaml"
install -m 600 "$images" "$root/images.json"
printf '%s\n' "$sha" > "$root/active"
rm -f "$root/migration-ready" "$root/secrets-before-release.json"
echo "Rent Kubernetes release active: $sha"
