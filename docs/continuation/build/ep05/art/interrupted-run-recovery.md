# 5화 안전 생성 중단 복구

생산 감독을 세션 소유 monitor 명령으로 실행해 세션 종료·재구성에 묶였다. 새 세션은 오래된 stage1 지시를 재실행했다. 원래 shutdown 호출자는 미확정. stop 파일 발동 증거 없음. control 필드는 파일명 메타데이터였다.

현재 부모 RECOVERY GO로 원래 safe55만 계속한다. 기존 held15·최종 거절 c002·그림 승계2는 유지한다. 기존21과 원래 진행 중 저장된 c028_p02 한 장을 합쳐 기록 PNG22, 잔여34다. c028_p02 원래 종료 코드는 null(unknown)이며 0으로 추정하지 않았다. SHA-256 `db4a21058f8ce86e24139e9e1b3f82c90370f926574b285a076e39734b6f9e2f`, 3655466바이트·1672×941, 원래 start/log와 부모 확인을 근거로 복구했다. 독립 Claude pending·승인0·설치0이다.

기존 감독 코드를 전용 helper로 보존·최소 변경. producer를 독립 Popen 새 세션으로 실행하고 observer는 durable 상태만 읽는다. 원래 start/result/output 충돌 시 차단해 고아 중복 생성을 막는다.

재구성 때 native-production-ownership.md·safe-resume-policy.json·이 복구 GO를 먼저 읽는다. 과거 mapping-only/GO 대기나 전체74개로 되돌리지 않는다.

잔여 원래 허용 ID:

- `ep05_c028_p03`
- `ep05_c029_p01`
- `ep05_c033_p01`
- `ep05_c035_p01`
- `ep05_c036_p01`
- `ep05_c037_p01`
- `ep05_c038_p01`
- `ep05_c038_p02`
- `ep05_c040_p01`
- `ep05_c041_p01`
- `ep05_c042_p01`
- `ep05_c042_p03`
- `ep05_c042_p04`
- `ep05_c042_p05`
- `ep05_c042_p06`
- `ep05_c042_p07`
- `ep05_c043_p01`
- `ep05_c043_p02`
- `ep05_c044_p01`
- `ep05_c044_p02`
- `ep05_c045_p01`
- `ep05_c046_p01`
- `ep05_c047_p01`
- `ep05_c047_p02`
- `ep05_c048_p01`
- `ep05_c049_p01`
- `ep05_c049_p02`
- `ep05_c050_p01`
- `ep05_c051_p01`
- `ep05_c052_p02`
- `ep05_c053_p01`
- `ep05_c053_p02`
- `ep05_c055_p01`
- `ep05_c055_p02`
