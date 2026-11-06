# 경로별 실제 관찰 목록

정식 next 경로 8개와 전역 조건으로 중단한 경로 15개를 합해 실제 관찰한 비트열은 23개다. 같은 비트열의 여러 입력·시드는 한 행에 합쳤다. 아래 시드는 게임 시작 시드이며, 재현 입력은 evidence.md와 input_matrix.md를 참조한다.

| 경로 | 비트 | 결말 | 시작 시드 |
|---|---|---|---:|
| E1 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → r4_prove → r4_walk → e_deal | deal | 2367396797 |
| E2 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → r5_claim → r5_price → e_value | value | 2367396797 |
| E3 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → r3_flee → r3_dusk → r3_night → e_road | road | 2367396797 |
| E4 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → b06_swing → b07_rule → b08_gaze → b09_verdict → e_curious | curious | 2367396797 |
| E5 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → b06_swing → b07_rule → b08_gaze → b09_verdict → e_survivor | survivor | 2367396797 |
| E6 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → b06_swing → b07_rule → b08_gaze → b09_verdict → r2_bind → e_spy | spy | 2367396797 |
| E7 | b00_open → b01_sand → b02_people → r3_slip → r3_dusk → r3_night → e_road | road | 2350619178 |
| E8 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → b06_swing → x_spy_cut | spy_cut | 2333841559 |
| E9 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → b06_swing → b07_rule → b08_gaze → x_spy_cut | spy_cut | 2333841559 |
| E10 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → b06_swing → e_spy | spy | 2300286321 |
| E11 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → x_spy_cut | spy_cut | 2283508702 |
| E12 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → b06_swing → r3_flee → r3_dusk → r3_night → e_road | road | 2249953464 |
| E13 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → r5_claim → x_spy_cut | spy_cut | 2926812877 |
| E14 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → r3_flee → r3_dusk → x_unmasked | unmasked | 2725481449 |
| E15 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → r4_prove → x_spy_cut | spy_cut | 476839218 |
| E16 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → b06_swing → b07_rule → b08_gaze → b09_verdict → x_unmasked | unmasked | 385889982 |
| E17 | b00_open → b01_sand → b02_people → x_collapse | collapse | 2367396797 |
| E18 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → x_collapse | collapse | 2367396797 |
| E19 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → b06_swing → x_collapse | collapse | 2367396797 |
| E20 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → r4_prove → x_collapse | collapse | 2367396797 |
| E21 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → r5_claim → x_collapse | collapse | 2367396797 |
| E22 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → b06_swing → b07_rule → b08_gaze → x_collapse | collapse | 2367396797 |
| E23 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → b06_swing → b07_rule → b08_gaze → b09_verdict → r2_bind → x_collapse | collapse | 2367396797 |

## 종료 확인 경로

각 실제 도달 상태에서 게임 종료 → confirm(ok:true)를 보냈다.

| 경로 | 비트 | 결말 | 시작 시드 |
|---|---|---|---:|
| Q1 | b00_open → b01_sand → b02_people → e_quit | quit | 2367396797 |
| Q2 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → e_quit | quit | 2367396797 |
| Q3 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → b06_swing → e_quit | quit | 2367396797 |
| Q4 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → r4_prove → e_quit | quit | 2367396797 |
| Q5 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → r5_claim → e_quit | quit | 2367396797 |
| Q6 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → r3_flee → r3_dusk → e_quit | quit | 2367396797 |
| Q7 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → b06_swing → b07_rule → b08_gaze → e_quit | quit | 2367396797 |
| Q8 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → b06_swing → b07_rule → b08_gaze → b09_verdict → r2_bind → e_quit | quit | 2367396797 |

## 위험한 행동 계약 경로

| 경로 | 비트 | 결말 | 검증 방식 |
|---|---|---|---|
| R1 | b00_open → b01_sand → b02_people → b03_ask → b04_blade → b05_why → x_reckless | reckless | 실제 b05 상태에 attack 해석 주입 후 실제 실패 판정. b00부터 같은 자연어를 자동 분류한 통합 재현은 아님 |

## 분기별 연결

- b00_open: b01_sand.
- b01_sand: b02_people.
- b02_people: r3_slip, b03_ask (자유 입력).
- b03_ask: b04_blade.
- b04_blade: b05_why.
- b05_why: r3_flee, r4_prove, r5_claim, b06_swing (자유 입력).
- b06_swing: r3_flee, b07_rule (자유 입력).
- b07_rule: b08_gaze.
- b08_gaze: b09_verdict (자유 입력).
- b09_verdict: r2_bind, e_curious, e_survivor.
- r2_bind: e_spy (자유 입력).
- r3_flee: r3_dusk.
- r3_slip: r3_dusk.
- r3_dusk: r3_night (자유 입력).
- r3_night: e_road.
- r4_prove: r4_walk (자유 입력).
- r4_walk: e_deal.
- r5_claim: r5_price (자유 입력).
- r5_price: e_value.

위 next 간선에는 순환과 막힌 말단이 없다. 입력에 의한 같은 비트 체류는 따로 input_matrix.md에 기록했다. 중도 종료의 전체 조건·우선순위와 실험으로 도달하지 못한 조합은 flow_audit.md의 전역 경로 표를 따른다.

