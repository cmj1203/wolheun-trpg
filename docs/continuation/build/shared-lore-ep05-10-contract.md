# 5~10화 공유 로어 통합 계약

2026-11-09. 현재 추가 패치 단계만 완료했다. 기존 shared-lore.patch와 공유 live 파일, 대본·엔진·테스트는 수정하지 않았다. 새 산출물은 shared-lore-ep05-10.patch와 이 문서뿐이다. 부모 세션 이동 시 이 문서를 인계 기준으로 사용한다. session-handoff-20261109.md는 부모 소유이므로 직접 수정하지 않았다.

## 적용 기준

이 패치는 현재 공유 로어 스냅샷 SHA-256 fb66ed319d4263ccf5822f38a4399f847c54af887571d9eabd70b4a1831611eb를 기준으로 작성했다. 스냅샷에는 3~4화의 분리된 man_true/man_ruler/man_la_kun/ep03_harem와 안내 시녀·잘릴 등 여덟 인물 정의가 이미 있었다. 기존 shared-lore.patch가 리드 최종 검토 중이라는 상태와 구분한다. 3~4화 분리 조건을 채택하지 않은 로어에 이 추가 패치만 적용해 전체 통합 완료로 보지 않는다. 기존 패치의 내용을 포함하거나 덮어쓰지 않는다.

새 패치는 lore_wolheun.yaml에 지식 10개와 인물 8개만 추가한다. 기존 지식 19개·기존 인물 8개와 전체 forbidden 목록은 값 단위로 그대로 보존했다. 하렘·본명·왕 신분·라 쿤의 3~4화 조건과 사막 게이트를 다시 변경하지 않았다. 코드·문서의 공개 승인이나 배포 승인을 뜻하지 않는다.

## 원문 근거

5~10화 script.md의 관련 장면 전체 발화·독백·사건, scenes.json, continuation.md의 공개 주체와 미확정 목록을 읽었다. 소스 컷 수는 55+65+63+62+84+78=407개다. 새 이미지 재감사를 했다는 뜻은 아니다. 자료의 직접 관찰과 연속성 참고, 부분 관찰을 구분했다. 추가 메모 notes/facts/2026-11-09-wolheun-source-audit-and-costume.md 및 3화 원문감사를 확인했다. 복장·인접화 QA의 미확정은 확정 사실로 승격하지 않았다.

| 새 로어 키 | 전체 관련 장면 근거 | 성격·말투·지식·표정 근거 |
|---|---|---|
| 누르 | 5화 c011–c025·c044–c051, 7화 c028–c043, 8화 c019–c034·c055–c062, 10화 c017–c019 | 친절한 보필·신분 예법, 시녀를 물릴 수 있음, 호출 때 난처함. 아이라님/아시나님 존댓말. neutral/smile/surprised는 원문 반응 범위. 귀찌나 가문을 안다고 하지 않음 |
| 나시르 | 6화 c007·c017–c065 전체, 7화 c001–c019·c021·c051, 9화 c019–c068 | 정중한 조사·의심 유보·경험에 대한 긍정, 카림에게 반말. 칭찬하며 웃는 smile, 기본 neutral. 5화 청발 인물의 현재 cast 매핑은 인접화 동일성 재감사 전이므로 그 장면의 wary/scared를 나시르의 근거로 합치지 않음 |
| 카림 | 7화 c008–c019·c028–c043, 8화 c055–c062, 9화 c001–c015·c019–c043 | 임무 반문·경계 후 실례 사과, 아시나 앞에서 높임말. neutral/wary, 칭찬·수다에 말이 막히는 flustered. 사생활·임명시험·칼을 잡은 나이 답은 없음 |
| 게디크 | 8화 c031–c054 전체 | 누르가 말한 것은 직책뿐. 별도 알현에서 격식 있는 제안·미소·거절 뒤 놀람과 불쾌함. neutral/smile/surprised의 원문 근거. 장기 보복 계획은 미공개 |
| 검은 머리 신하 | 5화 c037–c044 전체 | 청발 신하를 부추기고 왕 앞에서 정치적 우려를 높임말로 전함. neutral/wary. 고유 이름·카림과 동일인 여부 미확정 |
| ep06_도착보고자 | 6화 c017–c021 | 화면 밖에서 서기관 도착을 알리는 높임말 한 줄. 외형·다른 성격·다른 시종과 동일인 여부 미확정. neutral 외 근거 없음 |
| ep09_장발대족장 | 9화 c075–c084, 10화 c001–c005의 아시나 회고 | 기척에 반응한 뒤 소동물이라며 웃는 neutral/smile. 실명·잘릴과 동일인 여부·감지 원리·공격 결과 미공개 |
| ep09_대족장동행 | 9화 c078–c084 | 상대에게 왜 그러십니까/대족장이시여라고 물음. 고유 이름·직책·별도 성격 미확정. neutral 외 근거 없음 |

