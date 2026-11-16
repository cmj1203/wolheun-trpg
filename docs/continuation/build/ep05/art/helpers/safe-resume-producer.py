import os,sys,json,subprocess,hashlib,struct,time,re,traceback,fcntl
from pathlib import Path
from datetime import datetime,timezone
from PIL import Image,ImageDraw,ImageFont
r=Path("/Users/choeminju/월흔_trpg");a=r/'docs/continuation/build/ep05/art'
m=json.loads((a/'candidate-input-manifest.json').read_text());cs={c['id']:c for c in m['candidates']};policy=json.loads((a/'safe-resume-policy.json').read_text())
lock=(a/'recovered-producer.lock').open('a')
fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
results=json.loads((a/'safe-resume-manifest.json').read_text())['results'];service_blocker=None;current_candidate=None;font=ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc',22)
def save(path,data):
 tmp=Path(str(path)+'.tmp')
 with tmp.open('w') as f:
  f.write(json.dumps(data,ensure_ascii=False,indent=2));f.flush();os.fsync(f.fileno())
 tmp.replace(path)
def checkpoint():
 good=[k for k,v in results.items() if v.get('output_exists') and (v.get('exit_code')==0 or v.get('recovered_output') is True)]
 failed=[k for k,v in results.items() if v.get('terminal_blocked')]
 pending=[k for k in policy['allowed_order'] if k not in results]
 data={'episode':5,'updated_at':datetime.now(timezone.utc).isoformat(),'stage':'공유 서비스 차단' if service_blocker else ('허용된 비성적 장면 처리 종료' if not pending else '허용된 비성적 장면 순차 생성 중'),'planned_slots':74,'actualPNG':1+len(good),'terminalBlocked':1+len(failed),'held':15,'textReuse':2,'uncalled_eligible':len(pending),'independentApproved':0,'installed':0,'overall_art_complete':False,'blocked_story_anchor_unresolved':'ep05_c002_p01','blocked_anchor_replacement':None,'allowed_generation_scope':policy['allowed_order'],'held_ids':policy['held_ids'],'terminal_ids':['ep05_c002_p01']+failed,'native_calls_this_resume':sum(v.get('native_calls',0) for v in results.values()),'service_blocker':service_blocker,'results':results,'pending_eligible_ids':pending,'source_review_policy':'safe-resume-policy.json','old_partial_evidence':'generation-final-manifest.json','native_stop_after_current_control':'safe-resume-stop-before-next'}
 data['recovery_instruction']='현재 부모 RECOVERY GO·원래 safe55만. native-production-ownership.md·safe-resume-policy.json부터 읽기. stage1 재실행 금지.'
 save(a/'safe-resume-manifest.json',data)
 save(a/'recovered-producer-state.json',{'updated_at':data['updated_at'],'producer_pid':os.getpid(),'producer_pgid':os.getpgrp(),'producer_ppid':os.getppid(),'current_candidate':current_candidate,'actualPNG':data['actualPNG'],'pending':len(pending),'service_blocker':service_blocker,'phase':'blocked' if service_blocker else ('completed' if not pending else 'running')})
 return data
