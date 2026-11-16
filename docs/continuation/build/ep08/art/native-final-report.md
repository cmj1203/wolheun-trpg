# 8화 네이티브 제작 최종 인계

2026-11-09. 실제 후보 PNG 66개를 남겼고 다음 후보 호출 전에 외부 공유 슬롯 부족으로 실행기가 종료됐다. 그림 READY·독립 승인·게임 설치 완료가 아니다.

## 종료 시점의 단위별 상태

|항목|값|
|---|---:|
|plannedCandidateSlots|81|
|actualPNG|66|
|toolBlocked|0|
|held|15|
|independentApproved|0|
|installed|0|
|running|0|
|queued|0|
|shared_slots_reserved|1|

실제 PNG는 아래 승인 후보 경로만 뜻하며 원작 입력 PNG 81개·원작 전체 페이지 16개·비교판 66개는 제외했다. held 15개는 PNG가 없는 미호출 후보다. 생성된 PNG의 기술 검수 사항을 held에 더해 중복 계산하지 않는다. shared_slots_reserved는 이 작성자의 최대 1개 호출 승인 수이며 전역 실제 실행 수가 아니다.

## 실제 차단 근거

- 시각(UTC): `2026-11-09T06:33:38.875Z`
- 다음 후보: `ep08_c050_p01`. 이 후보의 프로세스·출력은 생성하지 않았다.
- 공유 슬롯 실제 점유 3개: 5화 PID/PGID `64347`, 6화 `65485`, 4화 `66058`. 이 시각의 argv 스냅샷이며 현재 프로세스 상태를 다시 조사한 값이 아니다.
- 작업 실행기 종료 코드: `2`. 이미지 도구 실패·거절로 인한 중단은 아니다.
- 차단 영수증: `docs/continuation/build/ep08/art/native/production-finished.json`
- 기존 정상 작업을 취소·재시작하거나 같은 후보를 다시 생성하지 않았다. 별도 슬롯 대기를 위한 실행기·하위 작업도 만들지 않았다.

## 산출물과 검증

- 최종 후보 매니페스트: `docs/continuation/build/ep08/art/native-final-manifest.json`
- 원래 순차 실행 기록: `docs/continuation/build/ep08/art/native-production-manifest.json`
- 영수증 기반 단위별 집계: `docs/continuation/build/ep08/art/native-production-counts.json`
- 첫 실제 시작·결과: `first-generation-start.md`·`first-generation-result.md`

후보 PNG 66개 전부 실제 파일·SHA-256·크기·영수증·종료 코드 0을 대조했다. 각 원작 입력과 출력의 비교판 66개도 실제 파일·해시를 확인했다. 나머지 15개는 출력과 실행 기록이 없음을 확인했다. 원작 입력 81개·기존 페이지 16개·승인 매핑 문서 3개의 해시와 62컷·121앵커·63비트 기준의 관객 23비트·재사용군·최초 공개 앵커를 보존했다.

66개는 모두 독립 Claude 원작 나란히 QA 대기다. Claude 요청을 재시도하거나 GPT 독립 PASS로 대체하지 않았다. 원작 인물·복장·소품·새 신체·사건·배경 변형 여부의 독립 시각 승인은 아직 없다. 정확한 16:9인 원본 출력은 0개이며, 66개 모두 비율 교차곱 차이를 매니페스트의 기술 검수 사항으로 남겼다. 네이티브 원본을 임의 크롭·리사이즈·재생성하지 않았다.

첫 실행 직후 macOS ps comm의 경로 축약 때문에 집계 수치를 미확정으로 정정했고 argv 기준 실제 2개를 확인했다. 이후 65개 호출은 argv 첫 실행 파일 기준으로 전역 실제 수를 다시 확인한 뒤 진행했으며 사전 집계는 모두 2개 이하였다. 처음 기록을 숨기거나 뒤늦게 확정 수치로 바꾸지 않았다.

YAML·테스트·공유 엔진·타입·GM·UI·lore·서버·모델은 수정하거나 실행하지 않았다. 브라우저·커밋·푸시·crq도 사용하지 않았다. 원래 매핑과 이미 만들어진 정상 자산은 그대로 남겼다.

## 실제 출력 전수 목록

