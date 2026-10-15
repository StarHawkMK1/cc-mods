# work-band

프롬프트 입력창 위에 한 줄짜리 진행 막대를 띄웁니다. 지금 작업의 단계와 진행 상황, 그리고 실행 중인 서브에이전트 수를 보여 줍니다. 이미 일어나는 스킬 호출, 할 일 목록, 파일 쓰기, 서브에이전트 이벤트를 읽기만 하므로 토큰을 더 쓰지 않습니다.

```text
● Auth login   ▓▓▓▓▓▓▓▓▓▓[ Build 3/7 ]░░│░░░│░░   57%   🦀 ×2   ✕
```

## 무엇을 보여 주나

- **superpowers 흐름**: `brainstorming` → spec 문서 → `writing-plans` → 구현(`subagent-driven-development`, `executing-plans`, `test-driven-development`) → `requesting-code-review` → `finishing-a-development-branch`를 6칸 눈금으로 보여 줍니다. 구현 칸은 계획의 작업 수 중 끝난 수만큼 채워집니다. 제목은 plan, spec 문서 제목, brainstorming 주제 순입니다.
- **하네스만 쓸 때**: Claude의 할 일 목록(`Tasks 3/5`), 목록이 없으면 이번 요청의 서브에이전트(`Agents 1/2`)를 보여 줍니다. 간단한 요청에는 막대가 뜨지 않습니다.
- **×N**: 실행 중인 서브에이전트 수입니다. 누르거나 `/work-band`를 입력하면 에이전트 패널(모델·effort, 컨텍스트, 예상 비용, 시간, 서브에이전트의 할 일 진행)을 열고 닫습니다.
- **✕**: superpowers 흐름은 끝내고, 하네스 막대는 새 데이터가 올 때까지 숨깁니다. 끝난 막대는 다음 요청을 보낼 때 사라집니다.

비용은 토큰 수와 내장 가격표로 계산한 추정치입니다.

## 설정

`language`: `auto`(기본, Claude Code `language` 설정 → 시스템 로캘), `en`, `ko`. `/config`에서 바꾸거나, 폴더에서 바로 불러온 mod라면 `~/.claude/settings.json`에 씁니다.

```json
{ "pluginConfigs": { "work-band": { "options": { "language": "ko" } } } }
```

## 출처

막대·크랩·패널 그리기와 비용 계산 코드 일부는 [johnnyvizz/claude-kit](https://github.com/johnnyvizz/claude-kit)의 savvy-progress(MIT)에서 차용해 고쳤습니다. 자세한 내용은 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)를 보세요.
