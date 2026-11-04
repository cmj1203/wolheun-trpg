# 시나리오 비트 형식

`app/content/*.yaml` 하나가 장면 하나다. 앱은 시작할 때 `app/src/engine/scenario.ts` 로 읽고 검증한다. 없는 비트·화자·CG·소지품, 닿지 않는 비트, 빠진 판정 결과, 조건식 오류는 시작 단계에서 오류로 알린다. 예시는 `app/content/ep01_desert.yaml`.

## 최상위

| 키 | 내용 |
|---|---|
| `id`, `title`, `episode`, `source`, `rating` | 장면 정보 |
| `start` | 첫 비트 id |
| `sheet` | 능력치(재치·손재주·매력·체력·교양), 진행 수치 시작값(의심·집착·호감·귀찌·탈주), 소지품(`hidden: true` 면 화면에 안 보임) |
| `cast` | 화자 키 → `display`(화면 이름), `style`(speech·thought·narration), `sprite`, `lore`(설정 사전 인물) |
| `backgrounds`, `sprites`, `cgs` | 그림. `file`(원작 컷·입식 경로), `crop`([x, y, 너비, 높이]), `fit`(cover·contain), `placeholder`(파일이 없을 때 쓸 임시 그림). 입식 표정은 `<입식 id>_<표정>`(예: `asina_smile`)으로 둔다 |
| `beats` | 비트 id → 비트 |
| `fates` | 상태가 한계에 닿으면 다음 비트 대신 들어가는 작은 끝 목록. 각 항목은 `id`, `when`(조건식), `to`(`ending.bad: true` 인 결말 비트), `warn: { when, say }`(한 판에 한 번 여우가 미리 알리는 한 줄). 순서대로 보고 먼저 참인 하나로 간다. 조건은 효과를 적용한 뒤와 행동 처리가 끝났을 때 본다(행운을 묻는 동안은 기다린다). 엔진이 세우는 플래그: `위험_실패`(칼 앞 경고에 "응" 하고 간 판정이 실패, 행운으로 메우면 안 서짐), `머뭇`(재촉·힌트 뒤에도 그 자리라 이야기가 대신 움직인 횟수), `상대_곁`(마지막 장면에 `stage.who` 가 있었는가; 작은 끝 줄의 `if` 에 쓴다) |

## 비트

| 키 | 내용 |
|---|---|
| `title`, `cut` | 제목, 원작 컷 범위 메모 |
| `bg`, `cast` | 배경 id, 입식 칸(`left`·`center`·`right` → cast 키) |
| `time` | 들어설 때 줄어드는 귀찌 수명 |
| `effects` | 들어설 때 효과 |
| `lines` | 대사. `- 화자: 대사` 에 `fx`(flash·shake), `sfx`(효과음), `cg`(이벤트 CG id), `face`(그 화자 입식의 표정: neutral·smile·surprised·wary)를 붙일 수 있다 |
| `choices` | 선택지. `check`(`stat`, `label`, `mods`)가 있으면 `outcomes`(`hit`·`mixed`·`miss`)가 필요하다 |
| `free` | 자유 입력(아래) |
| `next` | 다음 비트 id, 또는 조건 분기 `[{ if: "의심 >= 7", to: e_spy }, { to: e_survivor }]` (마지막은 조건 없이) |
| `ending` | 결말(`id`, `title`, `summary`, `next_hook`). `bad: true` 는 상태 한계로 들어온 작은 끝 — 결말 걹창은 '작은 끝', 결과 화면에 '마지막 갈림길에서 다시'(갈림길 비트에 들어선 직후의 자동 저장 `auto_fork`)·'처음부터' 단추, 이야기 지도에는 칸 대신 아래 작은 점으로 나온다(도달한 것만 제목). `fates[].to` 는 이 비트여야 한다 |

## 자유 입력 `free`

| 키 | 내용 |
|---|---|
| `prompt` | 입력창 위 안내 |
| `situation`, `goal`, `must_not` | GM 프롬프트에 들어가는 상황, 장면 목표, 금지 전개 |
| `speakers` | GM 이 쓸 수 있는 화자 |
| `forbid`, `echo_only` | GM 출력에서 막을 말, 플레이어가 먼저 말했을 때만 허용할 말 |
| `patience`, `talk_fallback`, `press` | 판정 없는 말을 받는 횟수(기본 3, 차면 재촉하고 넘으면 기본 접근으로 판정), GM 이 실패할 때 대사, 재촉 대사 |
| `deflect` | 등급에 안 맞는 입력을 인물 반응으로 돌릴 때 GM 이 실패하면 쓰는 대사 |
| `improv` | 목록에 없는 행동의 `hit`, `mixed`, `miss` 결과. 능력치와 난이도는 GM 이 고른다 |
| `turns`, `until` | 판정 횟수와 조기 종료 조건(여러 턴 계획용, 예: 감옥 탈옥) |
| `default_approach`, `approaches` | 행동 목록. 각각 `stat`, `item`(필요 소지품), `keywords`, `examples`, `mods`, `outcomes` |

`talk_fallback`, `press`, `deflect`, `improv` 는 파일 맨 위 `free_defaults` 의 값을 물려받고, 비트에서 다시 적으면 그 값을 쓴다.

`outcomes` 의 각 결과는 `gist`(GM 이 연출할 요지), `lines`(버튼 선택이나 GM 실패 때 쓰는 작가 대사), `effects`, `next`, `forbid` 로 이뤄진다.

## 효과, 조건, 판정

- 효과: `{ 의심: 1, 귀찌: -1, flags: { 미인계: true }, gain: [pin], lose: [magic_bag] }`
- 조건식: `의심 >= 7`, `flag:미인계`, `item:pin`, `!flag:들킴 && 집착 >= 2`, `a || b`. 숫자 플래그는 `flag:머뭇 >= 3` 처럼 비교한다(없으면 0, 참은 1)
- 판정: 2d6 + 능력치 + `mods`. 10 이상 `hit`, 7~9 `mixed`, 6 이하 `miss`. 어느 결과든 다음으로 진행하고, `fates` 조건이 참이면 작은 끝으로 간다.
- 귀찌 수명이 0 이 되면 작은 끝(은발)으로 간다. 낮을 때는 `mods` 의 `귀찌 <= 3` 같은 보정도 쓴다.

## 입식 교체와 CG

- 인물: `sprite_alt: { if: "flag:후드_벗음", sprite: asina }`. 조건이 참이면 `sprite` 대신 쓴다. 표정 파일은 `<입식>_<face>`.
- 행동: `before: { flags: {...} }` 는 주사위 뒤, 서술 앞에 적용한다.
- 결과 `lines` 에 `cg:` 가 있으면 GM 이 쓴 서술에도 같은 CG 가 붙는다.
- `cgs` 의 `fit: cover` 는 화면 전체를 채운다.
