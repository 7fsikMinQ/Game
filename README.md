# Game

앱을 닫아도 시간이 흐르는 **방치형 게임 모음**. 게임마다 폴더 하나, 빌드 도구 없음, 서버 없음.
아이폰에서는 **홈 화면에 추가한 웹앱(PWA)** 으로 실행합니다. Mac, 개발자 계정, USB 설치가 필요 없습니다.

| 폴더 | 게임 | 상태 |
|---|---|---|
| [`baseball/`](baseball/) | 야구단 — 구단을 키워 우승을 노리는 방치형 | 플레이 가능 (v0.1) |
| (예정) `soccer/` | 축구 구단 | 같은 엔진 구조로 추가 예정 |

## 3분 요약

```powershell
git clone https://github.com/7fsikMinQ/Game.git
cd Game
git checkout claude/serene-franklin-tpdu4g   # 이 작업이 올라간 브랜치

npm test        # 자동 테스트 61개 (몇 초)
npm start       # 서버 실행 -> 출력된 주소를 아이폰 Safari에서 열기
```

윈도우에서는 `test.bat`, `start.bat`을 더블클릭해도 됩니다. (Node.js만 설치되어 있으면 됩니다.)

그다음 순서는 **[docs/IPHONE-SETUP.md](docs/IPHONE-SETUP.md)** 를 그대로 따라 하세요.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/IPHONE-SETUP.md](docs/IPHONE-SETUP.md) | **처음부터 끝까지**: 노트북에서 받기 → 테스트 → 아이폰에서 열기 → 홈 화면에 추가 |
| [docs/DEPLOY.md](docs/DEPLOY.md) | 인터넷(HTTPS)에 올려서 PC 없이 쓰기: GitHub Pages / Cloudflare Pages / Netlify |
| [docs/TESTING.md](docs/TESTING.md) | 자동 테스트, 브라우저 스모크 테스트, 아이폰 수동 점검표 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 구조, 방치형 시간 모델, 경기 시뮬레이션 공식, 경제, 저장 형식 |
| [docs/ADDING-A-GAME.md](docs/ADDING-A-GAME.md) | 새 게임(축구 등)을 이 저장소에 추가하는 방법 |
| [baseball/README.md](baseball/README.md) | 야구단 게임 규칙, 개발자 메뉴(치트), 밸런스 조정 위치 |

## 구조

```
Game/
├─ index.html              게임 목록(런처)
├─ baseball/               야구 게임 (그 자체로 하나의 PWA)
│  ├─ index.html  manifest.webmanifest  sw.js
│  ├─ css/  icons/
│  ├─ src/                 rng · league · sim · game · storage · views · app
│  └─ test/                node:test 자동 테스트
├─ tools/                  serve(개발 서버) · test · smoke · make-icons
├─ docs/
├─ .github/workflows/      GitHub Pages 자동 배포
├─ start.bat  test.bat     윈도우용 더블클릭 실행
└─ package.json            의존성 없음(스크립트만)
```

## 요구 사항

- Node.js 20 이상 (개발/테스트용. 아이폰에서 게임을 돌리는 데는 필요 없음)
- 아이폰 Safari (iOS 16.4 이상이면 홈 화면 웹앱 기능이 모두 동작)

## 알아둘 점

- **iPhone은 화면이 꺼지거나 앱을 닫으면 코드를 못 돌립니다.** 그래서 마지막 시각을 저장해 두고, 다시 열 때 지난 시간만큼의 경기를 한꺼번에 계산합니다(최대 200경기). 사용자 입장에서는 닫아둔 동안에도 시즌이 진행된 것과 같습니다.
- 데이터는 **기기 안(localStorage)** 에만 저장됩니다. iOS가 웹 데이터를 지울 수 있으니 구단 탭의 **백업**을 가끔 쓰세요.
- 선수·구단 이름은 전부 가상입니다.
