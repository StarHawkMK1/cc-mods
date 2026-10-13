# cc-mods 통합 저장소 설계 (시범: 공식 예시 mod 적용)

- 작성일: 2026-10-13
- 상태: 사용자 검토 대기
- 기준 환경: Claude Code 2.1.296, Windows 11, Git Bash에서 `ccd`(= `claude --dangerously-skip-permissions`)로 실행

## 1. 목적

커스텀 Claude Code mod를 모아 두고 여러 PC와 팀원에게 배포하는 **통합 저장소**를 만든다. 저장소 자체가 플러그인 마켓플레이스가 된다.

이번 시범은 커스텀 mod를 만들기 전 단계다. 공식 예시 mod 3개를 이 저장소의 정식 배포 경로로 적용해 본다. 목표는 두 가지다.

1. mod가 Claude Code에 어떻게 설치되고, 로드되고, 켜지고 꺼지는지 직접 확인한다.
2. 실제로 써 보면서 커스텀 mod 브레인스토밍의 재료를 얻는다.

예시 중 `replay-theater`는 계속 쓸 수도 있다.

## 2. 확정된 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 사용 범위 | 본인이 여러 PC에서 사용. 팀이나 타인과의 공유를 전제로 설계 | 사용자 지정 |
| 외부 mod 도입 방식 | **복사(vendoring)**: `mods/<name>/`에 파일을 복사 | 커스텀 mod와 같은 배포 경로를 시범에서 검증하고, 버전 라벨을 이 저장소가 통제한다(§5) |
| 시범 완료 범위 | GitHub **public** 저장소 `StarHawkMK1/cc-mods` 배포 + 이 PC 설치·동작 확인 | 사용자 지정 |
| 마켓플레이스 이름 | `cc-mods` (설치 ID 예: `replay-theater@cc-mods`) | 나중에 바꾸면 기존 설치가 끊기므로 지금 고정한다 |
| 저장소 라이선스 | Apache-2.0 | upstream과 같은 라이선스 하나로 통일한다 |
| 시범 설치 방식 | Claude Code 기본 기능: 3개 모두 user scope로 설치하고 `/plugin` Installed 탭에서 Space로 켜고 끈다 | 만들 것이 없다. 선택 설치 UI는 이후 과제(§10) |

## 3. 범위 밖 (이번에 하지 않음)

- upstream 동기화 스크립트. 예시는 as-is 공개라 거의 바뀌지 않는다. 출처 커밋만 기록한다.
- CI (GitHub Actions의 `claude plugin validate`)
- 저장소용 `.claude/settings.json` (project scope 자동 활성화)
- 설치 도우미 스킬, 설치 관리자 mod (§10에 후보로 기록)
- 업데이트 전달 테스트 (version 올리기 → 다른 PC 반영). 첫 커스텀 mod를 배포할 때 검증한다.
- 공식 예시 코드 수정

## 4. 저장소 구조

```
cc-mods/                              ← git 저장소 = 마켓플레이스 루트
├─ .claude-plugin/
│  └─ marketplace.json
├─ mods/
│  ├─ blast-radius/                   # upstream 복사본 (수정 없음)
│  ├─ replay-theater/                 #   .claude-plugin/plugin.json, hooks/hooks.json,
│  └─ token-weather/                  #   hooks/<name>.mjs, README.md, screenshots/, .gitignore
├─ THIRD_PARTY_NOTICES.md             # 출처 표 (§6)
├─ licenses/
│  └─ Apache-2.0.txt                  # upstream LICENSE 원문 사본
├─ LICENSE                            # 이 저장소의 라이선스 (Apache-2.0)
├─ README.md
├─ .gitignore                         # graft/, **/.claude-plugin/types/
└─ docs/
   ├─ CLAUDE_MODS_HANDOFF.md          # 기존 문서 유지
   ├─ superpowers/specs/              # 설계 문서
   └─ pilot/2026-10-13-official-examples.md   # 시범 결과 기록 (§9 E)
```

### 4.1 marketplace.json

```json
{
  "name": "cc-mods",
  "owner": { "name": "StarHawkMK1" },
  "description": "Custom Claude Code mods, plus vendored examples from anthropics/claude-code-playground.",
  "plugins": [
    {
      "name": "blast-radius",
      "source": "./mods/blast-radius",
      "description": "Holds risky shell commands and shows what they would change, with Proceed and Cancel buttons."
    },
    {
      "name": "replay-theater",
      "source": "./mods/replay-theater",
      "description": "Step through the file edits Claude made in the last turn, one diff at a time."
    },
    {
      "name": "token-weather",
      "source": "./mods/token-weather",
      "description": "A live forecast of the context window, drawn above the prompt."
    }
  ]
}
```

