# 월흔 TRPG 데모 · 1화 사막 조우

웹툰 「월흔」 1화 사막 조우를 아시나로 플레이하는 비주얼 노벨형 TRPG 수직 슬라이스. 시나리오 비트는 파일로, 자유 입력은 로컬 LLM GM이, 판정은 코드(2d6)가 맡는다. 인터넷 없이 이 맥에서 돈다.

![타이틀](../docs/screenshots/01_title.png)

## 실행

준비(한 번, 인터넷 필요):

```sh
brew install llama.cpp
cd app
bun scripts/fetch_model.ts        # 기본 GM 모델 Gemma 4 26B-A4B(13.6GB, 실행 중 메모리 약 15GB)를 ../models 에 받는다
```

실행(인터넷 불필요):

```sh
./run.sh                 # 로컬 LLM 서버 + 앱을 띄우고 브라우저를 연다 (Ctrl+C 로 종료)
./run.sh --no-llm        # GM 없이 작가가 쓴 대사로만 진행
./run.sh --no-open       # 브라우저를 열지 않는다(--model <모델키> 로 다른 모델)
```

검증(이 맥에서는 LLM 을 띄우는 명령 앞에 `heavy --` 를 붙인다):

```sh
bun test tests                                              # 판정·엔진·GM 검증·오프라인 테스트
bun e2e/autoplay.ts --route 1 --shots ../docs/screenshots   # run.sh 로 띄워 갈래 1~5 중 하나를 결말까지 자동 플레이
bun eval/run_eval.ts <모델키>                               # 같은 입력 20개로 GM 모델 비교
bun eval/run_nonsense.ts <모델키>                           # 엉뚱한 입력 묶음으로 막힘과 인물 대사 비율 측정
```

## 기능

- 비주얼 노벨 화면: 원작 클린본 배경과 이벤트 CG, 입식 자리, 대사창, 선택지, 자유 입력
- 판정: 2d6 + 능력치, 10 이상 성공 / 7~9 대가 있는 성공 / 6 이하 실패해도 진행, 주사위 연출
- 진행 수치: 의심, 집착, 호감, 귀찌 수명, 탈주 준비도
- 로컬 GM: 비트에 묶인 프롬프트, 원작 설정 사전, 출력 검증과 재생성, 끝내 어긋나면 작가 대사로 대체
- 저장·불러오기, 플레이 기록(선택·판정·시간, `logs/<세션>.jsonl`), 결과 화면
- 오프라인: 127.0.0.1 전용, 네트워크 차단 샌드박스(`config/offline.sb`), 같은 출처만 허용하는 CSP

## 구조

```sh
app/
├── run.sh               # 실행 스크립트 하나
├── config/              # models.json(모델 목록·라이선스), offline.sb(네트워크 차단)
├── content/             # ep01_desert.yaml(비트), lore_wolheun.yaml(원작 설정 사전)
├── src/engine/          # 비트 로더·검증, 판정, 상태 기계, 저장, 결과 요약
├── src/gm/              # 프롬프트, 출력 검증, 재생성, llama-server 클라이언트
├── src/server/          # 앱 서버(Bun.serve)
├── web/                 # 화면(index.html, main.ts, style.css, 임시 그림)
├── tests/               # bun test
├── e2e/                 # 자동 플레이, 네트워크 감시
├── eval/                # GM 모델 비교 입력과 결과
└── scripts/             # 모델 받기
```

## 문서

- 시나리오 비트 형식: [../docs/beat_format.md](../docs/beat_format.md)
- GM 모델 비교: [../docs/gm_model_eval.md](../docs/gm_model_eval.md)
- 스크린샷: [../docs/screenshots/](../docs/screenshots/)
