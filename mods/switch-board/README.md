# switch-board

데스크톱 앱 오른쪽 패널에서 이 저장소(cc-mods)의 mod를 켜고 끕니다. mod마다 이름과 **켜짐/꺼짐** 버튼이 한 줄씩 나옵니다.

## 설치

```text
/plugin install switch-board --marketplace StarHawkMK1/cc-mods
```

이미 `cc-mods` 마켓플레이스를 추가했다면 `claude plugin install switch-board@cc-mods --scope user`로도 됩니다. `claude plugin test`는 Claude Code 2.1.319(Linux)에서 통과합니다. 실제 데스크톱 앱에서는 아직 확인하지 않았습니다.

## 어떻게 켜고 끄나

| mod | 방법 | 적용 |
| --- | --- | --- |
| `/config`에 **Enabled**(`<mod>.enabled`)가 있는 mod: `work-band`, `token-weather` | 그 설정을 `on`/`off`로 바꿉니다(`/config`에서 바꾼 것과 같음) | 바로 (그 mod가 새 설정으로 다시 로드됨) |
| 그 밖의 `cc-mods` mod: `filetree` | `claude plugin enable/disable <mod>@cc-mods`를 실행합니다 | 다음 세션부터, 또는 `/reload-plugins` 후. 그때까지 줄에 "다음 세션부터"가 붙습니다 |

- 목록은 `/config`의 `.enabled` 항목과 `claude plugin list --json`에서 읽습니다. 앞으로 추가하는 mod도 `enabled` 설정(`on`/`off`)만 두면 바로 켜고 끄는 줄로 나옵니다.
- `switch-board` 자신은 목록에 없습니다(끄면 되돌릴 패널이 사라지므로). 끄려면 `/plugin`을 씁니다.
- 조직 정책 등으로 잠긴 설정은 버튼 없이 상태만 보여 줍니다.
- `claude` 명령을 실행할 수 없는 환경이면 Enabled 설정이 있는 mod만 나오고, 패널 아래에 그 사실을 적습니다.
- 바꾸지 못하면(설정 거부, CLI 실패) 토스트로 이유를 알립니다.

## 화면

데스크톱 앱(과 다른 앱 화면)에서만 그립니다. 터미널에서는 패널을 열지 않고, `/switch-board`를 입력하면 데스크톱 앱에서 열라고 알려 줍니다. 세션을 시작할 때나 데스크톱 앱이 붙을 때 패널이 열리고, `/switch-board`로 열고 닫습니다.

## 설정

`language`: `auto`(기본, Claude Code `language` 설정 → 시스템 로캘), `en`, `ko`.
