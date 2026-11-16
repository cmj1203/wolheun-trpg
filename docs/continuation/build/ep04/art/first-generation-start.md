# 4화 첫 native 생성 실제 시작

2026-11-09. 상태: **STARTED**. 실제 자식 시작 영수증을 읽고 작성했다. 대기 중이던 실행 셀이 풀린 뒤 시작했으며 중복 호출하지 않았다.

| 항목 | 실제 값 |
|---|---|
| native PID / PGID | `1443` / `1443` |
| 실행기 PID / PGID | `1441` / `1441` |
| 프로세스 그룹 분리 | 자식 1443, 실행기 1441로 다름 |
| 시작 직전 기존 native | 0개 |
| 원작 | `/Users/choeminju/월흔_trpg/work/ep04/merged/ep04_001.png` |
| 원작 창 | `[0,654,2000,4000)` |
| 실제 `-i` 입력 | `/Users/choeminju/월흔_trpg/assets/ep04/gen/source/ep04_c001.png` · 2000×3346 |
| 실제 예정 출력 | `/Users/choeminju/월흔_trpg/assets/ep04/gen/ep04_c001.png` |
| native 로그 | `/Users/choeminju/월흔_trpg/docs/continuation/build/ep04/art/generation/ep04_c001-native.log` |
| 실제 시작 영수증·전체 명령 인자 | `/Users/choeminju/월흔_trpg/docs/continuation/build/ep04/art/generation/ep04_c001-start.json` |
| 종료 영수증 감시 | `/Users/choeminju/월흔_trpg/docs/continuation/build/ep04/art/generation/ep04_c001-result.json` |

실행기는 `subprocess.Popen`에 아래 실제 명령을 인자 배열로 공급했다. 표준입력은 DEVNULL, 출력과 오류는 위 로그로 연결했고 `start_new_session=True`로 실행했다. 프롬프트는 `generation/ep04_c001-prompt.md`의 전체 내용과 같다. 실행기가 남긴 쉘 인용 명령 전문은 시작 영수증의 `실제_명령` 필드에도 있다.

```sh
/opt/homebrew/bin/codex exec --skip-git-repo-check -s workspace-write -C '/Users/choeminju/월흔_trpg/assets/ep04/gen' -i '/Users/choeminju/월흔_trpg/assets/ep04/gen/source/ep04_c001.png' -- '4화 원작 c001의 국소 편집·가로 확장 한 장만 수행한다. 첨부된 실제 원작 입력은 `work/ep04/merged/ep04_001.png`의 정확한 `[0,654,2000,4000)` 창을 RGB PNG로 추출한 것이다. 내장 image_gen으로 실제 입력을 편집한다. 이 그림은 인물 없는 밤 궁정의 장면이다.

원작의 아래에서 올려다보는 기울어진 시점, 아치의 굴곡과 건축 비율, 천장 기하 문양, 꽃무늬 기둥과 주두, 어두운 남보라·청색 밤하늘, 별빛과 구름, 오른쪽 식물의 모양과 색을 보존한다. 기존 구도를 새 궁전 전경으로 다시 그리거나 바로 세우지 않는다. 원작의 그림체·선·색·주요 그림을 최대한 그대로 유지한다.

입력의 흰 바깥 여백과 있는 경우의 문자만 제거하고, 같은 회랑·하늘·식물 배경을 좌우로 자연스럽게 확장해 16:9 가로 CG로 만든다. 1920×1080의 정확한 16:9를 목표로 한다. 원작 부분을 세로로 찌그러뜨리거나 확대 흐림 띠·거울 복사·단색 띠로 채우지 않는다. 인물, 동물, 새로운 사건, 달, 새 소품, 새로운 글자·말풍선·로고·워터마크를 추가하지 않는다. 원작에 보이지 않는 도시나 별도 건물을 새로 만들지 않는다.

실제 내장 image_gen 결과 PNG 한 장을 `/Users/choeminju/월흔_trpg/assets/ep04/gen/ep04_c001.png`에 저장한다. 같은 경로가 이미 있으면 덮어쓰거나 중복 생성하지 말고 기존 파일을 보고한다. 생성 도구가 만든 실제 파일만 복사한다. 로컬 확산·SDK/API 대체·가짜 이미지·안전 필터 우회는 하지 않는다. 원격 도구가 실패하면 실제 오류를 보고하고 멈춘다.

다른 컷·코드·YAML·원작·문서·서버·모델·검수에는 손대지 않는다. 추가 하위 작업이나 다른 생성 호출을 시작하지 않는다. 자가 PASS를 선언하지 않는다. 마지막 답은 실제 저장 경로와 사용한 내장 도구, 실제 결과 크기를 한국어로 적는다.
'
```

이 문서는 시작 증거다. 아직 생성 완료나 미술 PASS를 뜻하지 않는다. 이 레인은 1호출만 실행하며 전역 상한 3을 지킨다. 정상 02·03·head 작업은 취소하지 않는다. 결과 PNG·해시·로그·원본 비교는 실제 완료 뒤 `first-generation-result.md`에 남긴다. Claude 호출은 하지 않는다.