- 엔트리에 `version`을 쓰지 않는다. 버전은 각 mod의 `plugin.json`이 유일한 기준이다.
- description은 upstream marketplace.json 문구를 그대로 쓴다.

### 4.2 mod 추가 규칙 (README에 기록)

- 새 mod는 `mods/<name>/`에 둔다. 구조는 공식 예시와 같다.
- `name`은 `claude-`로 시작할 수 없다. Anthropic 플러그인처럼 보이는 이름은 validate가 거부한다.
- `marketplace.json`의 `plugins`에 엔트리를 추가한다.
- 추가하거나 수정한 뒤 `claude plugin validate .`를 통과해야 한다.

## 5. 버전 규칙

Claude Code는 업데이트 여부를 **버전 라벨 비교**로 판단한다. 라벨은 mod의 `plugin.json` `version`이 최우선이다(공식 문서 Plugin loading reference, "How Claude Code computes the version"). 라벨이 같으면 코드가 바뀌어도 설치된 PC는 갱신하지 않는다.

- 복사한 공식 예시는 수정하지 않았으므로 upstream 그대로 `0.1.0`을 유지한다.
- **규칙: mod 파일을 바꾸면 그 mod의 `plugin.json` `version`을 반드시 올린다.** upstream을 다시 들여올 때도 같다.
- upstream 예시를 수정하면 version을 올리고, THIRD_PARTY_NOTICES의 "수정 여부"를 갱신한다.

## 6. 라이선스와 출처 고지

- upstream: `https://github.com/anthropics/claude-code-playground`, 경로 `claude-code/mods/<name>`, 커밋 `569c5283d9a0a7ee7938df85bb32e4f48cbb8c86` (2026-10-01), Apache-2.0
- `licenses/Apache-2.0.txt`에 upstream LICENSE 원문을 둔다.
- `THIRD_PARTY_NOTICES.md`에 mod별로 다음을 표로 기록한다: upstream 경로, 커밋, 라이선스, 수정 여부(현재 "수정 없음"). upstream 문구 "Shared as-is. Not an official Anthropic product"도 함께 적는다.
- 각 mod 폴더 안의 upstream README는 그대로 둔다.

## 7. 채널: 배포와 개발

| 채널 | 용도 | 방법 |
|---|---|---|
| 배포 | 평소 쓰는 mod (이 PC, 다른 PC, 팀원 공통) | GitHub `StarHawkMK1/cc-mods`를 마켓플레이스로 등록하고 설치 |
| 개발 | mod를 만들거나 고칠 때 | `ccd --plugin-dir ./mods/<name>` (저장 시 핫 리로드, 세션 한정, 같은 이름의 설치본을 그 세션에서 대체, `@inline`으로 표시) |

- 이 PC도 GitHub 소스로 등록한다. 마켓플레이스 이름 하나에 등록은 하나뿐이라 로컬 폴더와 GitHub를 동시에 `cc-mods`로 등록할 수 없다. GitHub로 등록해야 다른 PC와 같은 경로를 검증할 수 있다.
- 명령줄 옵션을 줄 수 없는 환경(Desktop 앱 등)에서는 `CLAUDE_CODE_PLUGIN_DIRS` 환경변수를 쓴다.

## 8. 설치 절차 (README에 기록)

1. 설치
   - 세션 안: `/plugin install <mod> --marketplace StarHawkMK1/cc-mods` → `y`로 마켓플레이스 추가 → scope는 user
   - 셸: `claude plugin marketplace add StarHawkMK1/cc-mods` 다음에 `claude plugin install <mod>@cc-mods --scope user`
2. 자동 업데이트 켜기: `/plugin` → Marketplaces → `cc-mods` → **Enable auto-update**. 비공식 마켓플레이스는 기본값이 꺼짐이다.
3. 열려 있던 세션에서는 `/reload-plugins`를 실행한다.
4. 켜고 끄기: `/plugin` → Installed 탭에서 Space, 또는 `claude plugin disable|enable <mod>@cc-mods`
5. 즉시 업데이트: `claude plugin update <mod>@cc-mods`
6. 보안 안내: mod는 샌드박스 없이 사용자 권한으로 실행된다. 설치 전에 `claude plugin validate <mod 폴더>`의 `hooks:`/`calls:` 줄을 확인할 것을 권한다.

## 9. 진행 순서

### A. 로컬 구성 (push 전)
1. `git init`, `.gitignore` 작성
2. upstream `569c528`에서 mod 3개를 `mods/` 아래로 수정 없이 복사 (screenshots 포함)
3. `marketplace.json`, `THIRD_PARTY_NOTICES.md`, `licenses/Apache-2.0.txt`, `LICENSE`, `README.md` 작성
4. 검증
   - `claude plugin validate .` 통과 (마켓플레이스 + mod 3개)
   - `claude -p "/replay" --plugin-dir ./mods/replay-theater` 등으로 모듈 로드 오류가 없는지 확인
