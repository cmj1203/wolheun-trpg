# 공유 로어 통합 계약

2026-11-09. 공유 live 파일은 수정하지 않았다. 패치는 app/content/lore_wolheun.yaml 하나만 대상으로 한다.
기준 로어 SHA-256: e4406fb4787f2f8b5cb11f07a63f4adb0e74cec84c270a0e3c663135ce112918.

## 공개 경계

| 항목 | 최종 공개 줄 | 독립 조건 |
|---|---|---|
| ep03_harem | ep03_c040 마지막 시녀 발화 | flag:ep03_하렘_앎 |
| man_true, 본명만 | ep04_c040 마지막 남성 발화 | flag:ep04_name_known |
| man_ruler | ep04_c041 마지막 베히다트 발화 | flag:ep04_ruler_known |
| man_la_kun | ep04_c042 마지막 아시나 발화 | flag:ep04_title_known |

현재 ep04_night.yaml의 lines.sets와 동일한 이름을 채택했다. 부모가 c040/c041/c042의 세 이름과 ep03_하렘_앎을 직접 확인해 회신했다. 네 공개 줄의 sets를 실제 독립 파싱 결과에서도 확인했다. 비트 진입 효과로 옮기지 않는다. 본명 공개가 통치자·칭호 공개를 함축하지 않는다. 남자_정체_앎은 더 이상 이 세 정보를 동시에 열지 않는다. 시하드_호칭·감옥_앎·페시안_앎 및 나머지 지식은 그대로다. 정적 spoilers에서는 하렘 하나만 제거하고 hidden 조건으로 옮겼다.

## 원문 근거

읽은 자료: ~/.claude/CLAUDE.md, /Users/choeminju/.dori/briefs/wolheun-episodes03-10.md, docs/continuation/ep03 및 ep04의 script.md·scenes.json·continuation.md, docs/continuation/build/ep03/art/원문감사.md, 현재 두 화 YAML, lore.ts, gm.ts·prompt.ts·validate.ts, types.ts·scenario.ts·continuation.ts.

| 로어 키 | 확인한 전체 관련 장면 | 설정 범위 |
|---|---|---|
| 안내 시녀 | ep03 S01, S06–S09, c002–c003·c038–c051 | 쪽머리 외형, 존댓말 안내, 하렘 입실을 영광으로 여김, c047의 개인 가치관. 누르와 동일인이라는 근거 없음 |
| 잘릴 | ep03 S10–S12, c052–c061 | 다라 대족장, 격식·혈통 비판·살기에 대한 공포. c058의 scared만 추가 근거 있음 |
| 목욕 시녀 | ep03 S02–S03, c005–c018 | 청록옷 발화자 c017과 목욕 담당 역할. 고유 이름·깊은 가치관 미확정 |
| 청록 터번 보고자 | ep03 S04, c019–c026 | 문서를 들고 흥겨운 일을 질문함. 이름·직책 추가 추정 금지 |
| 알림 시종 | ep03 S10, c052–c054 | 화면 밖 방문 알림뿐. 외형·성격 확장 금지 |
| 세 정체 항목 | ep04 S04–S05 전체, c031–c043 | c035 권력 주장·c037 조건문을 정체 확정으로 앞당기지 않음 |

직접 본 원본 이미지 재감사는 하지 않았다. 전수 원문 전사·장면 문서와 원문감사 기록이 근거다. c033 책 문양, c054 두 흘림문자의 뜻·화자를 창작하지 않는다. c052 이후 접견 복장은 원문감사의 흰 터번·크림색 옷 교정을 우선한다. 새 인물에는 원문 반응을 변형한 고정 reactions를 추가하지 않았다. 확인되지 않은 가치관은 빈 배열, 표정은 neutral 기본으로 한정했다.

## 배우 연결: 대본 담당 변경 사항

