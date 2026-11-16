# 62차 구현

2026-11-09. 61차 변경을 보존하고 62차만 구현했다. YAML, 다른 테스트, assets, style.css는 수정하지 않았다. 커밋, CodeRabbit 등록, 서버 재시작, 18080/18081 사용은 하지 않았다.

## 변경 파일

- `app/src/engine/text.ts`: ASCII/전각 괄호를 같은 입력 경계로 읽는다. 괄호 안 여러 행동과 바깥 말을 각각 보존하고 빈 괄호, 닫히지 않은 괄호, 서로 다른 짝, 중첩을 구분해 안내한다. 발화 추출에서는 괄호 안 행동을 제외한다.
- `app/src/engine/engine.ts`: 자유 입력과 끼어들기에서 같은 경계를 사용한다. 기본 발화와 명시 행동이 해석, heard, spoken/acted 문맥, 인물 기억에 전달된다. 혼합 입력은 행동과 발화를 각각 기억한다. 무괄호 서술형을 기존 분류기가 행동으로 확신한 경우 여우 안내 한 줄만 낸다. 잘못된 괄호도 같은 방식이다. `notice: rewrite`면 이전 상태 전체를 반환하고 fate 정산도 건너뛰므로 턴, 참을성, RNG, 수치, 플래그를 소비하지 않는다. GM 질문 모드는 기존 경로를 유지한다.
- `app/src/engine/types.ts`: heard의 `mixed`, notice의 `rewrite`를 추가했다.
- `app/src/gm/gm.ts`: 이야기 해석에는 분리한 행동 또는 발화 내용을 사용하고, 명시 행동을 말투 때문에 발화로 뒤집지 않는다.
- `app/src/gm/prompt.ts`: 확정된 행동/발화 경계를 해석, 대화, 판정 후 생성에 전달한다. 괄호 안 행동을 들은 말로 받지 않도록 맞췄다.
- `app/web/main.ts`: 기본 placeholder 두 곳을 승인 문구로 바꿨다. 예시 override는 유지했다. rewrite는 GM 질문 토스트를 띄우지 않는다.
- `app/web/index.html`: 기본 placeholder와 aria-label을 `말하기 · (행동하기)`로 바꿨다. 혼합 입력 되짚기는 `아시나의 말·행동`으로 표시한다. style.css 편집 제한 때문에 이 규칙 한 줄은 index의 style에 두었다.
- `app/tests/paren62.test.ts`: 공개 Engine.act 경계에서 여섯 회귀 사례를 추가했다.
- `docs/lead_check62/implementation.md`: 이 문서.

웹 두 파일은 리드에게 먼저 인계했고, 인계 후 수정하지 않았다.

## 인터페이스

- `GmContext.input?: StoryInput` 선택 필드 추가. 기존 GmPort 메서드 서명은 그대로다.
- `text.ts`에서 `StoryInput` 타입과 `parseStoryInput(text)`를 내보낸다. valid는 action/speech/explicit, invalid는 message를 가진다.
- GameEvent의 heard.as에 `mixed`, notice.kind에 `rewrite`를 추가했다. 웹 소비자도 함께 처리한다.
- 기존 `assertedSpeech`는 괄호 안 내용을 발화에서 제외한다.
- 리드 추가 지시에 따라 `켄켄거리며 뱉는다`를 `모래를 뱉고 투덜거린다`로 고쳤다. lore의 활발하고 당찬 성격, 궁지에서도 넉살과 말재주로 버틴다는 설정을 확인했다. 추가한 안내·프롬프트·주석·시험 한국어도 읽어 확인했다. 출력 문자열 교체 필터는 추가하지 않았다.

## 검증

작업 디렉터리는 `/Users/choeminju/월흔_trpg/app`이다. 전체 스위트는 실행하지 않았다.

```sh
bun test --timeout 30000 ./tests/paren62.test.ts ./tests/flow61.test.ts ./tests/kracha51.test.ts
```

최종 결과: exit 1, **12 pass / 3 fail / 101 expect() calls**, 15개 시험, 48ms.

- `paren62.test.ts`: **6/6 통과**. 괄호만(ASCII·전각), 말만, 혼합(여러 행동 포함), 빈 괄호, 짝 불일치·중첩, 무괄호 서술형 다시 적기. 거부 사례는 이전 상태 전체가 같고 안내 줄이 하나인지 검증한다. 짝 불일치와 무괄호 서술형은 끼어들기 경로도 검증한다.
- `flow61.test.ts`: **2/2 통과**. 괄호 모래 먹기는 판정·수치 보상 없이 머물고, 가방 선택지 반응의 acted도 보존된다.
- `kracha51.test.ts`: **4/7 통과**. 아래 통합 이행 항목을 리드에게 전달했다. 이 파일은 수정하지 않았다.

