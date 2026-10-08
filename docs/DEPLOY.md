# 배포 방법 (인터넷에 올려서 아이폰만으로 쓰기)

## 현재 배포 상태와 방식 (요약)
- **방식**: GitHub Pages + GitHub Actions 자동 배포. 서버 코드가 없는 정적 파일이라 무료입니다.
- **주소**: 목록 `https://7fsikminq.github.io/Game/` · 야구 `/baseball/` · 축구 `/soccer/` (계정명 소문자, `Game` 대문자 G)
- **자동 흐름**: 코드를 `claude/serene-franklin-tpdu4g` 브랜치(이 저장소의 기본 브랜치)에 푸시 → Actions가 `npm test`(215개) 실행 → 통과하면 `tools/build-site.mjs`로 `_site`를 만들어 Pages에 배포(보통 1~3분). 테스트가 하나라도 실패하면 **배포되지 않습니다**(이전 버전이 그대로 유지).
- **설정은 이미 끝남**: Settings → Pages → Source = GitHub Actions. 최신 실행(근사 명단 포함)이 성공했습니다.

### 새 버전을 올리는 순서
1. 파일을 고치고 `npm test` 로 로컬 확인.
2. 커밋 → `git push origin claude/serene-franklin-tpdu4g`.
3. 저장소 **Actions** 탭 → `Deploy to GitHub Pages` 맨 위 실행이 **초록 ✅** 가 될 때까지 대기(`test` → `deploy` 두 단계).
4. 아이폰에서 앱을 완전히 종료했다가 다시 열기(온라인) → 새 버전 반영.

### 배포가 제대로 됐는지 확인하는 방법 (위에서부터 순서대로)
1. **Actions 탭**: `Deploy to GitHub Pages` 맨 위 실행이 초록 ✅ 이고 **커밋 메시지가 방금 올린 것과 같은지** 봅니다. 눌러서 `test`, `deploy` 두 작업이 모두 초록인지, `deploy`의 `Run actions/deploy-pages` 단계가 초록인지 확인합니다. 노란 ●는 진행 중, 빨간 ❌는 실패(로그의 `✖` 줄 확인)입니다.
2. **Settings → Pages**: 맨 위 "Your site is live at …" 문구와 주소가 보이면 켜져 있는 것입니다. 오른쪽 **Visit site** 로 열어볼 수 있습니다.
3. **주소로 직접 열기**: 아이폰 Safari 또는 PC 브라우저에서 `https://7fsikminq.github.io/Game/baseball/` 을 엽니다. 404면 주소 대소문자·끝 슬래시·Actions 성공 여부부터 확인합니다.
4. **새 버전인지 확인**(캐시 때문에 예전 화면이 보일 수 있음): 앱/탭을 완전히 닫았다 다시 열거나, 브라우저에서 새로고침합니다.
   - 야구: 시작 화면에 **"실제 기반 명단 사용"** 카드가 있으면 근사 명단 버전입니다. 선수단 탭의 선수 이름이 한글/영문 실제 이름과 한 글자 다르게 보이면 정상입니다.
   - 아이콘 앱이 계속 예전 화면이면: 앱 전환 화면에서 위로 밀어 종료 → 온라인에서 다시 열기. 그래도 안 되면 앱을 지우고 다시 추가(**백업 먼저**).
5. **오프라인 확인**: 한 번 온라인으로 연 뒤 비행기 모드에서 아이콘으로 열려야 합니다.
6. **저장소 쪽 확인**: Code 탭 왼쪽 위 브랜치가 `claude/serene-franklin-tpdu4g` 이고, 파일 목록 위의 최신 커밋이 방금 올린 커밋이면 올바른 코드가 올라간 것입니다(배포는 이 브랜치 기준).

### 실패했을 때 / 되돌리기
- ❌ `test` 단계 실패: 실행을 눌러 로그의 `✖` 줄 확인 → 고쳐서 다시 푸시.
- ❌ `deploy` 단계에서 `Get Pages site failed`: Settings → Pages 에서 Source 를 GitHub Actions 로 → **Re-run all jobs**.
- 이전 버전으로 되돌리기: Actions 에서 예전 성공 실행을 열어 **Re-run all jobs**(그 시점의 코드로 다시 배포). 또는 문제 커밋을 `git revert` 해서 푸시.
- 수동 실행: Actions → `Deploy to GitHub Pages` → **Run workflow** → 브랜치 선택.

