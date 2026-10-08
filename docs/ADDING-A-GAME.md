# 새 게임 추가하기 (예: 축구)

이 저장소는 **게임 하나 = 폴더 하나 = PWA 하나**입니다. 게임끼리 코드를 섞지 않고, 필요하면 나중에 공통 부분만 뽑습니다.

## 가장 빠른 방법: 야구 폴더를 복사해서 시작

```powershell
Copy-Item -Recurse baseball soccer
Remove-Item -Recurse soccer\test\*      # 테스트는 새 규칙에 맞춰 다시 작성
```

그다음 체크리스트 (빠뜨리면 두 게임이 서로 저장 데이터나 캐시를 덮어씁니다):

| # | 파일 | 바꿀 것 |
|---|---|---|
| 1 | `soccer/manifest.webmanifest` | `name`, `short_name`, `description`, 색상 |
| 2 | `soccer/index.html` | `<title>`, `apple-mobile-web-app-title`, 설명 |
| 3 | `soccer/sw.js` | **`CACHE` 이름**(예: `soccer-v1`)과 `FILES` 목록 |
| 4 | `soccer/src/storage.js` | **저장 키 접두사**(`bb.save.*` → `sc.save.*`)와 `FORMAT` 문자열 |
| 5 | `soccer/icons/` | 아이콘 (`tools/make-icons.mjs` 를 복사해 `sample()` 함수의 그림만 바꾸면 됩니다) |
| 6 | `/index.html` (루트 런처) | 목록에 링크 추가, "준비 중" 항목 교체 |
| 7 | `README.md` 표 | 새 게임 한 줄 추가 |

저장 키와 캐시 이름을 서로 다르게 하는 이유: 같은 도메인(`github.io/Game/`)을 쓰므로 `localStorage`와 Cache Storage가 **게임들 사이에서 공유**됩니다. 이름이 같으면 서로 덮어씁니다.

자동으로 처리되는 것:
- `npm test` → `soccer/test/*.test.mjs` 를 자동 발견
- GitHub Pages 워크플로, `npm run site` → `manifest.webmanifest` 가 있는 폴더를 자동 포함(`test/` 제외)
- 아이폰 홈 화면에는 게임마다 따로 추가합니다(각각 독립된 앱 아이콘, 독립된 저장 데이터)

## 야구와 축구는 어디까지 공유할 수 있나

야구 코드 중 **경기 규칙(`sim.js`)과 화면의 일부만 야구 전용**이고 나머지는 스포츠와 무관합니다.

| 파일 | 재사용 가능성 |
|---|---|
| `rng.js`, `util.js`, `storage.js` | 그대로 공유 가능 |
| `game.js` 의 `advance`(시간 따라잡기), 일정 생성, 경제, 오프시즌 뼈대 | 거의 그대로. 팀/선수 구조만 다름 |
| `league.js` | 선수 능력치 항목, 포지션, 팀 구성이 야구 전용 → 축구용으로 새로 |
| `sim.js` | 야구 전용 → 축구용 `simulateMatch` 로 교체 (결과 모양 `{hs, as, line, plays, winnerId}` 만 맞추면 `game.js`/`views.js`가 대부분 재사용됨) |
| `views.js` | 전광판(이닝별 득점)은 야구 전용, 나머지 레이아웃/CSS는 공통 |

권장 순서: **두 번째 게임을 복사로 시작 → 동작 확인 → 겹치는 파일이 확실해지면 그때 `shared/` 폴더로 뽑기.** 미리 추상화하면 오히려 두 게임 모두 느려집니다.

`shared/` 로 뽑을 때 주의:
- 각 게임의 `sw.js` `FILES`에 `../shared/rng.js` 같은 경로를 추가해야 오프라인에서도 열립니다.
- `tools/build-site.mjs` 는 `manifest.webmanifest` 폴더만 복사하므로 `shared/` 도 복사하도록 한 줄 추가해야 합니다.

## 같은 틀을 쓰는 이유 (바꾸지 말 것)

- 상태는 JSON 직렬화 가능한 객체 하나. 저장/백업/복원/테스트의 전제입니다.
- 시간은 `nextGameAt` + `advance()` 따라잡기. iOS가 백그라운드 실행을 막기 때문입니다.
- 난수는 시드 + 상태 저장. 같은 입력에 같은 결과여야 몰아서 진행해도 결과가 같고, 버그를 재현할 수 있습니다.
- 난수를 쓰는 함수는 **`rng`를 인자로 받고, 안쪽에서 다시 `withRng`로 감싸지 않습니다.** (중첩하면 재현성이 깨집니다. 실제로 한 번 겪은 버그: `season.test.mjs` "오프라인 몰아서 진행" 테스트)