5. 첫 commit

### B. GitHub 공개 배포
6. `StarHawkMK1/cc-mods`를 public으로 만들고 push. **외부 공개 작업이므로 실행 직전에 사용자에게 다시 확인한다.**

### C. 이 PC에 적용
7. `claude plugin marketplace add StarHawkMK1/cc-mods`, mod 3개를 `--scope user`로 설치
8. 자동 업데이트 켜기 (사용자가 UI에서 조작)

### D. 동작 확인 (새 `ccd` 세션, 사용자가 수행하고 결과 공유)

| # | 확인 항목 | 통과 기준 |
|---|---|---|
| 9a | `claude plugin list` | 3개 모두 `0.1.0`, enabled |
| 9b | `/plugin` | 흐린 줄에 `3 mods active` |
| 9c | token-weather | 한 턴 후 프롬프트 위에 날씨 아이콘과 % 표시 |
| 9d | replay-theater | 파일 편집 턴 후 `/replay` → Pane에서 Prev/Next로 diff 이동 |
| 9e | blast-radius (Bash 도구) | 임시 git 폴더에서 `rm -rf build` 요청 → 보류 + Pane. Cancel이면 유지, Proceed면 삭제 |
| 9f | blast-radius (PowerShell 도구) | 같은 요청을 PowerShell 도구로 → 보류되지 않는 것이 예상 결과(Bash만 감시). 사실 확인용 |
| 10 | Installed 탭 | Space로 하나 끄기 → `/reload-plugins` → 기능 사라짐 → 다시 켜면 돌아옴 |

### E. 기록
11. 결과와 발견 사항, 커스텀 mod 후보(§10)를 `docs/pilot/2026-10-13-official-examples.md`에 기록하고 commit, push

### 완료 기준
- A~E를 모두 수행한다.
- 9a~9d와 10이 통과 기준을 충족한다.
- 9e와 9f는 결과가 무엇이든 기록하면 통과다. 목적은 예시를 고치는 것이 아니라 동작 방식을 확인하는 것이다.

## 10. 알려진 위험과 이후 과제

### 위험 (시범에서 확인할 것)
- **blast-radius의 Windows 동작**: 내부에서 `$.process.run`으로 `sleep`과 `bash -c`를 셸 없이 실행한다. 이 PC의 Windows PATH에는 `sleep`이 없고, `bash`는 `C:\windows\system32\bash.exe`(WSL)로 잡힌다. 이 실행이 실패하면 코드상 위험 명령을 거부하는 쪽으로 처리된다. Git Bash에서 `ccd`로 띄우면 Git Bash의 PATH를 물려받아 정상 동작할 가능성이 있다. 9e에서 확인한다.
- **blast-radius의 감시 범위**: `tool.call{tool=Bash}`만 감시한다. 이 PC는 `CLAUDE_CODE_USE_POWERSHELL_TOOL`이 켜져 있어서 PowerShell 도구로 실행하는 명령은 감시하지 않는다. 9f에서 확인한다.
- validate는 설치 시점 오류를 모두 잡지 못한다. 실제 설치(C)가 최종 확인이다.

### 이후 과제 (커스텀 mod 후보)
- 설치 도우미 스킬 (`cc-mods-setup` 플러그인): 체크박스 질문으로 설치할 mod를 고르고 `claude plugin install`을 대신 실행한다.
- 설치 관리자 mod: Pane에 mod 목록과 설치/해제 버튼을 둔다.
- 시범 결과에서 나오는 후보 (§9 E에 기록)

## 11. 참고: upstream 정적 검증 결과 (2026-10-13, Claude Code 2.1.296)

| mod | hooks | calls |
|---|---|---|
| blast-radius | `tool.call{tool=Bash}`, `ui.render{Pane}`, `ui.render{AbovePrompt}` | `$.clock.now`, `$.process.run`, `$.session.cwd`, `$.ui.close/invalidate/open/resolve/toast` |
| replay-theater | `session.start`, `command.run{replay}`, `tool.call`, `turn.start`, `turn.complete`, `ui.render{AbovePrompt,Pane}`, `ui.close` | `$.clock.sleep`, `$.command.register`, `$.fs.exists/read`, `$.session.cwd`, `$.ui.close/invalidate/open/resolve` |
| token-weather | `session.start`, `turn.complete`, `ui.render{AbovePrompt}` | `$.session.usage`, `$.ui.invalidate/resolve` |

세 mod와 upstream marketplace 모두 `✔ Validation passed`. blast-radius와 replay-theater는 "gating hook without .catch" 경고가 있으며, upstream 설계 그대로 둔다.