표정은 원문에 근거한 의미상의 상한이다. 현재 모든 화에 해당 cast.faces와 자산이 준비됐다는 뜻이 아니다. 새 고정 reactions는 추가하지 않았다. 단 한 줄만 있는 인물은 values를 빈 배열로 두었고, 성격과 외형의 미확정을 명시했다.

자키야는 8화 c048에서 게디크가 딸 이름을 말하고 c049에 초상이 끼는 정도다. 새 발화 cast·말투·성격·가치관 근거가 없어 character 정의를 만들지 않았다. 크롬웰 황제도 현재 5~10 원문·cast에서 별도 인물로 확정할 근거가 없다. 9화 YAML의 ep09_황제는 lore: 베히다트이며 크롬웰 황제가 아니다. 이 두 이름을 채우려 새 인격을 지어내지 않는다.

## 실제 공개 조건

| 추가 지식 ID | 실제 공개 줄·조건 |
|---|---|
| ep05_nur | ep05_c014 line 0 sets: ep05_아시나_누르소개 |
| ep05_aira_meaning | ep05_c017 line 0 sets: ep05_아시나_아이라뜻 |
| ep06_nasir | ep06_c021 line 1 sets: ep06_아시나_나시르소개 |
| ep07_karim | ep07_c040 line 3 카림입니다.의 effects.flags.ep07_카림_이름앎 |
| ep08_jahannam_name | ep08_c008 line 0 sets: ep08_r03. c010의 탈옥 전례 설명은 포함하지 않음 |
| ep08_harem_residents | ep08_c026 line 1 sets: ep08_r07 |
| ep08_harem_marriage | ep08_c027 line 2 sets: ep08_r08 |
| ep08_clan_marriage | ep08_c028 line 1 sets: ep08_r09 |
| ep08_vizier_office | ep08_c034 line 0 sets: ep08_r10. 직책과 누르의 추측만 포함 |
| ep10_eye_notice | ep10_c078 line 3 또는 ep10_distance_question line 2의 effects.flags.ep10_눈색인지_앎 |

모두 실제 존재하는 줄별 효과를 조건으로 사용했다. 이전 줄이나 비트 진입 때 공개하지 않는다. 아이라는 3화에서 이미 호칭을 들었으므로 새 설명 항목의 keys는 아이라의 뜻으로 한정한다. 아이라라는 단어 자체를 다시 잠그지 않는다. 원혼·저주·출신 가문·짐의 실제 내용 등 기존 facts에 이미 구분된 것은 새 이름 공개와 섞지 않는다.

게디크·자키야의 정적 spoilers는 유지한다. ep08_r11/r17 같은 관객 알현 플래그를 새 아시나 지식 조건으로 쓰지 않는다. 게디크가 말한 딸·연회, 5화 자이드 보고와 그 일, 6화 밀명과 나시르 내면, 7화 카림 배정 면담과 타무라 상세, 9화 대족장 호칭과 칼, 10화 왕의 c071 내면은 아시나 기억이 아니다. characters의 인물 지침은 지식 수첩으로 복사하지 않는다. 향후 원작에서 아시나가 직접 듣는 장면이 확인되기 전에는 이 잠금을 풀지 않는다.

## 별칭·배우 계약과 별도 소유 변경

