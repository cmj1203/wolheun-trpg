# 3화 선택 대화·CG 배우 통합 계약

2026-11-09. 제출물은 `shared-dialogue.patch`와 이 계약이다. 공유 소스·실제 3화 YAML·생산 테스트는 수정하지 않았다. 실험 사본과 시험 기록만 `work/continuation/episodes/dialogue-proof/`에 두었다. 패치는 엔진 담당이 검토·적용하며, 대본과 테스트 변경은 부모 담당이다.

## 근본 원인

아래 소스 줄 번호는 패치 기준본 기준이다. 병행 작업 때문에 현재 공유 파일의 줄 번호는 달라질 수 있다.

| 위치 | 실제 제한 |
|---|---|
| `app/src/engine/scenario.ts:933` | `choices`와 `free` 동시 선언을 거절한다. YAML 선언만으로 선택적 대화를 만들 수 없다. |
| `app/src/engine/engine.ts:592` | `beat.free`가 있으면 `state.free` 판정 진행을 생성한다. |
| `app/src/engine/engine.ts:378` | `prompt`의 382행 자유 입력 분기가 선택지 분기보다 먼저 실행된다. |
| `app/src/engine/engine.ts:1155` | 끼어들기 문맥이 `scene.free ?? stateBeat.free ?? lastFree`다. 3화 단독에는 문맥이 없고, 캠페인에서는 이전 장 문맥을 재사용할 수 있다. |
| `app/src/engine/engine.ts:1177` | 현재 `free`와 `state.free`가 있으면 판정 가능 상태가 된다. |
| `app/web/main.ts:1317`, `1338`, `1351` | 기존 화면은 선택지를 표시하면서 입력을 `interject`로 보낸다. 따라서 새 화면 종류나 UI 수정은 필요 없다. |
| `app/src/engine/scenario.ts:82` | `faceProblem`은 허용 표정 검사 뒤 같은 lore의 입식을 찾는다. 새 시녀·잘릴은 faces만 선언해도 입식 없음으로 실패한다. |

원문 근거: `docs/continuation/ep03/continuation.md:32–50`, `script.md:774–875`, `scenes.json`의 `ep03_s08`, `ep03_s09`. 첫 자리는 c046 시녀의 영광 발언 뒤, 둘째는 c049 조용함을 알아차린 뒤다. 독백·목욕·이동에는 새 입력 자리를 만들지 않는다.

## 선택한 변경

`BeatSpec.conversation`을 `choices`에 추가한다. `free`와 `ending`에는 함께 둘 수 없고, 조건 없는 비판정 기본 선택지가 하나 이상 있어야 한다. 원문 선택을 누르면 기존 `choose`가 기존 대사·효과·다음 비트를 그대로 실행한다. 직접 입력을 받았을 때만 `conversation.next`로 간다.

`free.optional`은 채택하지 않았다. 현 `FreeSpec`은 접근법·기본 접근법·성공 등급별 결과·가격·턴을 요구한다. 선택 대화를 위해 실행되지 않는 판정 사양을 만드는 대신, GM이 실제 사용하는 상황·화자·문체 제한만 공유한다. GM에 넘기는 `approaches`는 빈 배열이다. 가짜 접근이나 판정은 만들지 않는다.

`Engine.interject`는 현재 비트의 `conversation`이 있으면 그 문맥만 사용한다. 이 경로는 `lastFree`, `planInput`, `applyReading`, `worldMove`, 주사위, 가격 표에 들어가지 않는다. `state.free`는 계속 `null`이다. 말·가만히 있기·울기와 같은 감정·즉각적인 괄호 몸짓은 `gm.talk`로 받으며, 몸짓은 기존 `interject.action` 계약에 따라 관찰과 반응으로만 표현한다.

세계에 관한 질문도 이 자리에서는 현재 인물이 받는다. `game` 또는 `play`로 분류된 조작 질문만 기존 질문 모드 안내로 보낸다. 기존 `bounce`의 미공개 이름·부재 대상 심사를 유지한다. `clarify`, 판정 접근, 지속 목표, 신분 공개·공격 위험은 범위를 다시 적도록 요청하고 원래 상태를 돌려준다. 모델이 지속 행동을 잘못 `local`로 분류하지 않는지는 실제 모델 QA가 필요하다. 키워드 목록으로 장기 행동을 추측하지 않는다.

응답 성공 뒤 한 번만 진행한다. 생성 실패·빈 응답·무대 밖 화자는 오류로 남기며 고정 대체문을 성공한 대화로 간주해 다음 장면으로 보내지 않는다. `talk_fallback`과 `deflect`는 공통 GM 문법용 필드이며 아래처럼 빈 배열로 선언한다.

