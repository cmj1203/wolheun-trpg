# 4화 미인계 회상 매핑 동기화

검증 시각: 2026-11-09T09:16:38.233Z

수정 범위는 art/manifest.json, art/매핑-초안.md와 이 새 보고서뿐이다. 부모 최종 계약 p1-beauty-memory-contract-20261109.md의 표와 현재 YAML을 대조했다.

- 현재 YAML SHA-256: `8215c140d6599e42e087b208e3fbbdcdac8ae2df1da5da6bf5bc6e5bae9a15b8`. 기존 `0e673c9a6f1b7afef22e69371227d369f1195bf277a934d1bdc7dc35125f4efe`는 과거 기준표 값이다. baseline 일치 표시는 false로 정정했다.
- 두 c057 줄1: 무조건 발화와 ep04_wet_known 적용. 줄2: literal 조건 `flag:미인계 || flag:미소녀`, sets=null.
- 원작 c057 예정 a_wet은 줄0만, b_approach는 무조건 줄1에서 시작해 줄2까지 담당한다. first_anchor와 양방향 줄 배정을 함께 변경했다. 거리 c057 세 줄은 c055 얼굴을 유지한다.
- 두 c057 next는 근거가 있으면 각 c058, 없으면 각 c059다. 두 c058의 derived_reachability_guard에 이 진입 조건을 기록했다. c058 네 줄의 literal condition=null을 유지했다. 근거 없는 경로에는 c058 비트·scene·bg·CG가 전달되지 않는다.
- 공개 표 wet_known 갱신 포인터도 두 줄1로 옮겼다. 원문·현재 CG ID·파일·배경과 소스 좌표는 그대로다.

한 번의 집중 검증: 133줄의 포인터·화자 원문·CG ID·배경 ID·조건·sets·effects 931건, CG/배경 파일 대응 266건, 84비트 next, 65예정 자산의 전체 줄 배정과 first_anchor, 두 경로×네 플래그 조합 8건 모두 통과했다. YAML 해시는 작업 전후 동일하다.

생산 보존: 작업 전후 실제 codex exec native는 0개, ep04 supervisor도 0개다. ep04 생산자는 idle이며 새 시작·재시작·슬롯 획득은 없었다. 전역3·에피소드풀2·cg_drink 예약1을 바꾸지 않았다. native-production-manifest, generation-inventory, native-production-recipes와 기존 시작/결과 영수증 총73파일의 SHA-256이 모두 보존됐다. 이미지·실제 원본 crop·현재 앱 CG·YAML·테스트·생산 argv를 수정하지 않았다. 이미지 재생성이나 앱 검사는 하지 않았다.

manifest 변경 JSON 포인터:

- `/input_hashes/app/content/ep04_night.yaml`
- `/baseline/yaml_hash_matches_lead_baseline`
- `/baseline/note`
- `/assets/58/canonical_line_indices/1`
- `/assets/58/all_line_anchors/1`
- `/assets/59/canonical_line_indices/0`
- `/assets/59/canonical_line_indices/1`
- `/assets/59/first_anchor`
- `/assets/59/all_line_anchors/0`
- `/assets/59/all_line_anchors/1`
- `/line_anchors/106/sets`
- `/line_anchors/106/proposed_asset`
- `/line_anchors/106/proposed_file`
- `/line_anchors/107/condition`
- `/line_anchors/107/sets`
- `/line_anchors/119/sets`
- `/line_anchors/120/condition`
- `/line_anchors/120/sets`
- `/beats/56/next`
- `/beats/57/derived_reachability_guard`
- `/beats/71/next`
- `/beats/72/derived_reachability_guard`
- `/reveals/13/flag_update_anchors/0`
- `/reveals/13/flag_update_anchors/1`
- `/parent_integration_notes/4`

실제 파일 존재 확인은 인계 직전 ls로 세 수정 파일에 수행한다. 기존 후보 수·승인 수를 이번 메타데이터 작업으로 갱신하거나 재계수하지 않았다.

