# 10화 실제 결정 지도

자동 진행 장면 칸과 선택 지점을 구별한다. YAML의 atlas.chapters.ep10이 아래 전체 노드를 소유하며 edges는 실제 next와 선택 경로를 따른다.

| 선택 비트 | 실제 선택 | 도착 |
|---|---|---|
| ep10_c026 | 머리를 기른 이유를 말한다 | ep10_c027 |
| ep10_c026 | 머리 이야기는 넘긴다 | ep10_c028 |
| ep10_c029 | 사촌들과 자란 이야기를 한다 | ep10_family_source |
| ep10_c029 | 가족 이야기는 하지 않는다 | ep10_c030 |
| ep10_c034 | 이름과 작명 이야기를 말한다 | ep10_name_source |
| ep10_c034 | 이름만 확인해 준다 | ep10_travel_question |
| ep10_c043 | 왕은 왜 집에만 있느냐고 반문한다 | ep10_c044 |
| ep10_c043 | 이유는 말하지 않고 호칭을 묻는다 | ep10_c047 |
| ep10_c052 | 베히님이라고 부른다 | ep10_title_source |
| ep10_c052 | 라 쿤이라고 부른다 | ep10_c055 |
| ep10_c058 | 아무 말도 하지 않는다 | ep10_c059 |
| ep10_c058 | 손을 놓으라고 말한다 | ep10_distance_refusal |
| ep10_c058 | 손목을 빼려 한다 | ep10_withdraw |
| ep10_travel_choice | 왕은 왜 집에만 있느냐고 반문한다 | ep10_c044 |
| ep10_travel_choice | 이유는 말하지 않고 호칭을 묻는다 | ep10_c047 |

손목을 빼는 선택은 ep10_withdraw에서 비판정 반응을 내고 ep10_distance_success로 이어진다. 손목 해제와 거리 확보는 ep10_distance_question의 대화와 종료 상태에서도 유지된다. 판정 등급을 가짜 갈림길로 만들던 ep10_distance_miss는 제거했다. 원작 침묵 경로만 c059–c078을 그대로 읽는다.

원문 밖 발화는 선택의 lines, ep10_travel_question, ep10_distance_* 및 원작 호칭을 쓰지 않은 c055의 조건부 한 줄이다. 원문 발화를 다른 선택에 강제로 읽히지 않는다.

| 지도 노드 | 포함 비트 |
|---|---|
| ep10_s01 | ep10_c001, ep10_c002, ep10_c003, ep10_c004, ep10_c005, ep10_c006, ep10_c007 |
| ep10_s02 | ep10_c008, ep10_c009, ep10_c010, ep10_c011, ep10_c012, ep10_c013, ep10_c014 |
| ep10_s03 | ep10_c015, ep10_c016, ep10_c017, ep10_c018, ep10_c019, ep10_c020 |
| ep10_s04 | ep10_c021, ep10_c022, ep10_c023, ep10_c024, ep10_c025, ep10_c027, ep10_c028, ep10_c030 |
| ep10_s05 | ep10_c031, ep10_c032, ep10_c033, ep10_c035, ep10_c036, ep10_c037, ep10_c038, ep10_c039, ep10_c040, ep10_c041 |
| ep10_s06 | ep10_c042, ep10_c044, ep10_c045, ep10_c046, ep10_c047, ep10_c048, ep10_c049, ep10_c050 |
| ep10_s07 | ep10_c051, ep10_c053, ep10_c054 |
| ep10_s08 | ep10_c055, ep10_c056, ep10_c057, ep10_c059, ep10_c060, ep10_c061 |
| ep10_s09 | ep10_c062, ep10_c063, ep10_c064, ep10_c065, ep10_c066, ep10_c067, ep10_c068, ep10_c069, ep10_c070, ep10_c071 |
| ep10_s10 | ep10_c072, ep10_c073, ep10_c074, ep10_c075, ep10_c076, ep10_c077, ep10_c078 |
| ep10_c026_decision | ep10_c026 |
| ep10_c029_decision | ep10_c029 |
| ep10_c034_decision | ep10_c034 |
| ep10_c043_decision | ep10_c043 |
| ep10_c052_decision | ep10_c052 |
| ep10_c058_decision | ep10_c058 |
| ep10_travel_choice_decision | ep10_travel_choice |
| ep10_family_source_node | ep10_family_source |
| ep10_name_source_node | ep10_name_source |
| ep10_travel_question_node | ep10_travel_question |
| ep10_title_source_node | ep10_title_source |
| ep10_withdraw_node | ep10_withdraw |
| ep10_distance_refusal_node | ep10_distance_refusal |
| ep10_distance_success_node | ep10_distance_success |
| ep10_distance_question_node | ep10_distance_question |
| ep10_end_node | ep10_end |

| 출발 | 도착 |
|---|---|
| ep10_s01 | ep10_s02 |
| ep10_s02 | ep10_s03 |
| ep10_s03 | ep10_s04 |
| ep10_s04 | ep10_c026_decision |
| ep10_c026_decision | ep10_s04 |
| ep10_s04 | ep10_c029_decision |
| ep10_c029_decision | ep10_family_source_node |
| ep10_c029_decision | ep10_s04 |
| ep10_s04 | ep10_s05 |
| ep10_s05 | ep10_c034_decision |
| ep10_c034_decision | ep10_name_source_node |
| ep10_c034_decision | ep10_travel_question_node |
| ep10_s05 | ep10_s06 |
| ep10_s06 | ep10_c043_decision |
| ep10_c043_decision | ep10_s06 |
| ep10_s06 | ep10_s07 |
| ep10_s07 | ep10_c052_decision |
| ep10_c052_decision | ep10_title_source_node |
| ep10_c052_decision | ep10_s08 |
| ep10_s07 | ep10_s08 |
| ep10_s08 | ep10_c058_decision |
| ep10_c058_decision | ep10_s08 |
| ep10_c058_decision | ep10_distance_refusal_node |
| ep10_c058_decision | ep10_withdraw_node |
| ep10_s08 | ep10_s09 |
| ep10_s09 | ep10_s10 |
| ep10_s10 | ep10_end_node |
| ep10_family_source_node | ep10_s04 |
| ep10_name_source_node | ep10_s05 |
| ep10_travel_question_node | ep10_travel_choice_decision |
| ep10_travel_choice_decision | ep10_s06 |
| ep10_title_source_node | ep10_s07 |
| ep10_distance_refusal_node | ep10_distance_question_node |
| ep10_distance_question_node | ep10_end_node |
| ep10_distance_success_node | ep10_distance_question_node |
| ep10_withdraw_node | ep10_distance_success_node |