현재 장면을 다 읽기 전이거나 화면의 장면과 서버 비트가 다르면 선택 대화를 소비하지 않는다. 프롬프트가 나온 상태의 실제 UI 제출은 `pending: []`다. 기존 UI의 `revise.jump` 처리로 남은 큐를 비우고 직접 입력 후속 경로를 재생한다. 화면 코드는 읽었지만 브라우저에서 실행하지 않았다.

대화 화자는 현재 무대와 `cast.lore`가 일치하는 응답자·속마음 또는 나레이션으로 제한한다. GM과 주인공의 새 발화는 화자 목록에 넣지 못한다. 대화 기억은 같은 판의 이전 선택 대화 중 동일 lore의 응답자가 있었던 입력만 가져온다. 다른 장의 공용 `heard`와 비공개 궁정 대사는 넣지 않는다. 이 패치는 기존 일반 자유 입력 기억 전체를 재설계하지 않는다.

## 부모의 YAML 변경

기존 c046·c049의 `choices`와 원문 대사·연결을 유지한 채 아래 필드를 병합한다. 기존 원문 경로는 `ep03_i01_protest → ep03_c047`, `ep03_i02_quiet → ep03_c050`이다. `계속` 표시를 원하면 해당 기존 선택지의 표시 글만 부모가 바꾸면 되고 ID·원문 lines·next는 유지한다. 직접 입력은 어느 원문 선택지도 실행하지 않는다.

```yaml
beats:
  ep03_c046:
    conversation:
      situation: 아시나는 하렘에 들어왔고, 눈앞의 안내 시녀가 입실을 영광이라고 말했다. 시녀는 이 대우를 기쁘게 여긴다.
      goal: 아시나가 실제로 건넨 말과 몸짓을 안내 시녀의 기존 가치관과 존댓말로 받는다.
      speakers: [ep03_나레이션, ep03_시녀]
      must_not:
        - 아시나가 입력하지 않은 항의나 질문을 대신 말하지 않는다.
        - 하렘을 나가거나 물건을 돌려받거나 신분이 공개되었다고 확정하지 않는다.
      state_guard: []
      echo_only: []
      talk_fallback: []
      deflect: []
      cg: ep03_cg_046
      next: ep03_i01_custom_tail

  ep03_c049:
    cast:
      left: ep03_아시나
      center: null
      right: ep03_시녀
    conversation:
      situation: 아시나는 하렘 침실에서 방이 조용하다는 것을 알아차렸다. 안내 시녀가 곁에 있다.
      goal: 지금 건넨 질문이나 몸짓에 반응하되, 아직 장면에서 밝히지 않은 설명을 먼저 하지 않는다.
      speakers: [ep03_나레이션, ep03_시녀]
      must_not:
        - 아시나의 다음 질문을 대신 쓰지 않는다.
        - 다른 입실자의 명단이나 시하드의 사생활을 창작하지 않는다.
        - 장면에서 아직 밝히지 않은 사실과 비공개 접견 내용을 말하지 않는다.
      state_guard: []
      echo_only: []
      talk_fallback: []
      deflect: []
      cg: ep03_cg_049
      next: ep03_i02_custom_tail

  ep03_i01_custom_tail:
    title: 다른 생각
    cast: {left: ep03_아시나, center: null, right: ep03_시녀}
    time: 0
    lines:
      - ep03_나레이션: ""
        cg: ep03_cg_047
      - ep03_나레이션: ""
        cg: ep03_cg_048
    next: ep03_c049

  ep03_i02_custom_tail:
    title: 조용한 방
    cast: {left: ep03_아시나, center: null, right: ep03_시녀}
    time: 0
    lines:
      - ep03_시녀: 아가씨께서 하렘의 유일한 '아이라'시니까요.
        cg: ep03_cg_050
        sets: ep03_유일한아이라_앎
      - ep03_나레이션: ""
        cg: ep03_cg_051
    next: ep03_c052
```

첫 custom 경로는 원문 항의와 그 항의를 전제한 시녀의 재질문을 되풀이하지 않는다. c047·c048 그림과 고정 이동은 이어 보이되, 입력하지 않은 항의·세뇌 판단을 대사로 강요하지 않는다.