|후보|실제 출력|SHA-256|규격|원작 비교판|독립 QA|
|---|---|---|---|---|---|
|ep08_c001_p01|assets/ep08/gen/ep08_c001_p01.png|c14e42057939f95756b7f5f7ddf048d743cd1ed063b3eaa17dc933ccae19e2bf|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c001_p01.jpg|대기|
|ep08_c002_p01|assets/ep08/gen/ep08_c002_p01.png|0b59af3f845f72dbd55f7daa92de5d129783ae90f968c4d6bcb2d923a7929291|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c002_p01.jpg|대기|
|ep08_c002_p02|assets/ep08/gen/ep08_c002_p02.png|556e671231953833f3eed9409389d922a46028320dc6dfb840b4396e14d23852|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c002_p02.jpg|대기|
|ep08_c002_p03|assets/ep08/gen/ep08_c002_p03.png|df38a4f4fe3e99266b6e76b1b4b45884cc424f1430075e20a3dcda28b0374eaa|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c002_p03.jpg|대기|
|ep08_c002_p04|assets/ep08/gen/ep08_c002_p04.png|b98173339294f62220621b2e2cc643fe41c21867fd4b1f6b03f4b6aac0cb5950|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c002_p04.jpg|대기|
|ep08_c003_p01|assets/ep08/gen/ep08_c003_p01.png|6f3945c020a9e54f61ecf6fe18e25a61c19c89c7568e5f1f8e428fefcbeab9ab|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c003_p01.jpg|대기|
|ep08_c004_p01|assets/ep08/gen/ep08_c004_p01.png|d0d32cd680123004a8664e6545eb74d9b021d8c3c43b7679e954e93014d3e8cd|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c004_p01.jpg|대기|
|ep08_c005_p01|assets/ep08/gen/ep08_c005_p01.png|30db3f167794d0434ad59c9e589b29b392875f5dd4defdb77841d1c7afefb75f|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c005_p01.jpg|대기|
|ep08_c006_p01|assets/ep08/gen/ep08_c006_p01.png|73ce21bb670f1c34907b1d717f525ed9a83a35d23aab31bad1ea19f4b09c16b4|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c006_p01.jpg|대기|
|ep08_c007_p01|assets/ep08/gen/ep08_c007_p01.png|a1fb0e8075d91d9443f4cdbc6fe10e092373dfe122fa449ce450423323c29847|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c007_p01.jpg|대기|
|ep08_c008_p01|assets/ep08/gen/ep08_c008_p01.png|57b4176278bc279146c6a83bfd733c8e8a5e7b3e792730663f3d21a81453ff8b|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c008_p01.jpg|대기|
|ep08_c009_p01|assets/ep08/gen/ep08_c009_p01.png|d5d4bed87408de8f2106502e347af0ac9a5c44c2fc0321bd7fde3a2b1e464d8e|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c009_p01.jpg|대기|
|ep08_c010_p01|assets/ep08/gen/ep08_c010_p01.png|8f21898c064724695f7778d5c3d6210e35cd1f8b4666e6b48448520700510b9e|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c010_p01.jpg|대기|
|ep08_c010_p02|assets/ep08/gen/ep08_c010_p02.png|90e8a44b4eb00958b3b06d47e380702be960446e64ff865633f6a40df2dc110c|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c010_p02.jpg|대기|
|ep08_c011_p01|assets/ep08/gen/ep08_c011_p01.png|2b8445749b2cb465add9054466c87643d68bc1ccd401a4dab3ceb092d2df127b|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c011_p01.jpg|대기|
|ep08_c012_p01|assets/ep08/gen/ep08_c012_p01.png|b9b729ad033d9e875f4c52e2c0c2e3984a2921e168e2fdabcc75bcc17eb8993c|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c012_p01.jpg|대기|
|ep08_c013_p01|assets/ep08/gen/ep08_c013_p01.png|908eabc84319d5ee2eb8de68460622c55d49f617f76632a4160ef624508f33da|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c013_p01.jpg|대기|
|ep08_c014_p01|assets/ep08/gen/ep08_c014_p01.png|bcc0319a7dea77e874b0ee831cc23a524ae0153425cdce6eecf24b40e19fd86d|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c014_p01.jpg|대기|
|ep08_c015_p01|assets/ep08/gen/ep08_c015_p01.png|af6919cc0eec18622ebeecf12354682a6fcc72e2619497b8c1f53a6b52664efd|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c015_p01.jpg|대기|
|ep08_c016_p01|assets/ep08/gen/ep08_c016_p01.png|7f054ea1e169b7ff8cb6fa21b1a87fc312fef9bc1837bb80c898fb1fb0faada0|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c016_p01.jpg|대기|
|ep08_c017_p01|assets/ep08/gen/ep08_c017_p01.png|664a33854bd9081a8cb9bf2882bb52c86d62d1548ab9d289ae01d79fd7519069|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c017_p01.jpg|대기|
|ep08_c018_p01|assets/ep08/gen/ep08_c018_p01.png|bd9db51b02cd441ab1c77fa47a12224fdedb252db60aca635b8317e0576765cd|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c018_p01.jpg|대기|
|ep08_c019_p01|assets/ep08/gen/ep08_c019_p01.png|829e16ef7e6de81f320bfefd5c7f4b53d306c7b5e42905c4266a72c9c2c0eb93|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c019_p01.jpg|대기|
|ep08_c020_p01|assets/ep08/gen/ep08_c020_p01.png|180900096e3c1a4cba1d215024a0c359c6812b26a503c50f63c471123c79aef2|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c020_p01.jpg|대기|
|ep08_c021_p01|assets/ep08/gen/ep08_c021_p01.png|6d397567bb7c5b196d193fb57e6ba102835935fe642c03f3d49746461a3d46e5|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c021_p01.jpg|대기|
|ep08_c022_p01|assets/ep08/gen/ep08_c022_p01.png|7097ae32ce9aa4db7f417c8935604efecf1e4a5f45e035128700082c511f0644|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c022_p01.jpg|대기|
|ep08_c023_p01|assets/ep08/gen/ep08_c023_p01.png|ae1b8212d86bfadf063793f0c8a2c34246ad3e43e6067d47b5c7aae7b3bc210b|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c023_p01.jpg|대기|
|ep08_c024_p01|assets/ep08/gen/ep08_c024_p01.png|eb4ec92fd3ceb73a5a9db968b97874c3d01b230a958f8d7d3724784b05497922|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c024_p01.jpg|대기|
|ep08_c025_p01|assets/ep08/gen/ep08_c025_p01.png|d6f45c0cc400c60687feeb18a297844c4a7c17e982fb1eed60e5b504fb2ae6c5|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c025_p01.jpg|대기|
|ep08_c026_p01|assets/ep08/gen/ep08_c026_p01.png|aec30cbddffeba3b2b2d5c317a8867a970ae164a5cd8fc117d18fdc21157403d|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c026_p01.jpg|대기|
|ep08_c026_p02|assets/ep08/gen/ep08_c026_p02.png|7a85a5e3ebaf209a358fbefa3adea6a651619d3a15308a48554a566c1410516b|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c026_p02.jpg|대기|
|ep08_c027_p01|assets/ep08/gen/ep08_c027_p01.png|7a1492b4396d57a40210a80c822d7f79917c9c32a4de18531493adeba6d6e905|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c027_p01.jpg|대기|
|ep08_c028_p01|assets/ep08/gen/ep08_c028_p01.png|ddacce6a4986b6b4f7f1fe1e6a6bf2c19da29eeaf8f9f3b9b96222ed53be8a54|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c028_p01.jpg|대기|
|ep08_c029_p01|assets/ep08/gen/ep08_c029_p01.png|0d03abba03f8952995e31a70c63693be1a003a6f7a33665bff212f12b4635d57|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c029_p01.jpg|대기|
|ep08_c030_p01|assets/ep08/gen/ep08_c030_p01.png|58e9edde55d669b8e93d29337c702ad4febbefa233a86a42a682bbe38a5e77e0|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c030_p01.jpg|대기|
|ep08_c031_p01|assets/ep08/gen/ep08_c031_p01.png|e550868406a9d6f7ce30275f5be72519e2e3678793b97c40cd9f34e1c57c40fc|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c031_p01.jpg|대기|
|ep08_c031_p02|assets/ep08/gen/ep08_c031_p02.png|5a1f84c2c404167eb7c9799239fce57c0c866c006946ed0fda2a21ed6f48101d|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c031_p02.jpg|대기|
|ep08_c032_p01|assets/ep08/gen/ep08_c032_p01.png|849095fa310551c4c508d881f959fe00a94d600fd6eb16a3bf0756901cbb3b23|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c032_p01.jpg|대기|
|ep08_c033_p01|assets/ep08/gen/ep08_c033_p01.png|cbe3f2d3e98dcdb8441ccbba2250bfaccfa3ae7fc591a2a6c46032ebb340fcf5|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c033_p01.jpg|대기|
|ep08_c034_p01|assets/ep08/gen/ep08_c034_p01.png|56aa3b56feec5920aa9b0a4b67c8a9c87cd7070a3d038feb70350e27c9defa0d|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c034_p01.jpg|대기|
|ep08_c035_p01|assets/ep08/gen/ep08_c035_p01.png|e05a5b60b9006a33980b2f69f280eb1b08cbf0a31a5ce6b0434e6744980e8b70|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c035_p01.jpg|대기|
|ep08_c036_p01|assets/ep08/gen/ep08_c036_p01.png|5810910be1dd36df8f7c7f410add563f22d34be72931a34d349aa5e2368c8b2b|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c036_p01.jpg|대기|
|ep08_c036_p02|assets/ep08/gen/ep08_c036_p02.png|2fa803f83bd58e4e4713404070540b2dafa76a7249f0c5e33d603a3636eed829|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c036_p02.jpg|대기|
|ep08_c036_p03|assets/ep08/gen/ep08_c036_p03.png|bd17d64696568119ba0aba3f85da596a27865603f13d869de94109475f628660|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c036_p03.jpg|대기|
|ep08_c037_p01|assets/ep08/gen/ep08_c037_p01.png|b422e7f07ee17ef7125e77c5d4eb160c295288ab6ae81d7da7131801f7037aaa|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c037_p01.jpg|대기|
|ep08_c038_p01|assets/ep08/gen/ep08_c038_p01.png|21283e64fe0df9f3823d77c7e47703ce494c380030ecd57386f2ab10bf3f7bef|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c038_p01.jpg|대기|
|ep08_c039_p01|assets/ep08/gen/ep08_c039_p01.png|215648f44a09c3a1939087665c53bfb0ff8723b84c2ad5f293400c98796be758|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c039_p01.jpg|대기|
|ep08_c039_p02|assets/ep08/gen/ep08_c039_p02.png|fcf4c2d97ff80bd5a7dcc446dd20fd7385c65537f5b57a9e31f017330f8ba248|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c039_p02.jpg|대기|
|ep08_c039_p03|assets/ep08/gen/ep08_c039_p03.png|11183851caf2d6e4b4b8a8ee00814c1f7db41eeb7ad8f8b395ec9d786ee4afc0|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c039_p03.jpg|대기|
|ep08_c040_p01|assets/ep08/gen/ep08_c040_p01.png|d9be2ee189aede363ce7976c775f05d214b40c13ba8664a4794a30781bb50e77|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c040_p01.jpg|대기|
|ep08_c040_p02|assets/ep08/gen/ep08_c040_p02.png|912e4fcdcc555789a201f3bc8811f23f27fa03e2855ccbe13ec87798ead075b0|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c040_p02.jpg|대기|
|ep08_c040_p03|assets/ep08/gen/ep08_c040_p03.png|b159e86ccb9248fab2c563049ffedc6803235ea93dba2f48503d397c99cf1f91|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c040_p03.jpg|대기|
|ep08_c041_p01|assets/ep08/gen/ep08_c041_p01.png|b1218c824e22061dd0d0718f7f030e230746c1d83ea86882b5a7c0218b6760f3|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c041_p01.jpg|대기|
|ep08_c042_p01|assets/ep08/gen/ep08_c042_p01.png|1c939c3966dea11e5cb20d27eae9428d2fc495ffeae6dc7e3be63281ab148c02|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c042_p01.jpg|대기|
|ep08_c043_p01|assets/ep08/gen/ep08_c043_p01.png|4a74653e15afce202aeee890acaeed55725449dd01026636a4d6be13397a7348|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c043_p01.jpg|대기|
|ep08_c044_p01|assets/ep08/gen/ep08_c044_p01.png|f44f3025f9f38b4a5174c1915bf1b55952bce7fe2ff9ae58987b8377d5889c24|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c044_p01.jpg|대기|
|ep08_c044_p02|assets/ep08/gen/ep08_c044_p02.png|6912a726bda995a8671fabd26c47d8675c024db4a9e6b3d3bea21a3d680d162b|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c044_p02.jpg|대기|
|ep08_c045_p01|assets/ep08/gen/ep08_c045_p01.png|b51c2507d70ce5b27034b4088d25d8667e9bb842de5dcb90f3a89b6bd38a9dd7|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c045_p01.jpg|대기|
|ep08_c045_p02|assets/ep08/gen/ep08_c045_p02.png|f00b6af8414540f7a60c290ee4448f8f1f708a3fa4cbe725f0e8ccbda82a9266|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c045_p02.jpg|대기|
|ep08_c046_p01|assets/ep08/gen/ep08_c046_p01.png|36c7408b6a7c60a772d606fe6f117cb845dd04247c1882053b6f279e323e02ba|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c046_p01.jpg|대기|
|ep08_c047_p01|assets/ep08/gen/ep08_c047_p01.png|ec97161484fe71d0fd9e1397564f1317a9828076f0e7be33543d181ae357a3a0|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c047_p01.jpg|대기|
|ep08_c048_p01|assets/ep08/gen/ep08_c048_p01.png|4f7f006150a8143bac6095ae00198a1954fc56c46959978eff13d7c4484b5390|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c048_p01.jpg|대기|
|ep08_c049_p01|assets/ep08/gen/ep08_c049_p01.png|2f15c2a7d5511c7eea102450a5e83a2c95713023d18f0895e8f6c1cea6e32ad6|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c049_p01.jpg|대기|
|ep08_c049_p02|assets/ep08/gen/ep08_c049_p02.png|6dc5042dc92dd170d014ad92cfe4d296c56f2e09cb3034ddfabadcdce6205595|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c049_p02.jpg|대기|
|ep08_c049_p03|assets/ep08/gen/ep08_c049_p03.png|f0e7da117b5b0d58e4b99d23ab5addeb9b5f0d944706c13d3f1305ab75dade21|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c049_p03.jpg|대기|
|ep08_c049_p04|assets/ep08/gen/ep08_c049_p04.png|c6b409ac8a9d9d81a152081730481fbd8d8e6406b2cdb0893dc1123200310d55|1672×941|docs/continuation/build/ep08/art/native/comparisons/ep08_c049_p04.jpg|대기|

