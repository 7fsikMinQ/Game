# 인터넷에 올려서 아이폰만으로 쓰기 (방법 B)

[IPHONE-SETUP.md](IPHONE-SETUP.md)의 방법 A는 노트북 서버가 켜져 있어야 합니다.
이 문서는 정적 파일을 **HTTPS 주소**에 올려서, 노트북 없이 아이폰만으로 쓰고 **오프라인에서도 열리게** 만드는 방법입니다.

HTTPS가 필요한 이유: iOS는 암호화된 주소(`https://`)에서만 서비스 워커(오프라인 캐시)를 허용합니다. 이 게임은 서버 코드가 없는 정적 파일뿐이라 어떤 정적 호스팅이든 됩니다.

먼저 배포용 폴더를 만드는 법부터 (호스팅 업체에 직접 올릴 때 필요):

```powershell
npm run site     # _site/ 폴더 생성 (index.html + 게임 폴더들, test 폴더 제외)
```

## 선택 가이드

| | 저장소 공개 필요 | 비용 | 난이도 | 비고 |
|---|---|---|---|---|
| **GitHub Pages** | 공개 저장소면 무료. 비공개는 유료 플랜 필요 | 무료~ | 쉬움 | 푸시하면 자동 배포(워크플로 포함됨) |
| **Cloudflare Pages** | 불필요 (비공개 OK) | 무료 | 쉬움 | 폴더 끌어다 놓기 또는 GitHub 연결 |
| **Netlify** | 불필요 | 무료 | 가장 쉬움 | 폴더 끌어다 놓기. 계정에 연결해야 유지됨 |

저장소를 비공개로 두고 싶다면 Cloudflare Pages를 권장합니다.

---

## 1. GitHub Pages

저장소에 `.github/workflows/pages.yml` 이 이미 들어 있습니다. 하는 일: `main` 브랜치에 푸시되면 ① 테스트 실행 ② 통과하면 배포.

1. 작업 브랜치(`claude/serene-franklin-tpdu4g`)를 `main`에 합칩니다 (GitHub에서 Pull Request → Merge).
2. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꿉니다.
3. **Actions** 탭에서 `Deploy to GitHub Pages` 가 초록색이 될 때까지 기다립니다 (1~2분). 처음이면 `Run workflow` 로 수동 실행해도 됩니다.
4. 주소: `https://7fsikminq.github.io/Game/baseball/` (게임 목록: `https://7fsikminq.github.io/Game/`)

막힐 때:
- Settings → Pages 메뉴가 없거나 "Upgrade" 가 보이면 비공개 저장소라서입니다. 저장소를 공개로 바꾸거나 Cloudflare Pages를 쓰세요.
- 배포 단계에서 `Branch ... is not allowed to deploy to github-pages` 가 나오면 main이 아닌 브랜치에서 돌린 것입니다. main에서 실행하세요.
- 공개 저장소가 되면 **코드가 누구에게나 보입니다.** (세이브 데이터는 기기 안에만 있어서 공개되지 않습니다.)

## 2. Cloudflare Pages (비공개 저장소도 가능)

**폴더 끌어다 놓기 (가장 간단)**

1. `npm run site` 로 `_site` 폴더를 만듭니다.
2. https://dash.cloudflare.com → **Workers & Pages → Create → Pages → Upload assets**
3. 프로젝트 이름 입력 → `_site` 폴더를 끌어다 놓고 **Deploy**.
4. `https://<프로젝트이름>.pages.dev/baseball/` 로 접속.

**GitHub 연결 (자동 배포)**

Create → Pages → Connect to Git → 저장소 선택 → Framework preset `None`, Build command `node tools/build-site.mjs`, Build output directory `_site` → Save and Deploy. (Cloudflare 빌드 환경에 Node가 있어서 그대로 동작합니다.)

## 3. Netlify Drop

1. `npm run site`
2. https://app.netlify.com/drop 에 `_site` 폴더를 끌어다 놓기.
3. 나온 주소 뒤에 `/baseball/` 를 붙여 접속. 임시 사이트는 계정에 연결(Claim)하지 않으면 사라질 수 있으니 로그인해서 연결하세요.

---

## 아이폰에서 설치

배포 주소를 **Safari로** 열고 [IPHONE-SETUP.md 3-3절](IPHONE-SETUP.md)과 같이 **공유 → 홈 화면에 추가 → 웹 앱으로 열기 → 추가**.

그다음 **한 번 온라인에서 앱을 열어둡니다.** 이때 서비스 워커가 파일을 저장하고, 이후에는 비행기 모드에서도 열립니다.

## 업데이트

- 코드를 고쳐서 푸시(또는 `_site` 재업로드)하면 새 버전이 올라갑니다.
- 서비스 워커는 **네트워크 우선**입니다. 온라인이면 앱을 열 때마다 최신 파일을 받고, 오프라인일 때만 저장된 파일을 씁니다. 그래서 보통 앱을 **완전히 닫았다가 다시 열면** 새 버전이 반영됩니다.
- 파일을 새로 추가했거나 구조를 바꿨다면 `baseball/sw.js` 의 `CACHE` 이름 숫자를 올리고(`baseball-v1` → `baseball-v2`), `FILES` 목록에 새 파일을 추가하세요. 오프라인 캐시가 새 목록으로 교체됩니다.
- 아이콘이나 이름을 바꿨다면 iOS는 홈 화면 아이콘을 갱신하지 않습니다. 앱을 삭제하고 다시 추가해야 합니다(**백업 먼저**).

## 데이터는 안전한가

- 세이브는 **주소(도메인)별로** 아이폰 안에 저장됩니다. 주소가 바뀌면 새 게임이 됩니다. (`xxx.pages.dev` → 다른 주소 이동 시 백업/복원 사용)
- 홈 화면에 추가한 웹앱은 Safari 탭보다 데이터가 오래 유지됩니다. 그래도 iOS가 저장 공간 부족 등으로 지울 수 있으니 가끔 **구단 탭 → 백업**을 하세요.
- 앱을 삭제하면 데이터도 같이 삭제됩니다.
