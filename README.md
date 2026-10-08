# Game

앱을 닫아도 시간이 흐르는 **방치형 게임 모음**. 게임마다 폴더 하나, 빌드 도구 없음, 서버 없음.
아이폰에서는 **홈 화면에 추가한 웹앱(PWA)** 으로 실행하고, 한 번 열어 두면 **인터넷 없이도** 열립니다. Mac, 개발자 계정, USB 설치가 필요 없습니다.

| 폴더 | 게임 | 상태 |
|---|---|---|
| [`soccer/`](soccer/) | **축구 구단** — 잉글랜드/독일/한국 리그, 1·2부 승강제, 이적·임대·계약·재정, 어시스턴트 감독 | 플레이 가능 (v0.2) |
| [`baseball/`](baseball/) | 야구단 — MLB·KBO 구단을 맡아 로스터·계약·트레이드·FA·드래프트·재정을 운영하는 방치형 | 플레이 가능 (v2) |

## 가장 쉬운 실행 방법 (아이폰만으로)

1. GitHub 저장소 **Settings → Pages → Source = GitHub Actions** (한 번만)
2. **Actions → Deploy to GitHub Pages → Run workflow**
3. 아이폰 Safari로 `https://7fsikminq.github.io/Game/soccer/` → **공유 → 홈 화면에 추가**
4. 홈 화면 아이콘으로 한 번 실행(온라인) → 이후 비행기 모드에서도 실행

자세한 순서와 문제 해결: **[docs/IPHONE-SETUP.md](docs/IPHONE-SETUP.md)** (노트북에서 테스트하는 방법도 거기 있습니다)

```powershell
git clone https://github.com/7fsikMinQ/Game.git
cd Game
git checkout claude/serene-franklin-tpdu4g
npm test        # 자동 테스트 215개 (약 45초). 윈도우는 test.bat
npm start       # 개발 서버. 윈도우는 start.bat
```

## 문서

| 문서 | 내용 |
|---|---|
| [docs/IPHONE-SETUP.md](docs/IPHONE-SETUP.md) | **처음부터 끝까지**: 배포 → 홈 화면 추가 → 오프라인 확인 → 점검표 |
| [docs/DEPLOY.md](docs/DEPLOY.md) | GitHub Pages / Cloudflare Pages / Netlify |
| [docs/TESTING.md](docs/TESTING.md) | 자동 테스트, 브라우저 점검, 아이폰 수동 점검 |
| [soccer/README.md](soccer/README.md) | **축구 게임 설명서**(규칙, 화면, 어시스턴트, 이적·임대, 밸런스 조정 위치) |
| [docs/soccer/DESIGN.md](docs/soccer/DESIGN.md) | 축구 설계와 공식 |
| [docs/soccer/FM-COMPARISON.md](docs/soccer/FM-COMPARISON.md) | Football Manager 23/24/26과 비교 — 무엇을 가져오고 줄였는지 |
| [docs/soccer/REAL-DATA.md](docs/soccer/REAL-DATA.md) | **실제 구단·선수 이름·나이를 쓰는 방법**(개인용 가져오기) |
| [docs/soccer/RESEARCH.md](docs/soccer/RESEARCH.md) | 조사 기록(약 48건) — 확인된 것/못 한 것, 출처 링크 |
| [docs/soccer/ANALYSIS.md](docs/soccer/ANALYSIS.md) | 분석 10개 관점 |
| [docs/soccer/REVIEWS.md](docs/soccer/REVIEWS.md) | 검토 14개 라운드와 찾은 결함, 남은 위험 |
| [baseball/README.md](baseball/README.md) | 야구 게임 규칙, 개발자 메뉴 · [규정 반영표](docs/baseball/RULES.md) · [설계](docs/baseball/DESIGN.md) · [실제 데이터](docs/baseball/REAL-DATA.md) · [조사](docs/baseball/RESEARCH.md) · [분석](docs/baseball/ANALYSIS.md) · [검토](docs/baseball/REVIEWS.md) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 공통 구조와 시간 모델(저장·방치형 계산 방식은 두 게임이 같은 틀) |
| [docs/ADDING-A-GAME.md](docs/ADDING-A-GAME.md) | 새 게임 추가 방법 |

## 구조

```
Game/
├─ index.html              게임 목록
├─ soccer/                 축구 (PWA)   src/ css/ icons/ test/ sw.js manifest
├─ baseball/               야구 (PWA)
├─ tools/                  serve · test · smoke(2종) · make-icons · make-pack · build-site
├─ docs/  docs/soccer/  docs/data/(구단명 템플릿 CSV, 샘플)
├─ .github/workflows/      GitHub Pages 자동 배포
├─ start.bat  test.bat     윈도우용 더블클릭 실행
└─ package.json            의존성 없음(스크립트만)
```

## 요구 사항

- 아이폰: Safari, iOS 16.4 이상(홈 화면 웹앱). 개발/테스트용 Node.js 20+ 는 선택.

## 알아둘 점

- **iPhone은 화면이 꺼지거나 앱을 닫으면 코드를 못 돌립니다.** 마지막 시각을 저장해 두고 다시 열 때 지난 시간만큼 한꺼번에 계산합니다(축구 최대 120라운드).
- 데이터는 **기기 안(localStorage)** 에만 저장됩니다. iOS가 웹 데이터를 지울 수 있고, Safari 탭과 설치 앱의 저장소가 다를 수 있으니 **설치한 아이콘으로만 플레이**하고 **가끔 백업**하세요(앱이 알려줍니다).
- 선수·구단은 기본이 **가상**입니다(실제 이름의 초상권·상표 문제). 실제 이름을 쓰려면 [REAL-DATA.md](docs/soccer/REAL-DATA.md)의 가져오기를 쓰세요.
- 아이폰 실기기에서의 동작은 점검표로 직접 확인해야 합니다. 이 개발 환경에서는 Chromium(아이폰 크기)까지만 검증했습니다.
