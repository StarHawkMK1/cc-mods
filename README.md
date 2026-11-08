# cc-mods

Claude Code [mods](https://code.claude.com/docs/en/plugins/mods/overview)를 모아 두는 저장소입니다. 이 저장소 자체가 Claude Code 플러그인 마켓플레이스(`cc-mods`)라서, mod를 한 줄로 설치하고 자동 업데이트로 받을 수 있습니다.

- 요구 버전: Claude Code **2.1.287 이상**, `filetree`는 **2.1.306 이상** (테스트: `token-weather`·`filetree` 2.1.318, `work-band` 2.1.299~2.1.301, Windows 11 / Git Bash; `work-band`의 `claude plugin test`는 2.1.318·2.1.319 Linux에서도 통과)
- mod는 샌드박스 없이 **사용자 권한으로** 실행됩니다. 설치 전에 아래 [보안](#보안)을 읽어 주세요.

## mod 목록

| mod | 하는 일 | 출처 |
| --- | --- | --- |
| [`filetree`](https://github.com/data-goblin/claude-code-filetree) | IDE처럼 파일 트리를 옆 창(pane)에 띄웁니다. git 상태, 바뀐 줄 수, Claude가 읽고 쓰는 파일의 반짝임, 검색, 미리보기, diff. `/filetree`로 열고 닫습니다. | 외부 참조 (data-goblin, MIT) |
| [`token-weather`](mods/token-weather/) | 프롬프트 위에 컨텍스트 윈도우 사용량을 날씨 아이콘과 그래프로 보여 줍니다. | Anthropic 샘플 |
| [`work-band`](mods/work-band/) | 프롬프트 위 한 줄 진행 막대: superpowers 흐름 단계, 다른 스킬, Claude의 할 일 진행, 마지막 테스트 결과(빨강/초록), 요청 경과 시간, 실행 중인 서브에이전트 수. 누르면 에이전트 패널(모델, 컨텍스트, 예상 비용, 시간). resume 때 흐름을 되살립니다. 토큰을 더 쓰지 않습니다. | 직접 작성 (savvy-progress 일부 차용, MIT) |

"Anthropic 샘플"은 [anthropics/claude-code-playground](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods)에서 복사한 mod입니다. 여러 mod의 밴드가 함께 보이도록 일부 고쳤습니다. upstream이 밝힌 대로 있는 그대로 공유된 샘플이며 공식 제품이 아니고 지원도 없습니다. 자세한 출처와 고친 내용은 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있습니다.

"외부 참조"는 파일을 이 저장소에 복사하지 않고, 원래 저장소의 릴리스 태그와 커밋을 [`marketplace.json`](.claude-plugin/marketplace.json)에 고정해 받는 mod입니다. 설치하면 그 커밋의 코드가 원래 저장소에서 그대로 내려옵니다. 업데이트 방법은 [외부 mod 업데이트](#외부-mod-업데이트)에 있습니다.

- `filetree`는 기본값으로 세션을 시작할 때 창이 열리고, Claude가 다른 저장소에서 몇 분 동안 계속 작업하면 세션을 그쪽으로 `/cd`합니다("Follow work"). 원하지 않으면 `/config`의 filetree 항목에서 **Open at start**, **Follow work**를 `off`로 바꿉니다.

## 설치

### Claude Code 세션 안에서

```text
/plugin install work-band --marketplace StarHawkMK1/cc-mods
```

1. 마켓플레이스를 추가할지 물으면 `y`를 누릅니다.
2. scope는 **Install for you (user scope)**를 고릅니다.
3. 다른 mod는 `/plugin install <mod>@cc-mods`로 설치합니다.

### 셸에서

```bash
claude plugin marketplace add StarHawkMK1/cc-mods
claude plugin install work-band@cc-mods --scope user
claude plugin install token-weather@cc-mods --scope user
claude plugin install filetree@cc-mods --scope user
```

첫 줄은 마켓플레이스를 한 번만 등록하고, 그다음 줄들이 원하는 mod를 설치합니다. 이미 열려 있는 세션에서는 `/reload-plugins`를 실행해야 반영됩니다.

### 자동 업데이트 켜기 (한 번만)

비공식 마켓플레이스는 자동 업데이트가 기본으로 꺼져 있습니다. 켜지 않으면 이 저장소의 변경을 받지 못합니다.

`/plugin` → **Marketplaces** → `cc-mods` → **Enable auto-update**

## 사용

| 하고 싶은 것 | 방법 |
| --- | --- |
| mod 켜고 끄기 | `/plugin` → **Installed** 탭에서 Space, 또는 `claude plugin disable <mod>@cc-mods` / `enable` |
| 지금 바로 업데이트 | `claude plugin update <mod>@cc-mods` 후 세션에서 `/reload-plugins` |
| 로드 확인 | `/plugin`을 열면 흐린 줄에 `N mods active`가 표시됩니다 |
| 전부 제거 | `claude plugin marketplace remove cc-mods` (이 마켓플레이스에서 설치한 mod가 모두 제거됨) |

## mod 개발

설치하지 않고 이 저장소의 폴더에서 바로 불러와 개발합니다.

```bash
git clone https://github.com/StarHawkMK1/cc-mods.git
cd cc-mods
claude --plugin-dir ./mods/work-band
```

- 그 세션에서만 로드되고, 파일을 저장하면 자동으로 다시 로드됩니다.
- 같은 이름의 mod가 설치되어 있으면 그 세션에서는 폴더 버전이 대신 실행됩니다(`/plugin`에 `<mod>@inline`으로 표시).
- 여러 개는 `--plugin-dir`을 반복합니다. 명령줄 옵션을 줄 수 없는 곳(Desktop 앱 등)에서는 `CLAUDE_CODE_PLUGIN_DIRS` 환경변수를 씁니다.
- 디버깅: `claude --debug-file ./mod-debug.log --plugin-dir ./mods/<mod>`
- Git Bash에서 `claude -p "/<명령>"`처럼 `/`로 시작하는 인자를 넘기면 Git Bash가 그 인자를 Windows 경로(`C:/.../<명령>`)로 바꿉니다. `claude -p "//<명령>" --plugin-dir ./mods/<mod>`처럼 `/`를 두 번 씁니다.

### 새 mod 추가 규칙

1. `mods/<name>/`에 만듭니다. 최소 구성은 `.claude-plugin/plugin.json`, `hooks/hooks.json`(`"modules": ["./<file>.mjs"]`), 훅 모듈 파일입니다.
2. `name`은 `claude-`로 시작할 수 없습니다.
3. `.claude-plugin/marketplace.json`의 `plugins`에 `{ "name": "<name>", "source": "./mods/<name>", "description": "..." }`를 추가합니다. 엔트리에는 `version`을 쓰지 않습니다.
4. `claude plugin validate ./mods/<name>`(mod 매니페스트와 훅 정적 분석)와 `claude plugin validate .`(마켓플레이스)가 모두 통과해야 합니다.
5. 표(이 README의 mod 목록, [`mods/README.md`](mods/README.md))에 한 줄씩 추가합니다.

### 외부 mod 추가 규칙

다른 저장소의 mod는 복사하지 않고 릴리스에 고정해 참조합니다. 그 저장소가 `vX.Y.Z` 태그로 릴리스하고, 저장소 루트가 플러그인(`.claude-plugin/plugin.json`)이어야 합니다.

1. `marketplace.json`의 `plugins`에 추가합니다. `sha`는 그 태그가 가리키는 40자 커밋입니다(`git ls-remote --tags https://github.com/<owner>/<repo>.git`에서 `^{}`가 붙은 줄).

   ```json
   { "name": "<name>", "source": { "source": "github", "repo": "<owner>/<repo>", "ref": "vX.Y.Z", "sha": "<40자 sha>" }, "description": "..." }
   ```

2. 그 태그를 임시 폴더에 받아 `claude plugin validate <폴더>`로 `hooks:`/`calls:`를 확인합니다([보안](#보안)).
3. `claude plugin validate .`가 통과해야 합니다.
4. 표(이 README의 mod 목록, [`mods/README.md`](mods/README.md))와 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)의 외부 참조 표에 한 줄씩 추가합니다.

### 외부 mod 업데이트

```bash
node scripts/update-external.mjs
```

- upstream의 가장 높은 `vX.Y.Z` 태그를 찾아 `marketplace.json`과 `THIRD_PARTY_NOTICES.md`의 `ref`·`sha`를 바꾸고, `claude plugin validate .`까지 실행합니다. 이미 최신이면 아무것도 바꾸지 않습니다.
- 바뀐 mod마다 `review:` 비교 링크를 출력합니다. 커밋하기 전에 그 링크에서 바뀐 코드를 읽습니다. 특히 새 `$.process.run`, `$.fs.write`, `$.http.fetch`, `tool.call` 훅이 생겼는지 봅니다.
- 하나만: `node scripts/update-external.mjs filetree`. 확인만: `--check`(새 릴리스가 있으면 종료 코드 1).
- 확인했으면 두 파일을 커밋·푸시합니다. 자동 업데이트를 켠 PC는 자동 업데이트로 받습니다. upstream이 릴리스마다 `version`을 올리므로 따로 버전을 올릴 필요가 없습니다.
- 스크립트 테스트: `node --test scripts/update-external.test.mjs`

### 버전 규칙

Claude Code는 mod의 `.claude-plugin/plugin.json`에 있는 `version`이 바뀌어야 업데이트로 인식합니다. **mod 파일을 바꾸면 그 mod의 `version`을 반드시 올리세요.** 올리지 않으면 이미 설치한 PC는 새 코드를 받지 못합니다. 외부 참조 mod는 upstream이 올립니다.

## 보안

mod는 Claude Code 프로세스 안에서 사용자 권한으로 실행됩니다. 파일 읽기·쓰기, 프로세스 실행, 네트워크 요청, 도구 호출 승인이 모두 가능합니다. 설치 전에 정적 분석 결과를 확인하세요.

```bash
claude plugin validate ./mods/<mod>
```

출력의 `hooks:`(어떤 이벤트에 개입하는지)와 `calls:`(어떤 API를 쓰는지) 줄을 읽습니다. 특히 `$.process.run`, `$.fs.write`, `$.http.fetch`, `tool.call` 훅을 눈여겨봅니다.

## 라이선스

[Apache-2.0](LICENSE). 복사하거나 참조한 mod의 출처와 라이선스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 보세요.