둘째 custom 경로는 c049 원문 질문과 c051의 “나 혼자라고?”를 생략한다. c050의 필수 통보만 원문으로 내고 그 줄에서 기존 공개 플래그를 세운다. 질문하지 않고 몸짓만 했어도 시녀의 반응 뒤 통보로 이어질 수 있도록 앞의 “그야,”는 재생하지 않는다. 유일한 아이라라는 답이나 이후 c052–c061의 접견 내용은 `conversation.situation`·`goal`에 미리 넣지 않는다. 이 정보의 공유 lore 공개 조건은 별도 lore 담당과 `ep03_유일한아이라_앎`에 맞춰야 한다.

`edgesOf`는 `conversation.next`를 포함한다. 부모는 추가한 custom 비트가 속한 장·장면과 지도 연결도 기존 atlas 선언에 반영한다. 원문 선택지 ID를 삭제·변경하면 그 ID를 쓰는 atlas 선언도 함께 조정해야 한다.

## CG 전용 배우

```yaml
cast:
  ep03_시녀:
    display: 시녀
    style: speech
    lore: 안내 시녀
    presentation: cg
    faces: [neutral]
  ep03_대족장:
    display: 다라의 대족장
    style: speech
    lore: 잘릴
    presentation: cg
    faces: [neutral, scared]
  ep03_잘릴:
    display: 잘릴
    style: speech
    lore: 잘릴
    presentation: cg
    faces: [neutral, scared]
  ep03_잘릴독백:
    display: 잘릴
    style: thought
    lore: 잘릴
    presentation: cg
    faces: [neutral, scared]
```

목욕 시녀·청록 터번 보고자·알림 시종도 별도 lore 담당의 정식 키와 허용 faces에 맞춰 같은 표시를 쓴다. 실제 입식이 있는 아시나·베히다트 별칭은 기존 입식 검증을 그대로 쓴다. 다른 인물의 입식을 붙이지 않는다.

`presentation: cg`는 입식 없는 `speech`/`thought`에만 허용된다. `faceProblem`은 허용 faces 검사를 먼저 수행하고 이 표시에서만 입식 조회를 생략한다. 정적 대본 검사와 실제 `Engine.say`는 `cgLineProblem`을 호출한다. cg 없는 줄, 선언에 없는 cg, 파일 경로가 없는 cg, 미허용 face는 실패한다. face를 생략하면 neutral의 허용 여부를 검사한다. 유효 CG란 시나리오의 `cgs[id].file` 선언이 있다는 뜻이며, 파일 실재·그림 내용 검수는 자산 담당의 별도 검사다.

생성 응답에는 모델이 CG를 고르게 하지 않는다. 엔진이 현재 `conversation.cg`를 각 줄에 붙이고 같은 출력 검증을 통과시킨다. CG의 얼굴을 표정 입식으로 바꾸는 기능은 아니다. 허용 face는 대사 톤 검증용이며 그림은 지정한 원작 CG를 유지한다. lore의 반응 템플릿은 face 허용 검사만 받고, 실제 출력 줄이 될 때 유효 CG가 있어야 한다.

## 타입 계약과 부모 테스트

`GmContext.free`는 이제 `FreeSpec` 전체가 아니라 GM이 사용하는 공통 필드의 `Pick`이다. 판정 전용 필드를 읽는 기존 테스트 fixture는 타입을 잃지 않게 아래 한 줄을 바꾼다. 생산 테스트는 이 패치에 포함하지 않았다.

```diff
--- a/app/tests/gm.test.ts
+++ b/app/tests/gm.test.ts
@@
-  const ctx: GmContext = { scenario, beat, free, state, text };
+  const ctx = { scenario, beat, free, state, text } satisfies GmContext;
```

이 변경은 `contexts()`의 79행에 해당한다. 실제 `free` 객체의 `improv`·`improv_bold` 타입을 보존하며 테스트의 기대값이나 검증 범위를 바꾸지 않는다.

## 검증 기록

최종 선택 대화·CG 배우 시험은 22개 통과, 0개 실패, 종료 코드 0이다. `tsc --noEmit -p tsconfig.proof.json`과 기준본 대상 `patch --dry-run -p1`도 각각 종료 코드 0이다. 계약의 두 YAML 예시를 실제 3화 기준 대본에 병합하여 `parseScenario`로 읽었으며, 63비트와 c046/c049 두 대화 자리의 검증을 통과했다.

수정 전 기준본에서 초기 20개 행동 계약은 8개 통과·12개 실패로 재현했다. 이후 추가한 세계 질문·미공개 이름 경계 시험은 수정 전 2개 모두 실패했고, 최종 22개 통과에 포함된다. 기존 `engine.test.ts`는 기준본과 패치본 모두 116개 통과·23개 실패이며 실패 이름의 고유 목록도 완전히 같다. 기존 실패를 통과로 표시하거나 시험을 삭제하지 않았다.

