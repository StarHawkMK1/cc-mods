# work-band

프롬프트 입력창 위에 한 줄짜리 진행 막대를 띄웁니다. 지금 작업의 단계와 진행 상황, 그리고 실행 중인 서브에이전트 수를 보여 줍니다. 이미 일어나는 스킬 호출, 할 일 목록, 파일 쓰기, 서브에이전트 이벤트를 읽기만 하므로 토큰을 더 쓰지 않습니다.

```text
● Auth login   ▓▓▓▓▓▓▓▓▓▓[ Build 3/7 ]░░│░░░│░░   57%   ✓ tests   2:13   🦀 ×2   ✕
```

## 설치

```text
/plugin install work-band --marketplace StarHawkMK1/cc-mods
```

이미 `cc-mods` 마켓플레이스를 추가했다면 `claude plugin install work-band@cc-mods --scope user`로도 됩니다. 테스트한 버전은 Claude Code 2.1.299~2.1.301(Windows 11)이고, `claude plugin test`는 2.1.318·2.1.319(Linux)에서 통과합니다.

## 무엇을 보여 주나

- **superpowers 흐름**: `brainstorming` → spec 문서 → `writing-plans` → 구현(`subagent-driven-development`, `executing-plans`, `test-driven-development`) → `requesting-code-review` → `finishing-a-development-branch`를 6칸 눈금으로 보여 줍니다. 구현 칸은 계획의 작업 수 중 끝난 수만큼 채워집니다. 제목은 plan, spec 문서 제목, brainstorming 주제 순입니다.
- **하네스만 쓸 때**: Claude의 할 일 목록(`Tasks 3/5`), 목록이 없으면 이번 요청의 서브에이전트(`Agents 1/2`)를 보여 줍니다. 간단한 요청에는 막대가 뜨지 않습니다.
- **다른 스킬**: superpowers가 아닌 스킬(예: `impeccable`, `taste-skill:…`, `docs-system:wrapup`)을 모델이 부르거나 슬래시로 입력하면 막대 제목에 스킬 이름이 뜹니다. 진행은 할 일 목록, 없으면 이번 요청의 서브에이전트, 둘 다 없으면 `Running` → `Done`입니다. 설정 `skills`로 띄울 스킬을 고릅니다.
- **테스트 칩**: 가장 최근 테스트 실행(메인과 서브에이전트)이 실패면 빨강 `✗ tests`, 통과면 초록 `✓ tests`입니다. `npm test`, `pytest`, `go test`, `cargo test`, `claude plugin test` 같은 명령을 알아보고, `| tail`처럼 종료 코드가 테스트의 것이 아니면 출력의 요약 줄로 판정합니다. superpowers 흐름 안에서는 요청이 바뀌어도 남습니다.
- **경과 시간**: 이번 요청이 시작된 뒤의 시간(`2:13`)입니다. 메인 턴이 끝나면 멈추고, 다음 요청에서 다시 잽니다. 슬래시로 부른 스킬도 새 요청입니다.
- **resume**: `claude --resume`·`--continue`, `/resume`, `/branch`로 세션을 다시 열면 대화 기록을 다시 읽어 superpowers 흐름과 끝나지 않은 할 일 목록을 되살립니다.
- **×N**: 실행 중인 서브에이전트 수입니다. 누르거나 `/work-band`를 입력하면 에이전트 패널(모델·effort, 컨텍스트, 예상 비용, 시간, 서브에이전트의 할 일 진행)을 열고 닫습니다.
- **✕**: superpowers 흐름은 끝내고, 하네스 막대는 새 데이터가 올 때까지 숨깁니다. 끝난 막대는 다음 요청을 보낼 때 사라집니다.

비용은 토큰 수와 내장 가격표로 계산한 추정치입니다.

## 설정

`language`: `auto`(기본, Claude Code `language` 설정 → 시스템 로캘), `en`, `ko`. `/config`에서 바꾸거나, 폴더에서 바로 불러온 mod라면 `~/.claude/settings.json`에 씁니다.

`terminal`(Show in terminal): `off`(기본)면 막대와 에이전트 패널을 데스크톱 앱(과 다른 앱 화면)에서만 그리고 터미널에서는 그리지 않습니다. `on`이면 터미널에도 그립니다. 꺼진 터미널에서 `/work-band`를 입력하면 켜는 방법을 알려 줍니다. 기록은 터미널에서도 계속 쌓이므로, 데스크톱 앱에서 이어 보면 그대로 나옵니다.

`skills`: superpowers 외에 띄울 스킬을 쉼표로 적습니다. 이름 전체(`impeccable`)나 플러그인 접두어(`taste-skill:`)를 쓰고, 비우면(기본) 모두 띄웁니다.

`testCommands`: 테스트 실행으로 볼 명령 접두어를 쉼표로 더합니다(예: `just test, ./run-tests.sh`).

```json
{ "pluginConfigs": { "work-band": { "options": { "language": "ko", "skills": "taste-skill:, impeccable, docs-system:", "testCommands": "just test", "terminal": "on" } } } }
```

## 알려진 한계

- resume은 최근 4096개 메시지까지만 읽고, compact된 대화는 남은 기록만으로 되살립니다. 흐름이 중간 단계에서 시작한 것처럼 보일 수 있습니다.
- 이전 세션에서 ✕로 지운 흐름은 resume 때 다시 나타납니다.
- resume 때 경과 시간, 다른 스킬, 서브에이전트 패널은 되살리지 않습니다.
- 서브에이전트 여럿이 동시에 테스트를 돌리면 칩이 번갈아 바뀔 수 있습니다.
- 테스트 명령은 명령 문자열로 알아봅니다. 못 알아보는 명령은 `testCommands`에 더하세요.
- `skill.prompt` 훅이 돌지 않는 곳에서는 슬래시로 입력한 스킬이 흐름을 움직이지도, 새 요청을 시작하지도 않습니다. `/superpowers:*`도 마찬가지입니다. 조직이 관리 설정(managed settings)으로 Claude Code를 관리하는 환경(사용자가 설치한 플러그인의 이 훅은 돌지 않습니다)이나 이 훅이 없는 Claude Code 빌드가 그렇습니다. 모델이 부른 스킬은 이런 곳에서도 반영됩니다.

## 출처

막대·크랩·패널 그리기와 비용 계산 코드 일부는 [johnnyvizz/claude-kit](https://github.com/johnnyvizz/claude-kit)의 savvy-progress(MIT)에서 차용해 고쳤습니다. 자세한 내용은 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)를 보세요.