현재 ep03_시녀·ep03_목욕시녀·ep03_보고자·ep03_시종에는 lore가 없다. 각각 안내 시녀 / 목욕 시녀 / 청록 터번 보고자 / 알림 시종으로 연결해야 GM 프롬프트와 말투 검사가 정의를 소비한다. ep03_대족장·ep03_잘릴·ep03_잘릴독백은 기존 lore: 잘릴을 유지한다. ep03_시하드, ep04_man, ep04_behidat는 lore: 베히다트를 유지한다. 동일 인물별 새 로어 키를 만들지 않는다. 이 대본 변경은 담당 소유 파일이므로 패치에 포함하지 않았다.

withNotes는 cast의 로어 누락을 검증하지 않는다. checkNotes 및 존재하는 characters.reactions의 faceProblem만 검사한다. 따라서 누락 인물이 기존 withNotes 실패 원인이라는 주장은 틀리다. 정의 추가 목적은 GM 인물 계약 연결이다.

## 별도 공유 엔진 의존

현행 faceProblem은 speech/thought의 faces 허용 목록을 검사한 뒤 same-lore 배우 전체에서 sprite를 찾는다. 잘릴에 faces: [neutral, scared]만 주어도 neutral에서 입식 없음으로 실패한다. 새 궁정 배우에 사막 입식을 복사하거나 검증을 통째로 생략하지 않는다.

엔진 담당의 최소 별도 구현 요구: CastSpec/파서에 명시적인 CG 전용 표시(예: presentation: cg)를 추가하고, 그 표시가 있는 배우에서만 입식 파일 존재 검사를 대신해 해당 줄의 유효 cg 참조를 검사한다. 선언된 faces 목록 검사는 계속 수행한다. 일반 입식 배우의 same-lore 검사는 현행 그대로 유지한다. CG 전용 배우의 cg 없는 대사·미선언 표정·존재하지 않는 CG는 실패해야 한다. 화면 밖 알림은 검증된 해당 장면 CG와 함께 제시한다. 정확한 필드 이름·스키마 변경은 엔진 담당이 확정하며 본 패치는 엔진을 수정하지 않는다. 이 의존 전까지 새 궁정 배우의 생성 표정 기능 완료로 보고하지 않는다.

## 지식과 기억

ep03 c019–c026 비공개 궁정 대화 및 c052–c061 접견은 관객 정보다. characters의 배우 지침을 아시나 수첩 knowledge로 복사하지 않는다. ep03_관객_잘릴접견·ep03_관객_총기소문은 본명·통치자·칭호 조건과 연결하지 않는다. 아이라 상세 의미·총기 저하 소문의 진위·짐 보관처·책 문양은 미확정이다. 잘릴은 귀찌나 공녀 신분을 알지 못한다. 시녀의 세뇌도 아시나의 해석을 넘어 사실로 만들지 않는다.

## 검증 결과와 한계

실행: 아래 검증 코드 자체를 Bun 메모리에서 실행했다. unified diff의 문맥·줄수·결과를 검사하고 원본은 보존했다.

- 로어 파싱 통과. ep01/02/03/04 각각 독립 시나리오 파싱 통과.
- ep01 단독 withNotes 통과. ep02/03/04 단독 withNotes는 각각 기존 after 참조 16건 실패. stars의 b01_sand, captive 8건, strangers 1건, man 4건, guards 2건. 기존 항목 삭제·후처리 여과 없음.
- 실제 loadCampaignScenario(ep01)의 ep01+ep02 캠페인에 독립 파싱한 ep03/04의 cast·sprites·beats를 메모리 합성하면 withNotes 통과. 이는 수첩 참조 검증용 합성이며 새 화의 실제 캠페인 전이 연결·전체 checkScenario·서버 플레이 통과를 뜻하지 않는다.
- 공개 전/하렘 후/c040 후/c041 후/c042 후 spoilersFor + forbiddenIn 경계 통과. 세 ep04 플래그의 비순차 단독 활성화도 독립성 통과. 기존 단일 정체 플래그만으로는 공개되지 않음.
- 네 최종 공개 줄의 sets 검사 통과. 접견 줄에서 세 정체 플래그를 열지 않음.
- CG 전용 잘릴에 faces만 추가했을 때 입식 없음 실패 재현.
- 공유 로어 원본 불변 검사 통과. 모델·서버·커밋·푸시·crq 실행 없음.