## 미호출 보류 전수 목록

|후보|준비 입력|예정 출력|상태|
|---|---|---|---|
|ep08_c050_p01|assets/ep08/gen/inputs/ep08_c050_p01.png|assets/ep08/gen/ep08_c050_p01.png|공유 슬롯 부족으로 미호출|
|ep08_c051_p01|assets/ep08/gen/inputs/ep08_c051_p01.png|assets/ep08/gen/ep08_c051_p01.png|공유 슬롯 부족으로 미호출|
|ep08_c052_p01|assets/ep08/gen/inputs/ep08_c052_p01.png|assets/ep08/gen/ep08_c052_p01.png|공유 슬롯 부족으로 미호출|
|ep08_c053_p01|assets/ep08/gen/inputs/ep08_c053_p01.png|assets/ep08/gen/ep08_c053_p01.png|공유 슬롯 부족으로 미호출|
|ep08_c054_p01|assets/ep08/gen/inputs/ep08_c054_p01.png|assets/ep08/gen/ep08_c054_p01.png|공유 슬롯 부족으로 미호출|
|ep08_c055_p01|assets/ep08/gen/inputs/ep08_c055_p01.png|assets/ep08/gen/ep08_c055_p01.png|공유 슬롯 부족으로 미호출|
|ep08_c055_p02|assets/ep08/gen/inputs/ep08_c055_p02.png|assets/ep08/gen/ep08_c055_p02.png|공유 슬롯 부족으로 미호출|
|ep08_c056_p01|assets/ep08/gen/inputs/ep08_c056_p01.png|assets/ep08/gen/ep08_c056_p01.png|공유 슬롯 부족으로 미호출|
|ep08_c056_p02|assets/ep08/gen/inputs/ep08_c056_p02.png|assets/ep08/gen/ep08_c056_p02.png|공유 슬롯 부족으로 미호출|
|ep08_c057_p01|assets/ep08/gen/inputs/ep08_c057_p01.png|assets/ep08/gen/ep08_c057_p01.png|공유 슬롯 부족으로 미호출|
|ep08_c058_p01|assets/ep08/gen/inputs/ep08_c058_p01.png|assets/ep08/gen/ep08_c058_p01.png|공유 슬롯 부족으로 미호출|
|ep08_c059_p01|assets/ep08/gen/inputs/ep08_c059_p01.png|assets/ep08/gen/ep08_c059_p01.png|공유 슬롯 부족으로 미호출|
|ep08_c060_p01|assets/ep08/gen/inputs/ep08_c060_p01.png|assets/ep08/gen/ep08_c060_p01.png|공유 슬롯 부족으로 미호출|
|ep08_c061_p01|assets/ep08/gen/inputs/ep08_c061_p01.png|assets/ep08/gen/ep08_c061_p01.png|공유 슬롯 부족으로 미호출|
|ep08_c062_p01|assets/ep08/gen/inputs/ep08_c062_p01.png|assets/ep08/gen/ep08_c062_p01.png|공유 슬롯 부족으로 미호출|

부모가 다음 제작 범위를 지정하면 이 잔여 목록을 기준으로 삼는다. 이번 인계는 명시된 외부 차단 종료 조건에 따라 여기서 끝낸다.