```sh
bunx tsc --noEmit
```

결과: **exit 0**, 진단 없음.

```sh
bun /Users/choeminju/.local/share/fnm/node-versions/v24.21.0/installation/lib/node_modules/omo-ai/plugin/skills/programming/scripts/typescript/check-test-junk.ts tests/paren62.test.ts
```

결과: **exit 0**, `check-test-junk: no findings`.

61차 비접근 갈래는 테스트 파일을 수정하지 않고 아래 별도 probe로 확인했다.

```sh
bun -e 'import assert from "node:assert/strict"; import {Engine} from "./src/engine/engine.ts"; import {FakeGm,META,loadDesert} from "./tests/helpers.ts"; const engine=new Engine(await loadDesert(),new FakeGm(()=>({kind:"idle",source:"llm",meta:META}))); let {state,step}=engine.newGame(1,"met62-probe"); const events=[...step.events]; for(let i=0;i<4&&state.beat==="b02_people";i++){({state,step}=await engine.act(state,{type:"free",text:"(가만히 서 있는다)"})); events.push(...step.events);} const scenes=events.flatMap(e=>e.type==="scene"?[e.beat]:[]); const lines=events.flatMap(e=>e.type==="line"?[e.text]:[]); assert(scenes.includes("b03_met")); assert(!scenes.includes("b03_ask")); assert(!lines.includes("혹시 크라차까지 가는 길을 아시나요?")); console.log("B03_MET_PROBE PASS: 괄호 idle은 길을 묻지 않고 b03_met 진입");'
```

결과: **exit 0**, `B03_MET_PROBE PASS`. 상대가 먼저 오는 b03_met로 진입하며 길을 물었다고 전제하지 않는다.

## 통합 이행과 미검증

리드가 요청한 어색한 표현 수정 후 마지막으로 다음 두 명령만 다시 실행했다.

```sh
bun test --timeout 30000 ./tests/paren62.test.ts ./tests/flow61.test.ts
bunx tsc --noEmit
```

결과: 집중 시험 **8 pass / 0 fail, exit 0**, 타입 검사 **exit 0**. 실패가 이미 설명된 kracha51과 전체 스위트는 다시 실행하지 않았다. 모든 프로덕션 파일은 이 실행 전에 리드에게 해제했다.

최초 집중 실행은 14 pass / 1 fail이었다. 공유 작업 중 YAML 예시의 괄호 이행이 완료된 뒤 최종 실행은 위 12 pass / 3 fail이었다.

1. `app/tests/kracha51.test.ts:38`: `가만히 서 있는다`는 새 규칙상 무괄호 서술형이어서 안내만 나오며 b03_met에 도달하지 않는다. fixture를 `(가만히 서 있는다)`로 이행해야 한다. 명시 괄호 probe는 통과했다.
2. `app/tests/kracha51.test.ts:19`의 avoid 행: 먼저 길을 물은 줄이 있어야 한다는 기존 기대가 실패했다.
3. `app/tests/kracha51.test.ts:60`: avoid 뒤 질문 전후 구간의 change 이벤트가 없어야 한다는 기존 기대가 실패했다. 2·3번의 경로/기대 통합은 리드 담당으로 전달했으며 테스트 기대를 약화하거나 프로덕션에 예외를 추가하지 않았다.

브라우저 사진, 실제 26B 모델 출력, 전체 스위트, 다른 테스트 fixture의 전수 이행은 실행하지 않았다. 브라우저 QA·YAML·통합 검증은 리드 담당이다. 공유 코드에 임시 mutation을 넣는 검사는 하지 않았다.

## 구현 판단

새 낱말표나 행동별 예외 없이 괄호 구문과 기존 분류 결과를 사용했다. 무괄호 다시 적기는 문장 꼴(isActionText)과 행동 해석이 모두 일치할 때만 낸다. 불확실한 입력은 발화로 유지한다. 바깥 말의 위협을 실제 공격·귀찌 해제 행동으로 실행하지 않으며, 말로 정체를 밝힌 경우의 기존 risk는 보존한다.

새 경계 타입을 사용했고 새 any·타입 단언·검사 억제를 추가하지 않았다. parser는 발화 추출, 엔진, 생성 프롬프트에서 공유한다. 테스트는 기존 FakeGm 경계로 분류 결과를 통제하고 실제 엔진 상태·이벤트를 검증하며 테스트 전용 프로덕션 API는 만들지 않았다. 기존 대형 파일은 허용된 작업 범위와 61차 보존을 위해 분리하지 않았다.