---

(아래는 같은 정적 파일을 다른 곳에 올리는 방법과 상세 설명입니다.)

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

저장소에 `.github/workflows/pages.yml` 이 들어 있습니다. 하는 일: 푸시되면 ① 테스트 실행 ② 통과하면 배포. **`main`과 `claude/serene-franklin-tpdu4g` 둘 다에서** 돕니다(이 저장소의 기본 브랜치가 후자라서입니다. 이전에는 `main`에서만 돌도록 되어 있어 실행 기록이 0건이었습니다 — GitHub API로 확인).

1. 이 저장소는 **공개(public)** 라서 Pages가 무료입니다. 비공개로 바꾸면 유료 플랜이 필요합니다.
2. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꿉니다.
3. **Actions** 탭에서 `Deploy to GitHub Pages` 를 **Run workflow**(브랜치 선택) 하거나 푸시합니다. 1~2분 뒤 초록색이 되면 완료.
4. 주소: `https://7fsikminq.github.io/Game/` (게임: `/soccer/`, `/baseball/`)

막힐 때:
- `Get Pages site failed` → 2번을 한 뒤 **Re-run all jobs**.
- `Branch ... is not allowed to deploy to github-pages` → 환경 보호 규칙은 기본 브랜치만 허용합니다. 기본 브랜치에서 실행하거나 Settings → Environments → github-pages 에서 브랜치를 허용하세요.
- 공개 저장소이므로 **코드는 누구에게나 보입니다.** 세이브/데이터 팩은 기기 안에만 있어 공개되지 않습니다. 실제 선수 이름을 쓰려면 저장소에 넣지 말고 [실제 데이터 가져오기](soccer/REAL-DATA.md)로 폰에서만 쓰세요.

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

배포 주소를 **Safari로** 열고 [IPHONE-SETUP.md B-2](IPHONE-SETUP.md)와 같이 **공유 → 홈 화면에 추가 → 웹 앱으로 열기 → 추가**.

그다음 **한 번 온라인에서 앱을 열어둡니다.** 이때 서비스 워커가 파일을 저장하고, 이후에는 비행기 모드에서도 열립니다.

## 업데이트

- 코드를 고쳐서 푸시(또는 `_site` 재업로드)하면 새 버전이 올라갑니다.
- 서비스 워커는 **네트워크 우선**입니다. 온라인이면 앱을 열 때마다 최신 파일을 받고, 오프라인일 때만 저장된 파일을 씁니다. 그래서 보통 앱을 **완전히 닫았다가 다시 열면** 새 버전이 반영됩니다.
- 파일을 새로 추가했거나 구조를 바꿨다면(예: `baseball/src/roster-data.js`) 해당 게임의 `sw.js` 의 `CACHE` 이름 숫자를 올리고(현재 야구는 `baseball-v2`, 축구는 `soccer-v1`), `FILES` 목록에 새 파일을 추가하세요. 오프라인 캐시가 새 목록으로 교체됩니다.
- 아이콘이나 이름을 바꿨다면 iOS는 홈 화면 아이콘을 갱신하지 않습니다. 앱을 삭제하고 다시 추가해야 합니다(**백업 먼저**).

## 데이터는 안전한가

- 세이브는 **주소(도메인)별로** 아이폰 안에 저장됩니다. 주소가 바뀌면 새 게임이 됩니다. (`xxx.pages.dev` → 다른 주소 이동 시 백업/복원 사용)
- 홈 화면에 추가한 웹앱은 Safari 탭보다 데이터가 오래 유지됩니다. 그래도 iOS가 저장 공간 부족 등으로 지울 수 있으니 가끔 **구단 탭 → 백업**을 하세요.
- 앱을 삭제하면 데이터도 같이 삭제됩니다.
