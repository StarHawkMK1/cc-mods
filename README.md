# cc-mods

Claude Code [mods](https://code.claude.com/docs/en/plugins/mods/overview)를 모아 두는 저장소입니다. 이 저장소 자체가 Claude Code 플러그인 마켓플레이스(`cc-mods`)라서, mod를 한 줄로 설치하고 자동 업데이트로 받을 수 있습니다.

- 요구 버전: Claude Code **2.1.287 이상** (테스트: 2.1.296, Windows 11 / Git Bash)
- mod는 샌드박스 없이 **사용자 권한으로** 실행됩니다. 설치 전에 아래 [보안](#보안)을 읽어 주세요.

## mod 목록

| mod | 하는 일 | 출처 |
| --- | --- | --- |
| [`blast-radius`](mods/blast-radius/) | `rm -rf`, `git reset --hard`, 강제 푸시 같은 위험한 셸 명령을 보류하고, 무엇이 바뀌는지 보여 준 뒤 진행/취소 버튼을 띄웁니다. Bash 도구 호출만 감시합니다. | Anthropic 샘플 |
| [`replay-theater`](mods/replay-theater/) | `/replay`: 마지막 턴에 Claude가 한 파일 편집을 diff 단위로 다시 봅니다. | Anthropic 샘플 |
| [`token-weather`](mods/token-weather/) | 프롬프트 위에 컨텍스트 윈도우 사용량을 날씨 아이콘과 그래프로 보여 줍니다. | Anthropic 샘플 |
| [`work-band`](mods/work-band/) | 프롬프트 위 한 줄 진행 막대: superpowers 흐름 단계나 Claude의 할 일 진행, 실행 중인 서브에이전트 수. 누르면 에이전트 패널(모델, 컨텍스트, 예상 비용, 시간). 토큰을 더 쓰지 않습니다. | 직접 작성 (savvy-progress 일부 차용, MIT) |

"Anthropic 샘플"은 [anthropics/claude-code-playground](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods)에서 수정 없이 복사한 mod입니다. upstream이 밝힌 대로 있는 그대로 공유된 샘플이며 공식 제품이 아니고 지원도 없습니다. 자세한 출처는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있습니다.

## 설치

### Claude Code 세션 안에서

```text
/plugin install replay-theater --marketplace StarHawkMK1/cc-mods
```

1. 마켓플레이스를 추가할지 물으면 `y`를 누릅니다.
2. scope는 **Install for you (user scope)**를 고릅니다.
3. 다른 mod는 `/plugin install <mod>@cc-mods`로 설치합니다.

### 셸에서

```bash
claude plugin marketplace add StarHawkMK1/cc-mods
claude plugin install replay-theater@cc-mods --scope user
claude plugin install blast-radius@cc-mods --scope user
claude plugin install token-weather@cc-mods --scope user
claude plugin install work-band@cc-mods --scope user
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
claude --plugin-dir ./mods/replay-theater
```

- 그 세션에서만 로드되고, 파일을 저장하면 자동으로 다시 로드됩니다.
- 같은 이름의 mod가 설치되어 있으면 그 세션에서는 폴더 버전이 대신 실행됩니다(`/plugin`에 `<mod>@inline`으로 표시).
- 여러 개는 `--plugin-dir`을 반복합니다. 명령줄 옵션을 줄 수 없는 곳(Desktop 앱 등)에서는 `CLAUDE_CODE_PLUGIN_DIRS` 환경변수를 씁니다.
- 디버깅: `claude --debug-file ./mod-debug.log --plugin-dir ./mods/<mod>`
- Git Bash에서 `claude -p "/replay"`처럼 `/`로 시작하는 인자를 넘기면 Git Bash가 그 인자를 Windows 경로(`C:/.../replay`)로 바꿉니다. `claude -p "//replay" --plugin-dir ./mods/replay-theater`처럼 `/`를 두 번 씁니다.

### 새 mod 추가 규칙

1. `mods/<name>/`에 만듭니다. 최소 구성은 `.claude-plugin/plugin.json`, `hooks/hooks.json`(`"modules": ["./<file>.mjs"]`), 훅 모듈 파일입니다.
2. `name`은 `claude-`로 시작할 수 없습니다.
3. `.claude-plugin/marketplace.json`의 `plugins`에 `{ "name": "<name>", "source": "./mods/<name>", "description": "..." }`를 추가합니다. 엔트리에는 `version`을 쓰지 않습니다.
4. `claude plugin validate ./mods/<name>`(mod 매니페스트와 훅 정적 분석)와 `claude plugin validate .`(마켓플레이스)가 모두 통과해야 합니다.
5. 표(이 README의 mod 목록, [`mods/README.md`](mods/README.md))에 한 줄씩 추가합니다.

### 버전 규칙

Claude Code는 mod의 `.claude-plugin/plugin.json`에 있는 `version`이 바뀌어야 업데이트로 인식합니다. **mod 파일을 바꾸면 그 mod의 `version`을 반드시 올리세요.** 올리지 않으면 이미 설치한 PC는 새 코드를 받지 못합니다.

## 보안

mod는 Claude Code 프로세스 안에서 사용자 권한으로 실행됩니다. 파일 읽기·쓰기, 프로세스 실행, 네트워크 요청, 도구 호출 승인이 모두 가능합니다. 설치 전에 정적 분석 결과를 확인하세요.

```bash
claude plugin validate ./mods/<mod>
```

출력의 `hooks:`(어떤 이벤트에 개입하는지)와 `calls:`(어떤 API를 쓰는지) 줄을 읽습니다. 특히 `$.process.run`, `$.fs.write`, `$.http.fetch`, `tool.call` 훅을 눈여겨봅니다.

## 라이선스

[Apache-2.0](LICENSE). 복사한 mod의 출처와 라이선스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 보세요.