| 현재 배우 | 로어 연결 |
|---|---|
| ep05_여성·ep05_누르, ep07_누르, ep08_누르, ep10_누르 | 누르. 현재 cast의 연결 유지. 소개 전 display는 방의 여성으로 유지 |
| ep05_청발, ep06_청발회상·청발·나시르·나시르독백, ep07_조사관·나시르, ep09_수행자·수행자독백·나시르·나시르독백 | 나시르가 현재값. 5화 개인 실명은 미공개. 6화 c021 이전 이름표에 나시르를 미리 내지 않으며 5화 동일성은 원작 인접화 재감사 필요 |
| ep05_흑발 | 검은 머리 신하 유지. 근거 없이 카림으로 합치지 않음 |
| ep07_호위·카림·카림독백, ep09_카림 | 카림 유지. 사막의 일반 호위까지 자동 합치지 않음 |
| ep08_대재상·게디크 | 게디크 유지. 아시나가 이름을 안다는 조건과 별개 |
| ep07_은발남성·은발남성독백 | 현재 ep07_은발남성에서 베히다트로 대본 담당이 고칠 것. 4화 공개와 5~6화 대면을 계승하며 새 인물 기억으로 분리하지 않음 |
| ep06_보고자 | 현재 lore 없음 → ep06_도착보고자. 정체 미확정 유지 |
| ep09_장발·대족장 | 현재 잘릴 → ep09_장발대족장으로 대본 담당이 고칠 것. 현재 원문은 실명을 말하지 않음. 별도 로어 키는 임시 식별이며 확정된 다른 사람이라는 주장도 아님 |
| ep09_동행 | 현재 lore 없음 → ep09_대족장동행 |
| ep09_상상 | 아시나 유지. 나시르의 실제 새 발언으로 저장하지 않음 |
| ep05_목소리, ep08_미확정, ep10 c070 침묵 | 미확정 유지. 임의로 다른 배우 lore를 붙이지 않음 |

안내 시녀≠누르: 별도 정의·이름 목록을 유지한다. 누르가 아시나 이름을 안 경위, 5화 두 신하의 개인 이름, 자이드=게디크, 8화 아슈마에/이슈마에의 정식 표기, 9화 대족장=잘릴은 확정하지 않았다. 이름을 모른다는 것과 신체·장면상 같은 배우임을 확인하는 것을 분리한다.

## 공유 엔진·검증 의존

withNotes는 누락 lore key를 검사하지 않는다. checkNotes와 기존 characters.reactions의 faceProblem만 검사하므로 로어가 빠져도 프롬프트 지침과 말투 검사가 조용히 비는 문제가 있다. 이 추가 정의는 그 소비를 채우며, 위 cast 연결 변경은 대본 담당 소유다. 기존 반응 목록을 지워 withNotes를 억지 통과시키지 않았다.

현재 faceProblem은 각 배우 cast.faces와 같은 lore 배우의 sprite/표정 자산을 요구한다. 새 궁정 인물에 사막 입식을 달지 않는다. CG 전용 명시 계약을 추가할 경우 선언된 faces 검사는 유지하고, 해당 줄의 유효 CG를 확인하는 경우에만 입식 파일 의존을 대체해야 한다. 미선언 표정·없는 CG·CG 없는 대사에 대한 실패는 유지한다. 본 패치에는 엔진 변경이 없다. 기존 3~4화 계약의 CG 전용 지원 의존을 그대로 계승한다.

현재 ep10_시하드뜻_앎(c049), ep10_베히님(c053)은 beat.effects라 발화 전에 켜진다. 대본 담당이 실제 설명·수락 마지막 줄의 effects로 옮겨야 한다. 이번 패치는 두 조건으로 새 지식을 열지 않으므로 이를 이용한 새 선행 공개는 추가하지 않았다. 이름의 의미나 베히님 별칭은 해당 발화 이후에만 기억에 반영한다.

## 실제 검증 결과

메모리에서 unified diff의 문맥·줄수·전체 결과를 검사했고 제안 로어 파싱에 성공했다. 모든 기존 지식·인물·금지 그룹 보존, 10개 조건 각각의 공개 전/후 및 비순차 단독 활성화 독립성, 관객 플래그로 새 지식이 열리지 않음, 누르/나시르/카림 이름 검열 경계, 게디크/자키야 정적 잠금 보존, 열 조건의 실제 줄 효과 존재를 검사해 통과했다.