독립 서버용 lore fixture는 별도 의존이며 공유 로어를 삭제해 만들지 않는다. ep03_palace.test.ts는 부모 테스트 담당 소유다. 위 독립 실패와 합성 성공을 구분해 테스트할 것을 부모에게 전달했다. 이 결과는 실시간 Gm.screen 호출이나 실제 사용자 화면 QA가 아니며 동일 검열 함수 경계 검사다.

재현 명령(저장소 루트, 파일 쓰기 없음):

```sh
bun -e 'const m=await Bun.file("docs/continuation/build/shared-lore-contract.md").text(); const c=m.split("```javascript\n")[1].split("```")[0]; await eval("(async()=>{"+c+"})()")'
```

```javascript
const root = process.cwd();
const assert = (ok, message) => { if (!ok) throw Error(message); };
const { parseLore, withNotes, spoilersFor, loreFor } = await import(root + '/app/src/gm/lore.ts');
const { parseScenario, faceProblem } = await import(root + '/app/src/engine/scenario.ts');
const { loadCampaignScenario } = await import(root + '/app/src/engine/continuation.ts');
const { forbiddenIn } = await import(root + '/app/src/gm/validate.ts');
const base = await Bun.file('app/content/lore_wolheun.yaml').text();
const diff = await Bun.file('docs/continuation/build/shared-lore.patch').text();
const applyMemory = (base,diff)=>{var lines=base.split('\n');var hs=diff.split('\n');var out=[],cursor=0;for(var i=2;i<hs.length;i++){var m=/^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/.exec(hs[i]);if(!m)continue;var start=Number(m[1])-1;out.push(...lines.slice(cursor,start));cursor=start;var oldCount=0,newCount=0;while(i+1<hs.length&&!hs[i+1].startsWith('@@')&&hs[i+1]!==''){var l=hs[++i];if(l[0]!=='+' ){if(lines[cursor]!==l.slice(1))throw Error('패치 문맥 불일치 '+cursor);cursor++;oldCount++}if(l[0]!=='-'){out.push(l.slice(1));newCount++}}if(oldCount!==+m[2]||newCount!==+m[4])throw Error('패치 줄수 불일치')}out.push(...lines.slice(cursor));return out.join('\n')};
const lore = parseLore(applyMemory(base, diff));
const old = parseLore(base);
for (const id of ['man_title', 'jail', 'fesian']) assert(Bun.deepEquals(old.knowledge.find(n => n.id === id), lore.knowledge.find(n => n.id === id)), id);
assert(Bun.deepEquals(old.knowledge.filter(n => n.id !== 'man_true'), lore.knowledge.filter(n => !['man_true','man_ruler','man_la_kun','ep03_harem'].includes(n.id))), '기존 지식 보존');
assert(Bun.deepEquals(old.forbidden.spoilers.filter(t => t !== '하렘'), lore.forbidden.spoilers), '정적 금지어 보존');
const parsed = {};
for (const name of ['ep01_desert','ep02_captivity','ep03_palace','ep04_night']) {
  parsed[name] = parseScenario(await Bun.file('app/content/' + name + '.yaml').text());
  let errors = [];
  try { withNotes(parsed[name], lore); } catch (e) { errors = e.message.split('\n').filter(l => l.startsWith('- ')); }
  assert(errors.length === (name === 'ep01_desert' ? 0 : 16), name + ' 독립 수첩 오류 수');
  console.log(name, '독립 파싱 통과, 수첩 기존 오류', errors.length);
}
const campaign = await loadCampaignScenario(root + '/app/content/ep01_desert.yaml');
const merged = {...campaign};
for (const field of ['cast','sprites','beats']) merged[field] = {...campaign[field],...parsed.ep03_palace[field],...parsed.ep04_night[field]};
withNotes(merged, lore);
console.log('기존 캠페인과 ep03/04 합성 withNotes 통과');
const cases = [["하렘 이전",{},["하렘","베히다트","왕이다","라 쿤"]],["하렘 이후",{"ep03_하렘_앎":true},["베히다트","왕이다","라 쿤"]],["c040 이후",{"ep03_하렘_앎":true,"ep04_name_known":true},["왕이다","라 쿤"]],["c041 이후",{"ep03_하렘_앎":true,"ep04_name_known":true,"ep04_ruler_known":true},["라 쿤"]],["c042 이후",{"ep03_하렘_앎":true,"ep04_name_known":true,"ep04_ruler_known":true,"ep04_title_known":true},[]]];
for (const [label, flags, hidden] of cases) {
  const state = {flags, tracks:{}, abilities:{}, items:[]};
  const terms = spoilersFor(lore, state);
  for (const term of ['하렘','베히다트','왕이다','라 쿤']) assert(terms.some(t => forbiddenIn(term,t)) === hidden.includes(term), label + term);
  assert(!loreFor(lore,state).knowledge.some(n => ['잘릴','court_audience'].includes(n.id)), '관객 접견 기억 금지');
  console.log(label, '검열 경계 통과');
}
for (const [flag,word] of [['ep04_name_known','베히다트'],['ep04_ruler_known','왕이다'],['ep04_title_known','라 쿤']]) {
  const state={flags:{[flag]:true},tracks:{},abilities:{},items:[]};
  for (const [otherFlag,otherWord] of [['ep04_name_known','베히다트'],['ep04_ruler_known','왕이다'],['ep04_title_known','라 쿤']]) assert(spoilersFor(lore,state).includes(otherWord) === (otherFlag !== flag), '독립 플래그 ' + word + otherWord);
}
const oldState={flags:{남자_정체_앎:true},tracks:{},abilities:{},items:[]};
assert(['베히다트','왕이다','라 쿤'].every(w=>spoilersFor(lore,oldState).includes(w)), '옛 단일 플래그가 세 정보 동시 공개 금지');
assert(parsed.ep03_palace.beats.ep03_c040.lines.at(-1).sets === 'ep03_하렘_앎', '하렘 최종 줄');
for (const [cut,flag] of [['040','ep04_name_known'],['041','ep04_ruler_known'],['042','ep04_title_known']]) assert(parsed.ep04_night.beats['ep04_c'+cut].lines.at(-1).sets === flag, '공개 최종 줄 '+cut);
for(const beat of Object.values(parsed.ep03_palace.beats).filter(b=>/^ep03_c0(5[2-9]|6[01])$/.test(b.cut??''))) {
  const flags=[...Object.keys(beat.effects?.flags??{}),...(beat.lines??[]).map(l=>l.sets).filter(Boolean)];
  assert(flags.every(f=>!['ep04_name_known','ep04_ruler_known','ep04_title_known','남자_정체_앎'].includes(f)), '접견이 아시나 정보 공개 금지');
}
const cg={...merged,cast:{...merged.cast,ep03_잘릴:{...merged.cast.ep03_잘릴,faces:['neutral','scared']}}};
assert(faceProblem(cg,'ep03_잘릴','neutral')?.includes('입식이 없습니다'), 'CG 전용 배우의 현행 제약 재현');
assert(await Bun.file('app/content/lore_wolheun.yaml').text() === base, '공유 로어 불변');
console.log('독립 플래그·공개 줄·궁정 비공개·CG 제약·원본 불변 통과');
```