def board(c,output):
 path=a/'resume-source-side-by-side'/(c['id']+'.png');path.parent.mkdir(exist_ok=True)
 if path.exists():return str(path)
 with Image.open(r/c['input']['path']) as s,Image.open(output) as g:
  left=s.convert('RGB');right=g.convert('RGB');left.thumbnail((760,930));right.thumbnail((760,930));b=Image.new('RGB',(1600,1000),'#e7e5e0');d=ImageDraw.Draw(b)
  d.text((20,12),'원작 참조 · '+c['id'],font=font,fill='black');d.text((820,12),'생성 후보 · 독립 QA 대기',font=font,fill='black');b.paste(left,(20+(760-left.width)//2,55));b.paste(right,(820+(760-right.width)//2,55))
  with path.open('xb') as f:b.save(f,format='PNG',compress_level=3)
 return str(path)
launch={'producer_pid':os.getpid(),'producer_pgid':os.getpgrp(),'producer_ppid':os.getppid(),'launcher_pid':int(os.environ['EP05_LAUNCHER_PID']),'launcher_pgid':int(os.environ['EP05_LAUNCHER_PGID']),'started_at':datetime.now(timezone.utc).isoformat(),'command':[sys.executable,*sys.argv],'log':str(a/'recovered-producer.log'),'detached':os.getpid()==os.getpgrp() and os.getpgrp()!=int(os.environ['EP05_LAUNCHER_PGID'])}
if not launch['detached']:raise RuntimeError('독립 프로세스 그룹 분리 실패')
save(a/'recovered-producer-launch.json',launch)
try:
 for ident in policy['allowed_order']:
  if ident=='ep05_c002_p01' or ident in policy['terminal_ids'] or ident in policy['held_ids']:raise RuntimeError('보류·영구 거절 항목 실행 금지: '+ident)
  if (a/'safe-resume-stop-before-next').exists():service_blocker={'reason':'정상 현재 호출 종료 후 다음 호출 중단 제어 파일 감지'};checkpoint();break
  c=cs[ident];out=r/c['filename'];inp=r/c['input']['path'];record_path=a/'resume-native'/(ident+'-result.json')
  if out.exists():
   prior=a/'resume-after-block-result.json' if ident=='ep05_c010_p02' else record_path
   if not prior.exists():raise RuntimeError('기존 후보 출처를 확인할 수 없어 보호함: '+ident)
   record=json.loads(prior.read_text())
   if not record.get('output_exists') or not (record.get('exit_code')==0 or record.get('recovered_output') is True):raise RuntimeError('기존 결과 불일치: '+ident)
   if record.get('input_sha256')!=c['input']['sha256'] or hashlib.sha256(out.read_bytes()).hexdigest()!=record['sha256']:raise RuntimeError('기존 후보 출처·해시 불일치: '+ident)
   if ident in results:continue
  elif record_path.exists():
   record=json.loads(record_path.read_text())
   if not record.get('terminal_blocked'):raise RuntimeError('이전 호출 기록 보호: '+ident)
  else:
   start_path=a/'resume-native'/(ident+'-start.json');intent_path=a/'resume-native'/(ident+'-intent.json')
   if start_path.exists() or intent_path.exists():raise RuntimeError('기존 미완료 호출 보호·재생성 금지: '+ident)
   if hashlib.sha256(inp.read_bytes()).hexdigest()!=c['input']['sha256']:raise RuntimeError('승인 원작 입력 해시 불일치: '+ident)
   waiting=False
   while True:
    rows=[];groups=set();local=[]
    for line in subprocess.check_output(['ps','-axo','pid=,ppid=,pgid=,stat=,command='],text=True).splitlines():
     v=line.split(None,4)
     if len(v)==5 and 'Z' not in v[3] and Path(v[4].split()[0]).name=='codex' and ' exec ' in ' '+v[4]+' ':
      rows.append(line);groups.add(v[2])
      if str(r/'assets/ep05/gen') in v[4]:local.append(line)
    if len(groups)<3 and not local:break
    if not waiting:print('공유슬롯대기 '+ident+' 실제='+str(len(groups)),flush=True);waiting=True
    time.sleep(5)
   log=a/'resume-native'/(ident+'-attempt01.log');log.parent.mkdir(exist_ok=True)
   if log.exists():raise RuntimeError('기존 로그 보호·재호출 금지: '+ident)
   args=list(c['generation']['argv']);args[-1]=args[-1].replace('제목·원래 크레디트가 대상인 경우 원문 그대로 보존하세요. ','')
   args[-1]+=' 원작 로고·화수 표제·제목·출판 크레디트·워터마크는 문자 오버레이로 제거하고 다시 그리지 마세요. 반드시 Codex 내장 image_gen을 직접 호출하고 API·외부 도구·스크립트·로컬 SD로 대체하지 마세요. 원작 그림·의복·소품·가림과 패널 순서를 유지하고 새로운 몸·인물·사건을 만들지 마세요. 허용된 출력 외 파일은 수정하지 마세요. 독립 그림 PASS를 주장하지 마세요.'
   if (a/'safe-resume-stop-before-next').exists():raise RuntimeError('다음 호출 전 실제 중단 제어 파일 감지')
   if out.exists() or start_path.exists() or intent_path.exists():raise RuntimeError('호출 직전 기존 출력·영수증 발견, 중복 생성 방지: '+ident)
   current_candidate=ident;checkpoint()
   save(intent_path,{'candidate_id':ident,'input':str(inp),'input_sha256':c['input']['sha256'],'output':str(out),'argv':args,'created_at':datetime.now(timezone.utc).isoformat(),'producer_pid':os.getpid()})
   with log.open('xb') as f:
    p=subprocess.Popen(args,stdout=f,stderr=subprocess.STDOUT,stdin=subprocess.DEVNULL,env=os.environ.copy(),start_new_session=True)
    receipt={'candidate_id':ident,'pid':p.pid,'pgid':os.getpgid(p.pid),'supervisor_pid':os.getpid(),'supervisor_pgid':os.getpgrp(),'native_groups_before':len(groups),'processes_before':rows,'input':str(inp),'input_sha256':c['input']['sha256'],'log':str(log),'output':str(out),'started_at':datetime.now(timezone.utc).isoformat(),'argv':args,'independent_qa':'미실시'}
    receipt.update(supervisor_ppid=os.getppid(),native_ppid=os.getpid(),launcher_receipt='recovered-producer-launch.json')
    save(a/'resume-native'/(ident+'-start.json'),receipt)
    launch=json.loads((a/'recovered-producer-launch.json').read_text())
    start_document={**launch,'native':receipt,'status':'실제 독립 감독·native 실행 시작','independentApproved':0,'installed':0}
    if not (a/'recovered-resume-start.json').exists():
     save(a/'recovered-resume-start.json',start_document)
     (a/'recovered-resume-start.md').write_text('# 독립 안전 생성 실제 시작\n\n'+json.dumps(start_document,ensure_ascii=False,indent=2)+'\n')
    if ident=='ep05_c014_p01':print('일상첫시작 '+ident+' PID='+str(p.pid)+' PGID='+str(receipt['pgid']),flush=True)
    rc=p.wait()
   record={**receipt,'exit_code':rc,'output_exists':out.exists(),'native_calls':1,'finished_at':datetime.now(timezone.utc).isoformat()}
   if rc!=0 or not out.exists():
    tail=log.read_text(errors='replace');record.update(terminal_blocked=True,retry_eligible=False,failure_log_tail='\n'.join(tail.splitlines()[-20:]))
    record['failure_kind']='출력 안전 검사 거절' if 'moderation_blocked' in tail or 'safety_violations' in tail else '호출 실패 또는 PNG 미생성'
    matches=re.findall(r'(?:request ID |요청 ID[:：]?\s*|request_id[^a-zA-Z0-9]*)([a-zA-Z0-9-]{20,})',tail)
    if matches:record['request_id']=matches[-1]
    print('개별영구보류 '+ident+' '+record['failure_kind'],flush=True)
    service_blocker={'reason':record['failure_kind'],'candidate_id':ident,'log':str(log)}
  if record.get('output_exists'):
   if ident!='ep05_c010_p02':
    b=out.read_bytes()
    if b[:8]!=bytes([137,80,78,71,13,10,26,10]):raise RuntimeError('PNG 형식 아님: '+ident)
    with Image.open(out) as check:check.verify()
    record.update(sha256=hashlib.sha256(b).hexdigest(),bytes=len(b),width=struct.unpack('>I',b[16:20])[0],height=struct.unpack('>I',b[20:24])[0])
   record.update(status='existing-candidate',source_side_by_side=board(c,out),independent_qa='미요청·미실시',art_PASS=False,source_provenance=c['source'],anchors=c['anchors'])
  results[ident]=record;save(record_path,record);current_candidate=None;state=checkpoint()
  if len(results)%10==0:print('안전재개진행 처리='+str(len(results))+'/55 실제PNG='+str(state['actualPNG'])+' 영구보류='+str(state['terminalBlocked']),flush=True)
  if service_blocker:break
 state=checkpoint()
 (a/'safe-resume-result.md').write_text('# 별개 비성적 장면 재개 결과\n\n계획 위치 74. 실제 PNG '+str(state['actualPNG'])+' / 영구 도구 거절 '+str(state['terminalBlocked'])+' / 관련·불명확 보류 15 / 문자 유지 위치 2 / 독립 승인 0 / 설치 0.\n\n미호출 허용 장면 '+str(state['uncalled_eligible'])+'개. 기존 c002 앵커는 대체하지 않고 미해결로 보존한다. 전체 그림 완성 아님. 세부 영수증·원작 대조판·잔여 목록은 safe-resume-manifest.json과 resume-native/.\n')
 print('안전재개종료 실제PNG='+str(state['actualPNG'])+' 영구보류='+str(state['terminalBlocked'])+' 허용미호출='+str(state['uncalled_eligible']),flush=True)
except Exception as e:
 service_blocker={'reason':str(e),'traceback':traceback.format_exc()};checkpoint();print('안전재개차단 '+str(e),flush=True);raise
