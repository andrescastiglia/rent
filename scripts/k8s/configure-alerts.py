#!/usr/bin/env python3
"""Reconcile only Rent's New Relic policy. Run on oracle with protected input."""
import json, subprocess, sys, urllib.request
config=json.loads(subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify(require('node:util').parseEnv(require('node:fs').readFileSync(process.argv[1],'utf8'))))",sys.argv[1]]))
account=int(config['NEW_RELIC_ACCOUNT_ID'])
def graphql(query,variables=None):
    request=urllib.request.Request('https://api.newrelic.com/graphql',data=json.dumps({'query':query,'variables':variables or {}}).encode(),headers={'Content-Type':'application/json','API-Key':config['NEW_RELIC_API_KEY']})
    with urllib.request.urlopen(request,timeout=30) as response:result=json.load(response)
    if result.get('errors'):raise RuntimeError(json.dumps(result['errors']))
    return result['data']
policies=graphql('query($a:Int!){actor{account(id:$a){alerts{policiesSearch{policies{id name}}}}}}',{'a':account})['actor']['account']['alerts']['policiesSearch']['policies']
policy=next((p for p in policies if p['name']=='Rent Kubernetes production'),None)
if policy is None:
    policy=graphql('mutation($a:Int!){alertsPolicyCreate(accountId:$a,policy:{name:"Rent Kubernetes production",incidentPreference:PER_CONDITION}){id name}}',{'a':account})['alertsPolicyCreate']
conditions=graphql('query($a:Int!){actor{account(id:$a){alerts{nrqlConditionsSearch(searchCriteria:{policyId:'+json.dumps(policy['id'])+'}){nrqlConditions{id name}}}}}}',{'a':account})['actor']['account']['alerts']['nrqlConditionsSearch']['nrqlConditions']
existing={c['name']:c['id'] for c in conditions}
def reconcile(name,query,threshold,operator='ABOVE',heartbeat=False):
    condition={'name':name,'enabled':True,'nrql':{'query':query},'signal':{'aggregationWindow':300,'aggregationMethod':'EVENT_TIMER','aggregationTimer':60},'terms':[{'threshold':threshold,'thresholdOccurrences':'AT_LEAST_ONCE','thresholdDuration':300,'operator':operator,'priority':'CRITICAL'}],'valueFunction':'SINGLE_VALUE','violationTimeLimitSeconds':86400,'runbookUrl':'https://github.com/andrescastiglia/rent/blob/main/docs/deployment/kubernetes.md'}
    if heartbeat:condition['expiration']={'expirationDuration':1200,'openViolationOnExpiration':True,'closeViolationsOnExpiration':False}
    variables={'a':account,'c':condition,'id':existing.get(name,policy['id'])}
    action='alertsNrqlConditionStaticUpdate' if name in existing else 'alertsNrqlConditionStaticCreate'
    argument='id' if name in existing else 'policyId'
    result=graphql('mutation($a:Int!,$id:ID!,$c:AlertsNrqlConditionStaticInput!){'+action+'(accountId:$a,'+argument+':$id,condition:$c){id name}}',variables)
    print(json.dumps(result[action]))
reconcile('Rent — application or PostgreSQL unavailable','SELECT latest(rent.platform.unhealthy) FROM Metric',0,heartbeat=True)
reconcile('Rent — failed scheduled or manual task','SELECT latest(rent.platform.failed_jobs) FROM Metric',0)
reconcile('Rent — backup older than 24 hours','SELECT latest(rent.platform.backup_age_seconds) FROM Metric',86400)
reconcile('Rent — shared disk above 85 percent','SELECT latest(rent.platform.disk_used_percent) FROM Metric',85)
reconcile('Rent — encrypted backup or restore drill failed','SELECT latest(rent.backup.success) FROM Metric FACET backup.kind',1,operator='BELOW')