전체 프로젝트 타입 검사 통과를 주장하지 않는다. 격리본에는 웹·E2E·스크립트를 복사하지 않아 그 파일을 참조하는 기존 시험은 전체 검사에서 누락 오류가 났다. 또한 위 `gm.test.ts` fixture의 타입 조정은 부모가 적용해야 한다. 검증을 통과한 범위는 전체 `src`와 새 행동 시험·기존 helpers를 포함한 `tsconfig.proof.json`이다.

실제 모델·브라우저·실서버·전체 캠페인 검증은 요청에 따라 실행하지 않았다. 시험용 `GmPort`는 입력 분류와 응답을 제공하며, 실제 `Engine.act`, 파서, 그래프 연결, 대사 출력 경계를 실행했다. 이 시험은 모델의 한국어 문장·캐릭터 말투·행동 분류 정확도를 증명하지 않는다.

확인한 증거 파일은 모두 `work/continuation/episodes/dialogue-proof/` 아래에 있다.

| 파일 | 증거 |
|---|---|
| `proof-test.log` | 최종 22 통과 / 0 실패 |
| `proof-baseline.log` | 초기 20개 계약의 수정 전 8 통과 / 12 실패 |
| `input-boundary-red.log` | 세계 질문·미공개 이름 경계의 수정 전 2 실패 |
| `typecheck-proof.log` | 타입 검사 오류 없음, 감시 종료 기록에서 코드 0 확인 |
| `patch-check.log` | 기준본의 5개 소스 파일 대상 dry-run 성공 |
| `engine-baseline.log`, `engine-regression.log` | 기존 엔진 회귀의 동일한 116 통과 / 23 실패 |
| `app/tests/dialogue-proof.test.ts` | 부모가 소유 테스트에 옮길 행동 계약 22개 |

부모가 인수할 행동 검증은 다음과 같다.

| 경우 | 필요한 관찰 |
|---|---|
| 단독 3화, c046/c049 원문 계속 | 입력을 강요하지 않고 원문 경로가 그대로 진행됨 |
| 2화에서 들어온 캠페인의 직접 대화 | 2화 free 문맥·다른 사람의 기억을 사용하지 않음 |
| 말, 괄호 몸짓, 침묵, 울기, 말과 행동 혼합 | 실제 반응, 주사위·행운·가격·턴 소비 없음 |
| 세계 질문 | 시녀가 답하며 게임 조작 질문만 GM 질문 모드로 안내 |
| 탈출·물건 회수·공격·정체 공개 같은 장기 결과 | 판정이나 성공을 만들어내기 전에 범위를 재확인 |
| c046 직접 입력 뒤 | 선택하지 않은 원문 항의·재질문이 없음 |
| c049 직접 입력 뒤 | 원문 질문·재질문을 반복하지 않고 c050 통보 줄에서 공개 |
| 잘못된 괄호, 숨긴 이름, 무대 밖 화자, 모델 실패 | 입력 자리·수치·지식·기억을 소비하지 않음 |
| 저장 재개·이전 장면에서 늦게 도착한 입력 | 잘못된 장면의 선택 대화를 소비하지 않음 |
| CG 배우의 정상·누락·없는 CG·미허용 face | 정상만 출력되며 기존 입식 배우 검증도 유지됨 |

## 패치 기준본

아래 SHA-256의 격리 기준본에 대한 통합 diff다. 공유 소스가 이미 달라졌다면 소유 레인이 변경 문맥을 대조해 통합한다. 이 작업은 최신 공유 파일에 패치를 적용하지 않는다.

| 파일 | SHA-256 |
|---|---|
| `app/src/engine/types.ts` | `50105c9ca7c4c2f643728283165335cfcf31b7321f2aa7b431ec064d13cb4984` |
| `app/src/engine/scenario.ts` | `07da4cbdf17579a319deb0fb2f5a6bd0a1e88a7efa5d1007a6c4760785c054ce` |
| `app/src/engine/engine.ts` | `606fb90f84f78ed3678529263acd2c2942c4c10f467b65f7486af11af8ec8e54` |
| `app/src/gm/rules.ts` | `28214ce075e048947b101ae8b8f34114b44e2f04de950e0fa84c8d5671be0d0c` |
| `app/src/gm/prompt.ts` | `1f711f6538b4dea81b3a5edafa71f95f346a7fde6b45186ef51405f2bc1cd9be` |
