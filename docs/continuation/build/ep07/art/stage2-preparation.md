# 7화 원작 참조 입력 준비

2026-11-09. 입력 준비 완료. 네이티브 생성 승인·호출은 0회이며 그림 QA 통과를 뜻하지 않는다.

승인된 후보 73개에 실제 입력 파일 73개를 연결했다. 원작 63컷은 대사 포함 원본 17장의 승인된 좌표에서 별도로 모두 보존했다. 입력 경로와 파일 SHA-256, 실제 원본 절대 좌표, 패널 선택 번호, 최초 공개 앵커는 `stage2-input-manifest.json`에 있다. 승인된 매핑·후보 명세와 원본 파일은 수정하지 않았다.

전체 컷을 사용하는 46개는 보존한 원작 크롭의 불변 하드 링크이며, 27개는 승인된 패널 선택을 절대 원본 좌표로 추출한 입력이다. 따라서 63개 원작 크롭과 73개 유효 후보 입력, 총 136개의 디코딩 픽셀이 해당 실제 원본 구간과 완전히 일치한다. 129개 대본 앵커와 공개 항목 28개는 승인 매핑 그대로 계승했다. 입력은 말풍선·효과 글자를 아직 지우지 않은 원작이며, 새 인물·몸·노출·사건·16:9 확장을 만들지 않았다.

`sips`의 2차 크롭에서 끝 경계 입력이 원본 크기로 남는 문제와 0 오프셋 입력이 첫 패널을 잘못 선택하는 문제를 크기·픽셀 비교로 검출했다. 두 파일은 덮어쓰지 않고 거절 입력으로 명시했다. c005_p01과 c005_p03의 올바른 입력은 `_input_v2.png`다. 나머지 정상 입력은 다시 만들지 않았다. 거절 입력을 glob으로 고르거나 생성에 넣으면 안 된다. 전체 입력은 원본 픽셀 비교로 확인했으며, 마지막 실패 입력 하나만 수정 후 재검사했다.

실제 원본 c026의 아버지 머리는 어두운색이므로 전사의 밝은 머리 표현을 색 지시로 쓰지 않는다. c063도 실제 원작 구도를 유지했다. 이 단계에서 원작 문서를 고치거나 독립 Claude 검수를 요청하지 않았다.

| 항목 | 수 |
|---|---:|
| 실제 원본 페이지 | 17 |
| 보존한 전체 원작 컷 크롭 | 63 |
| 승인 후보·유효 입력 | 73 |
| 전체 컷 동일 입력 하드 링크 | 46 |
| 선택 패널 입력 | 27 |
| 원본 픽셀 완전 일치 입력 | 136 |
| 보존한 거절 입력 | 2 |
| 기존 파일 덮어쓰기 | 0 |
| 네이티브 생성 호출 | 0 |
| 그림 QA PASS | 0 |

## 후보 입력 경로와 해시