| 대본 | 독립 parseScenario | 독립 withNotes 기존 오류 | 기존 ep01+02 비트를 보존한 합성 withNotes 기존 오류 |
|---|---|---|---|
| ep05_audience | 통과 | 32 | 16 |
| ep06_library | 통과 | 32 | 16 |
| ep07_harem | 통과 | 16 | 0 |
| ep08_harem | 통과 | 48 | 32 |
| ep09_palace | 통과 | 28 | 12 |
| ep10_internal | 통과 | 28 | 12 |

원본 로어와 제안 로어의 오류 배열은 각 행에서 완전히 동일했다. 독립 오류 중 16건은 기존 stars/captive/strangers/man/guards.after가 1화 비트를 참조하기 때문이다. 합성 뒤 남는 오류는 기존 베히다트.reactions와 해당 화 cast.faces 계약 불일치다. 5화는 초기에 ending.next_hook 누락으로 파싱 실패했으나 담당의 동시 작성 뒤 마지막 검증에서 통과했다. 실패를 이 레인에서 고친 것은 아니다.

합성은 각 독립 시나리오의 cast를 그대로 두고 실제 loadCampaignScenario(ep01)의 기존 비트만 더한 수첩 참조 검사다. 서로 충돌하는 전역 cast를 덮어써 통합 성공처럼 보이지 않았다. 새 화 실제 전이 연결·전체 캠페인 checkScenario·자유대화 모델 출력·렌더 QA·CG 자산 검증은 실행하지 않았다. 따라서 이 결과는 추가 패치의 로어·공개 계약 검증이지 5~10화 게임 전체 READY가 아니다. 부모는 3→4 렌더 작업을 계속하고 위 소유별 수정·기존 실패를 후속 통합에서 처리한다.

## 재현 명령

저장소 루트에서 실행하며 파일을 수정하지 않는다. 실제 live에 3~4화 분리 기준이 있어야 한다. 이미 추가 패치까지 적용한 뒤 재실행할 검증기는 아니며 적용 전 검사용이다.

```sh
bun -e 'const m=await Bun.file("docs/continuation/build/shared-lore-ep05-10-contract.md").text(); const c=m.split("```javascript\n")[1].split("```")[0]; await eval("(async()=>{"+c+"})()")'
```

