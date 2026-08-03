from __future__ import annotations
import argparse,json,re
from pathlib import Path
from typing import Any
WORKFLOW_ROOT=Path('.github/workflows'); LOCKFILES={'npm':('package-lock.json',),'pnpm':('pnpm-lock.yaml',),'yarn':('yarn.lock',),'bun':('bun.lock','bun.lockb')}; ACTION_RE=re.compile(r'uses:\s*([^\s@]+)@([^\s#]+)'); RUN_ID_RE=re.compile(r'\brun-id\s*:\s*["\']?\d{6,}'); RETENTION_RE=re.compile(r'retention-days:\s*(\d+)')
def read_json(p:Path)->dict[str,Any]:
 v=json.loads(p.read_text(encoding='utf-8'))
 if not isinstance(v,dict): raise ValueError(f'{p} must contain a JSON object')
 return v
def has_event(t:str,e:str)->bool:return bool(re.search(rf'^\s{{2}}{re.escape(e)}\s*:',t,re.M))
def top_permissions(t:str)->dict[str,str]:
 lines=t.splitlines(); out={}
 for i,line in enumerate(lines):
  if line=='permissions:':
   for child in lines[i+1:]:
    if child and not child.startswith(' '): break
    m=re.match(r'^\s{2}([\w-]+):\s*(\w+)',child)
    if m: out[m.group(1)]=m.group(2)
   break
 return out
def inspect(p:Path,g:bool,rq:bool,max_days:int):
 t=p.read_text(encoding='utf-8'); acts=sorted({f'{a}@{b}' for a,b in ACTION_RE.findall(t)}); ev=[e for e in ('pull_request','push','workflow_run','workflow_dispatch','schedule') if has_event(t,e)]; perms=top_permissions(t); bad=[]; warn=[]
 if g:
  if not re.search(r'^name:\s*\S',t,re.M): bad.append('missing workflow name')
  if 'permissions:' not in t: bad.append('missing explicit permissions')
  if any(e in ev for e in ('pull_request','push')) and 'concurrency:' not in t: bad.append('PR/push workflow lacks concurrency control')
  if 'pull_request' in ev and any(v=='write' for v in perms.values()): bad.append('pull-request workflow grants top-level write authority')
  if rq and RUN_ID_RE.search(t): bad.append('required PR workflow contains a hard-coded cross-run ID')
  lines=t.splitlines()
  for i,line in enumerate(lines):
   if 'actions/upload-artifact@' in line:
    m=RETENTION_RE.search('\n'.join(lines[i:i+18]))
    if not m: bad.append('upload-artifact step lacks retention-days')
    elif int(m.group(1))>max_days: bad.append(f'upload-artifact retention exceeds {max_days} days')
 for a in acts:
  if a.startswith(('actions/checkout@v4','actions/setup-node@v4','actions/setup-python@v5')): warn.append(f'legacy action runtime: {a}')
 return {'path':p.as_posix(),'governed':g,'required_pr':rq,'events':ev,'permissions':perms,'actions':acts,'warnings':warn,'violations':bad},bad
def locks(policy):
 bad=[]; mgr=str(policy.get('package_manager','none')); package=Path('package.json').exists(); present=[x for vals in LOCKFILES.values() for x in vals if Path(x).exists()]
 if mgr=='none':
  if package or present: bad.append('package_manager is none but JavaScript package files exist')
  return bad
 if mgr not in LOCKFILES:return [f'unsupported package_manager: {mgr}']
 if not package: bad.append('package manager declared but package.json is missing')
 if len([x for x in LOCKFILES[mgr] if Path(x).exists()])!=1: bad.append(f'{mgr} requires exactly one recognized lockfile')
 foreign=[x for x in present if x not in LOCKFILES[mgr]]
 if foreign: bad.append(f'foreign package-manager lockfiles present: {foreign}')
 return bad
def main()->int:
 ap=argparse.ArgumentParser(); ap.add_argument('--policy',type=Path,default=Path('.github/ci-policy.json')); ap.add_argument('--output',type=Path,required=True); ap.add_argument('--enforce',action='store_true'); a=ap.parse_args(); policy=read_json(a.policy); governed=set(policy.get('governed_workflows',[])); required=set(policy.get('required_pr_workflows',[])); declared=governed|required|set(policy.get('release_workflows',[]))|set(policy.get('advisory_workflows',[])); bad=[]
 for rel in sorted(declared):
  if not Path(rel).is_file(): bad.append(f'declared workflow is missing: {rel}')
 ret=policy.get('artifact_retention_days',{}); pr=int(ret.get('pr_diagnostics',14)); build=int(ret.get('deployable_build',7)); durable=int(ret.get('durable_evidence',90))
 if not(1<=pr<=14 and 1<=build<=7 and 1<=durable<=90): bad.append('artifact retention classes exceed portfolio limits')
 audit=policy.get('dependency_audit',{})
 if audit.get('production_high_critical')!='blocking': bad.append('production High/Critical dependency risk must be blocking')
 if audit.get('development_tooling')!='advisory': bad.append('development/tooling dependency risk must be advisory')
 bad+=locks(policy); exc={str(k):int(v) for k,v in policy.get('retention_exceptions',{}).items()}; records=[]
 for p in sorted((*WORKFLOW_ROOT.glob('*.yml'),*WORKFLOW_ROOT.glob('*.yaml'))):
  rel=p.as_posix(); rec,found=inspect(p,rel in governed,rel in required,exc.get(rel,pr if rel in required else max(build,pr))); records.append(rec); bad += [f'{rel}: {m}' for m in found]
 report={'schema_version':'1.0.0','repository':policy.get('repository'),'default_branch':policy.get('default_branch'),'workflow_count':len(records),'governed_workflow_count':len(governed),'violations':bad,'workflows':records,'branch_protection':policy.get('branch_protection',{})}; a.output.parent.mkdir(parents=True,exist_ok=True); a.output.write_text(json.dumps(report,indent=2,sort_keys=True)+'\n',encoding='utf-8'); print(f'CI policy: workflows={len(records)} governed={len(governed)} violations={len(bad)}'); [print(f'CI POLICY VIOLATION: {x}') for x in bad]; return 1 if a.enforce and bad else 0
if __name__=='__main__': raise SystemExit(main())