| 후보 | 실제 입력 | SHA-256 | 절대 원본 y 구간 |
|---|---|---|---|
| ep07_c001 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c001_input.png` | `fc9c7852b144b17848961edd94a5434667405c37d5cc8a52290f026c7c1a8946` | 1797–3722 |
| ep07_c002 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c002_input.png` | `52785cb298624968ef6da4e295fa870c21e7ddd16977a91db5114041285947df` | 5492–9608 |
| ep07_c003 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c003_input.png` | `5a1a3f1a0488ba0b484f8424f90186e008beea2cc48871ba44f556cde516d68b` | 10685–14856 |
| ep07_c004 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c004_input.png` | `6c3a6a795df5a803279c89615b1a112d7e7411af2d2b3f8778dce9168087449a` | 15964–21934 |
| ep07_c005_p01 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c005_p01_input_v2.png` | `514835d29d1a08a53fa79868d2bfd27fa0fccabd5bd400e1824348fddc907e08` | 294–2994 |
| ep07_c005_p02 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c005_p02_input.png` | `6b45466085109b0dfaaf881e93cb34349c9891675189831d799ae904b92100fb` | 2994–6574 |
| ep07_c005_p03 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c005_p03_input_v2.png` | `33d799431260a5d8a4a9ea8a967e73d27204f8ecebe133dac6f4e20e0e9f08d8` | 6574–10787 |
| ep07_c006 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c006_input.png` | `f8c0b9c89cb45f5dddf7a36e1d8145f889255a014fafd01eca5bd62f5aca5925` | 11370–13544 |
| ep07_c007 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c007_input.png` | `4c9921e0f2db3128382e3172014133f2acde15148a202ec6f2bf2bdef618243f` | 13673–16294 |
| ep07_c008 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c008_input.png` | `d48bfd96bf2614f0d9bb8d2bb7370e656ab2f3dbeb87a87787ef7a52e4d4eff8` | 16685–18035 |
| ep07_c009 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c009_input.png` | `98a261df0a8c7533d0ddc8ce2f44523c3b380363386fdd6bd8d4684ec224aea3` | 19208–21887 |
| ep07_c010 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c010_input.png` | `81e32b4414e6cca6154940475dac0de5d7aac47a0568032373e1eb0285c13892` | 204–9193 |
| ep07_c011 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c011_input.png` | `f0f51da9cff333c18fb879dc2d8f237724cbf62b128daa330ffca01ecc6f5507` | 9941–16349 |
| ep07_c012 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c012_input.png` | `8b60bbf56ea7bd9dccd2626aacd5fbcac87264102b370868837e8fe71acd24cf` | 16862–19751 |
| ep07_c013 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c013_input.png` | `b05d2cd3449fddb09ab9068ef4d09d6853c4a01a99d66bd53bf23e3ec304d320` | 19975–25633 |
| ep07_c014_p01 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c014_p01_input.png` | `3e4581be2479935684c107155c705a76d740da20043cdaca435327deb7b1f87a` | 10–8210 |
| ep07_c014_p02 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c014_p02_input.png` | `f44bf5d10c3ed8324f4ae715ffe3ac41328ff926ce911b23408477ccdae8f533` | 8210–14277 |
| ep07_c015 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c015_input.png` | `dc13bff4f1df72ea79cfbb9e719816046130d5277d6173144e51e28f5562e2c5` | 14409–18246 |
| ep07_c016 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c016_input.png` | `0f54bd1dd7eb3d84ce56c13409b48118a539fde3f2c523c28b4f52644ec74f68` | 19183–26552 |
| ep07_c017 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c017_input.png` | `16c845e0287fe8acddf10a1afc9056743612c17f1e8c302fe3a3ab2f5a355c30` | 739–5607 |
| ep07_c018 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c018_input.png` | `0bd8a03f04e173033434f3f5aa11205ecd2145df601ed32271032619222dcfce` | 7434–15090 |
| ep07_c019_p01 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c019_p01_input.png` | `565a30c217aa1ad96beb99e79d069709e69f9e3e1b62455e61efa0992ab02f14` | 15723–20703 |
| ep07_c019_p02 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c019_p02_input.png` | `80a35b14916fff0fae68d4f40597dfffac27a5b5a06269de755d608478cc9938` | 20703–25243 |
| ep07_c020 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c020_input.png` | `0777748b53e0ad940d8666bbfbf1991d3c4528ee64d246ab3904ea4da6498424` | 3120–9114 |
| ep07_c021 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c021_input.png` | `ceaf5e15569c4c2517063678054c26d9f5a799bbf71c2ac067b23f31262220dd` | 9997–14094 |
| ep07_c022 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c022_input.png` | `3a366b8b17be337ddf5efa69a7624a3210962d208dfc04f5f3fe3fe9279d4b9d` | 14653–18834 |
| ep07_c023_p01 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c023_p01_input.png` | `040a54470fafdc25b8bae97dabc389e16a34ac3b86d05f368fe26a2907489afa` | 19023–23523 |
| ep07_c023_p02 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c023_p02_input.png` | `a81bbfbe3e510f6a7e933bef9f6541a127b198ba477c10f43b9fdf41f2e7dd78` | 23523–29086 |
| ep07_c024 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c024_input.png` | `be232c998b70b528c92604563d8db586a11f35d16afccb48c2204665462c2d56` | 464–8427 |
| ep07_c025 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c025_input.png` | `cb2131e6ed2942f2f672d4d12f14c516a83331be115aaffb43c35af33383a77c` | 9141–12327 |
| ep07_c026_p01 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c026_p01_input.png` | `22945c09115af1691fc0f0451305b028e16e3b83cac57d4895aca2bc3bdca308` | 12331–15431 |
| ep07_c026_p02 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c026_p02_input.png` | `d0bab2bea7c0e02a7a46fd0de2789ee4218c211bc91533a6cfdc60cdef8ee684` | 15431–23593 |
| ep07_c027 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c027_input.png` | `9ce2f4ac7debcb9db8164b6b882a78780b23acfdbb32d227d6b985224216803d` | 222–2138 |
| ep07_c028 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c028_input.png` | `479d06a7dff51c55487e1e6cab5bbe7e06c0e32fbb76768a37eb043746515117` | 2962–3736 |
| ep07_c029 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c029_input.png` | `ff42ae7a17cc8b0ac8a57e9edfca998e5361335e119227a1dfca64e0abfe31bd` | 3825–7168 |
| ep07_c030 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c030_input.png` | `70be5387e8371d07b1c8a0d8192be000b1a9eafb60e63644e17282c356121e8c` | 8398–10689 |
| ep07_c031_p01 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c031_p01_input.png` | `e18b26be0f70559e692158c5155dd5b7239885639a91cc4513c74074bcb4f75b` | 11868–16068 |
| ep07_c031_p02 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c031_p02_input.png` | `99fb9e195074e040077a0b0643a505446739a1dc60e67248b9b69e02350bd394` | 16068–25363 |
| ep07_c032_p01 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c032_p01_input.png` | `9da3e4468a86f9df6c07b151a232263c5cc4df21c4aa710c664c5db584f19e91` | 1284–11584 |
| ep07_c032_p02 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c032_p02_input.png` | `c533a13ddd8144336f12f15df0fa1bef114a09f99347c3d9836787c1dd976725` | 11584–15625 |
| ep07_c033 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c033_input.png` | `043c5ffeb484b90a10f6a5077f71130896d264355a9cc6950dce6a49e7780c81` | 15835–16493 |
| ep07_c034 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c034_input.png` | `a13d1c038db54794bbf8ced8046577e4716272113f6d379aff2d48878f920a9c` | 17306–22764 |
| ep07_c035 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c035_input.png` | `c4eb20d734ac69c8dfde3f57009bde2fc2bbe3e06a960c51eac665a42e77130e` | 22958–28057 |
| ep07_c037 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c037_input.png` | `42ba36a81e0099c0f260c86208fc2c2a85fc2db0ad5d9b64df12091df5269619` | 422–7985 |
| ep07_c038 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c038_input.png` | `bc543e86b6d2c12f5dc038851b818d6e769b6da1b019a5fa6c5b3ccac7934f01` | 8426–13432 |
| ep07_c039 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c039_input.png` | `3bb9f2ef1172aac88c840fc96fb8f4cf3714a291b902e69c9e395a4f8f8a32ad` | 14119–22936 |
| ep07_c040_p01 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c040_p01_input.png` | `36163e3e1d4daeb25fbec2a0e87d9ea7d0854bff923ae620c485a11277f46b68` | 222–10222 |
| ep07_c040_p02 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c040_p02_input.png` | `94f356822136c1da8960dba0220a516470fca9815e5cf33ef5a3d505128b561c` | 10222–14816 |
| ep07_c041 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c041_input.png` | `a7b16c2bb29b60520e50b9fe9181a337cca44dffe025fd5ccb63a7282a843575` | 15712–17356 |
| ep07_c042 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c042_input.png` | `526e5ad3ae0fc3b79901683d490e5a2ee9fa2dab2efc79cff984b16226bb25c9` | 18270–22465 |
| ep07_c043 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c043_input.png` | `29fffd2a759be1bc40157e4b3c4f544b918ed3d378d0cb6b5bb3e453af7d7b85` | 23523–27907 |
| ep07_c044_p01 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c044_p01_input.png` | `f2132d7b3afe178b8d204c755f7bab9a232f878b538c75509dc702417f6abdaf` | 264–5764 |
| ep07_c044_p02 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c044_p02_input.png` | `cbdd8460106b3a12c0ace02e32d908d8e584f0f131468445d7dffeab93352b7f` | 5764–10664 |
| ep07_c044_p03 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c044_p03_input.png` | `4d35aa0536a6b59b6d6f030e3af0b2070485faa7dcf8843dced8cfacf15dbc2c` | 10664–13832 |
| ep07_c045 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c045_input.png` | `16d66203df47d0438066536566b9de0db79bdb2a65b826ba130530b0d67b8976` | 15403–24457 |
| ep07_c046 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c046_input.png` | `5798b733770eb18fb7851887be1ba8fc9321d5190b43639f971fbacc2c6fb332` | 384–8441 |
| ep07_c047 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c047_input.png` | `111f3167fce50dd909635e02621520384d9a6dfde325c1e549dd61bdebe8b727` | 8461–14499 |
| ep07_c048 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c048_input.png` | `8243f6bab7557d03e8f2b12df306b5f7020a97c39cd0af2795aa70c8ae08662d` | 15449–19658 |
| ep07_c049 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c049_input.png` | `e96efa95e31d562defc1a0b12ce3838a6bdc4eacf7acc75056b5a97ad1632ef2` | 721–5278 |
| ep07_c053 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c053_input.png` | `db6688cbfd8dee21bf8cc2911458b40bbe559e58260a33d7a920e6bb0bda8da2` | 13578–19837 |
| ep07_c054 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c054_input.png` | `e4469ebfad36fcaf9ab885b8cee3709a94953046ad6175a4d1f60403abe4a823` | 19904–20543 |
| ep07_c055 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c055_input.png` | `72519bacc66f460a739b94f50e4c15e32d7eb44c2e796aa4e47485c19a0e8ec4` | 20643–23490 |
| ep07_c056 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c056_input.png` | `c772d179a83dfa3db3501358f1ebab68c61c031a2114ba5bfa794ad3520645bc` | 377–5354 |
| ep07_c057 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c057_input.png` | `207b2280727e05e2b34e049629b4dd39b71850fccec84ad9b9fc9bcdc65d179d` | 5354–9434 |
| ep07_c058_p01 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c058_p01_input.png` | `0edd8807bf63a61701cd1dd03b35c8bb6b3bcda6ed1a0361fd20add248845d30` | 9500–19700 |
| ep07_c058_p02 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c058_p02_input.png` | `792480db0fd201795ebe8f4fb29f00d06d1fb971dbf0eceab287c183ba78ca1d` | 19700–25300 |
| ep07_c058_p03 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c058_p03_input.png` | `9e10bc1dcc02ae5fc639ae9ff70c9893969e7e298b43441b7f7932bd2b361b44` | 25300–28855 |
| ep07_c059_p01 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c059_p01_input.png` | `85b5d07eebd83af7f86369ac966802d6387a72abee8b87a6a467f8dbb2ef123c` | 92–4892 |
| ep07_c059_p02 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c059_p02_input.png` | `a05b7201ab216af3949b1fcd4cb476bf1f1e757bed89109c6cd34850ca5d66b6` | 4892–9509 |
| ep07_c060 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c060_input.png` | `f818b42b5a7e57aa9d91b8932afa733246265358ced91d304ed75ec5c4e43f8c` | 9823–19386 |
| ep07_c061_p01 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c061_p01_input.png` | `9224a49a4525cd4901b689391c7efdf2aaf1349c5f17b4b72c333b54d17c7302` | 19386–25286 |
| ep07_c061_p02 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c061_p02_input.png` | `3ead057333d1268a5c8707936b4f6a9e69e774f635a0d145d36dc97ac4e5504c` | 25286–29609 |
| ep07_c063 | `assets/ep07/gen/inputs/stage2/candidates/ep07_c063_input.png` | `a37faa89623c0c45c9527b6efd89e106551cc8f95a7b7c7e1e3b608af04604c6` | 2581–9976 |

## 다음 실행의 제한

입력 준비 GO는 그림 생성 GO가 아니다. 부모가 root hair·ep02·기존 작업을 포함한 전역 최대 3개 슬롯을 관리한다. 별도 슬롯 GO를 받기 전에는 native 호출을 하지 않는다. 생성 후보 경로는 승인된 manifest에 명시된 파일만 사용하고, 원작 입력과 거절 입력을 완성 후보로 집계하지 않는다. 이 단계에는 YAML·테스트·공유 코드·다른 화 자산·원작 문서 수정, 서버·브라우저, 커밋·푸시·crq가 없다.