```javascript
const root=process.cwd();
const assert=(ok,message)=>{if(!ok)throw Error(message)};
const {parseLore,withNotes,loreFor,spoilersFor}=await import(root+'/app/src/gm/lore.ts');
const {parseScenario}=await import(root+'/app/src/engine/scenario.ts');
const {loadCampaignScenario}=await import(root+'/app/src/engine/continuation.ts');
const {forbiddenIn}=await import(root+'/app/src/gm/validate.ts');
const base=await Bun.file('app/content/lore_wolheun.yaml').text();
const diff=await Bun.file('docs/continuation/build/shared-lore-ep05-10.patch').text();
const applyMemory=(base,diff)=>{var lines=base.split('\n');var hs=diff.split('\n');var out=[],cursor=0;for(var i=2;i<hs.length;i++){var m=/^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/.exec(hs[i]);if(!m)continue;var start=Number(m[1])-1;out.push(...lines.slice(cursor,start));cursor=start;var oldCount=0,newCount=0;while(i+1<hs.length&&!hs[i+1].startsWith('@@')&&hs[i+1]!==''){var l=hs[++i];if(l[0]!=='+' ){if(lines[cursor]!==l.slice(1))throw Error('패치 문맥 불일치 '+cursor);cursor++;oldCount++}if(l[0]!=='-'){out.push(l.slice(1));newCount++}}if(oldCount!==+m[2]||newCount!==+m[4])throw Error('패치 줄수 불일치')}out.push(...lines.slice(cursor));return out.join('\n')};
const old=parseLore(base), lore=parseLore(applyMemory(base,diff));
for(const entry of old.knowledge)assert(Bun.deepEquals(entry,lore.knowledge.find(n=>n.id===entry.id)), '기존 지식 '+entry.id);
for(const [key,value]of Object.entries(old.characters))assert(Bun.deepEquals(value,lore.characters[key]),'기존 인물 '+key);
assert(Bun.deepEquals(old.forbidden,lore.forbidden),'전체 기존 검열 보존');
assert(old.knowledge.find(n=>n.id==='man_true')?.if==='flag:ep04_name_known' && old.characters['안내 시녀'], '3~4화 통합 기준 필요');
const added=lore.knowledge.filter(n=>!old.knowledge.some(o=>o.id===n.id));
assert(added.length===10,'추가 지식 수');
const empty={tracks:{},abilities:{},items:[],flags:{}};
for(const n of added){
  const flag=n.if.slice(5), state={...empty,flags:{[flag]:true}};
  assert(!loreFor(lore,empty).knowledge.some(x=>x.id===n.id),'공개 전 '+n.id);
  assert(loreFor(lore,state).knowledge.some(x=>x.id===n.id),'공개 후 '+n.id);
  for(const other of added.filter(x=>x.id!==n.id))assert(!loreFor(lore,state).knowledge.some(x=>x.id===other.id),'독립 조건 '+other.id);
}
for(const state of [empty,{...empty,flags:{ep05_독자_자이드보고:true,ep05_독자_대재상우려:true,ep06_독자_조사명령:true,ep08_r11:true,ep08_r17:true,ep09_r14:true}}]){
  for(const name of ['게디크','자키야'])assert(spoilersFor(lore,state).some(t=>forbiddenIn(name,t)),'관객 공개 잠금 '+name);
  assert(!loreFor(lore,state).knowledge.some(n=>added.some(a=>a.id===n.id)),'관객 플래그로 새 지식 해제 금지');
}
for(const [flag,name]of [['ep05_아시나_누르소개','누르'],['ep06_아시나_나시르소개','나시르'],['ep07_카림_이름앎','카림']]){
  assert(spoilersFor(lore,empty).some(t=>forbiddenIn(name,t)),'이름 이전 '+name);
  assert(!spoilersFor(lore,{...empty,flags:{[flag]:true}}).some(t=>forbiddenIn(name,t)),'이름 이후 '+name);
}
assert(!lore.characters['누르'].names.includes('안내 시녀'),'안내 시녀 동일시 금지');
assert(!lore.characters['ep09_장발대족장'].names.includes('잘릴'),'장발 대족장 동일시 금지');
const paths=["app/content/ep05_audience.yaml","app/content/ep06_library.yaml","app/content/ep07_harem.yaml","app/content/ep08_harem.yaml","app/content/ep09_palace.yaml","app/content/ep10_internal.yaml"];
const campaign=await loadCampaignScenario(root+'/app/content/ep01_desert.yaml');
const errors=(s,l)=>{try{withNotes(s,l);return []}catch(e){return e.message.split('\n').filter(x=>x.startsWith('- '))}};
const allRaw=[];
for(const path of paths){
  const text=await Bun.file(path).text(), raw=Bun.YAML.parse(text);allRaw.push(raw);
  let s;
  try{s=parseScenario(text)}catch(e){assert(path.endsWith('ep05_audience.yaml')&&e.message.includes('ending.next_hook'), '미기록 파싱 실패 '+path+' '+e.message);console.log(path,'기존 파싱 실패:',e.message);continue;}
  const standalone=errors(s,lore);assert(Bun.deepEquals(errors(s,old),standalone),'독립 새 오류 '+path);
  const combined={...s,beats:{...campaign.beats,...s.beats}};
  const combinedErrors=errors(combined,lore);assert(Bun.deepEquals(errors(combined,old),combinedErrors),'합성 새 오류 '+path);
  console.log(path,'파싱 통과; 독립/기존 비트 합성 수첩 오류',standalone.length,combinedErrors.length);
}
for(const n of added){
  const flag=n.if.slice(5);
  assert(allRaw.some(y=>Object.values(y.beats).some(b=>(b.lines??[]).some(l=>l.sets===flag||l.effects?.flags?.[flag]===true))),'실제 줄 공개 플래그 '+flag);
}
assert(await Bun.file('app/content/lore_wolheun.yaml').text()===base,'공유 로어 불변');
console.log('메모리 패치·원본 보존·열 지식의 독립 공개·관객 잠금·별칭 경계 통과. 기존 수첩 실패는 위 출력 참조.');
```
