# savvy-progress 자동 진행 막대 설계

- 작성일: 2026-10-15
- 상태: 폐기 (2026-10-15). `2026-10-15-work-band-design.md`로 대체
- 대상: `mods/savvy-progress/` (johnnyvizz/claude-kit `c871c153`에서 vendoring한 1.2.1)
- 기준 환경: Claude Code 2.1.299~2.1.300, Windows 11, Git Bash

## 1. 목적

지금 savvy-progress의 프롬프트 위 진행 막대는 `/savvy-flow:savvy-flow`를 실행해야만 나타난다. 이 막대를 슬래시 커맨드 없이, 평소 작업에서도 자동으로 보이게 한다.

조건은 두 가지다.

- **추가 토큰 0.** 새 도구를 등록하지 않고, 프롬프트나 컨텍스트에 아무것도 붙이지 않는다. 이미 일어나는 도구 호출과 서브에이전트 실행을 훅으로 엿보기만 한다.
- **진행률을 알 수 있을 때만 표시.** 간단한 질문이나 한두 번 수정하는 요청에는 막대를 띄우지 않는다.

## 2. 확정된 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 자동 막대의 출처 | Claude의 할 일 목록 + 서브에이전트 | 사용자 선택(2번안). "항상 표시"는 Claude Code 자체 스피너와 겹치고 진행률이 없다 |
| 구조 | savvy-progress를 직접 확장 (A안) | 이름(`mcp__savvy-progress__*`)을 유지해 savvy-flow 연동이 그대로 동작하고, 막대·패널이 하나로 유지된다 |
| savvy-flow 자동 적용 | 하지 않음 | 모든 요청이 멀티 에이전트가 되어 토큰과 동작이 크게 바뀐다 |
| 패널 자동 열기 | 기존 동작 그대로 | 사용자 확인: 패널이 열리는 것은 괜찮다 |
| 버전 | 1.2.1 → 1.3.0 | 동작이 추가되는 변경. 저장소 버전 규칙 |

## 3. 범위 밖

- 패널에 할 일 목록 표시 (막대만 다룬다)
- 서브에이전트가 만드는 자체 할 일 목록
- upstream(johnnyvizz/claude-kit) 동기화나 PR
- savvy-flow 스킬 수정

## 4. 막대가 보여 주는 것

막대는 아래 세 출처 중 **우선순위가 가장 높은, 표시할 것이 있는 하나**를 그린다. 그리기는 기존 `rowSvg`(데스크톱)와 터미널 행을 그대로 쓴다. 세 출처 모두 같은 모양의 "보기"(제목, 전체, 완료, 실행 중, 끝남 여부, 라벨 단어)로 바꿔서 넘긴다.

| 우선순위 | 출처 | 언제 있나 | 제목 | 라벨 | 진행률 |
|---|---|---|---|---|---|
| 1 | savvy-flow 보고 (기존 `flow`) | `flow`가 null이 아님 | flow 제목 | 기존 그대로 (`Plan`, `Tasks 2/5`, `Done`) | 기존 그대로 |
| 2 | 할 일 목록 | 메인 세션의 목록에 항목이 1개 이상 | 진행 중 항목의 `activeForm`, 없으면 첫 미완료 항목의 내용, 다 끝났으면 마지막 항목의 내용 | `Tasks 완료/전체`, 다 끝나면 `Done` | 완료/전체 |
| 3 | 서브에이전트 | 이번 요청의 서브에이전트가 1개 이상 | `Subagents` | `Agents 완료/전체`, 다 끝나면 `Done` | 완료(성공+실패)/전체 |

- 진행 중 항목은 막대의 흐린 두 번째 층(기존 `running`)으로 그린다.
- 크랩은 실행 중인 서브에이전트가 있거나 진행 중인 할 일이 있으면 걷는다.
- 막대 옆 `×N` 버튼(패널 열기)과 ✕ 버튼은 그대로 둔다.
- 새 문자열(`Subagents`, `Agents`)은 en/ru/he 세 언어로 추가한다.

## 5. 데이터 수집

모두 `e.agentId`가 없는 호출, 즉 메인 세션의 호출만 본다. 훅은 항상 `next(e)`를 먼저 호출해 도구를 그대로 실행시키고, 결과를 바꾸지 않는다.

**할 일 목록: 두 가지 도구 방식**

| 도구 | 읽는 것 | 처리 |
|---|---|---|
| `TodoWrite` | 입력의 `todos[]` (`content`, `status`, `activeForm`) | 목록 전체를 교체. id는 순번으로 만든다 |
| `TaskCreate` | 입력의 `subject`, `activeForm`, 결과의 `task.id` | `pending` 항목 추가. 결과가 오류면 무시 |
| `TaskUpdate` | 입력의 `taskId`, `status`, `subject`, `activeForm` | 해당 id 항목을 갱신. `deleted`면 제거. 모르는 id는 무시 |

새 데이터가 들어오면 ✕로 숨긴 상태를 푼다. 목록은 최대 200개, 제목은 기존 `MAX_TITLE`(120자)로 자른다.

**서브에이전트**

기존 `agents` 목록(이미 `agent.spawn`/`turn.complete`로 수집 중)을 그대로 쓴다. "이번 요청의 서브에이전트"는 아래 둘 중 하나에 해당하는 실행이다.

- 마지막 요청 시작 시각(`since`) 이후에 시작한 실행
- 아직 실행 중인 실행

새 서브에이전트가 시작되면 ✕로 숨긴 상태를 푼다.

## 6. 언제 뜨고 사라지나

- **뜨기:** 할 일 목록이 처음 생기거나 서브에이전트가 처음 시작될 때.
- **끝남:** 전부 끝나면 초록색 `Done`으로 남는다.
- **새 요청 시작:** `prompt.submit`에서 판단한다. 슬래시 커맨드(`e.command`)와 실행 중인 턴에 끼어든 프롬프트(`e.turnId`)는 제외한다.
  - 할 일 목록이 모두 완료 상태면 목록을 비운다. 미완료 항목이 있으면 그대로 둔다.
  - `since`를 지금으로 바꾼다. 실행 중인 서브에이전트는 계속 포함된다.
- **✕ 누르기:** 자동 막대는 숨김 플래그만 켜고, 새 데이터가 들어오면 다시 보인다. savvy-flow 막대는 기존처럼 `flow`를 지운다.
- **savvy-flow 막대:** 기존 동작 그대로. savvy-flow가 끝을 보고하거나 ✕를 누를 때까지 유지되고, 그동안 자동 막대는 가려진다.

## 7. 상태와 설정

새 atom 하나를 추가한다(`types/index.d.ts`의 `PluginState`에도 선언).

```ts
type AutoTodo = { id: string; title: string; activeForm?: string; status: 'pending' | 'in_progress' | 'completed' }
type AutoBar = {
  todos: AutoTodo[]
  since: number      // 마지막 새 요청의 시각 ($.clock.now())
  isHidden: boolean  // ✕로 숨김
}
```

새 설정 `autoBar`를 `plugin.json`의 `userConfig`에 추가한다.

- `on` (기본): 위 동작.
- `off`: 자동 막대를 끄고 1.2.1과 같이 동작한다.

## 8. 테스트

`claude plugin test ./mods/savvy-progress`로 실행한다. 기존 24개 테스트는 그대로 통과해야 한다. 새 테스트 파일 `hooks/auto.test.ts`는 아래를 확인한다. 막대 테스트는 터미널과 데스크톱 양쪽에서 한다.

1. 메인 세션의 `TodoWrite`(3개 중 1개 완료, 1개 진행 중)는 진행 중 항목의 `activeForm` 제목과 `Tasks 1/3`을 그린다.
2. 서브에이전트(`agentId` 있음)의 `TodoWrite`는 막대를 만들지 않는다.
3. `TaskCreate` 3번과 `TaskUpdate`(completed) 1번은 `Tasks 1/3`을 그린다. `deleted`면 전체가 줄어든다.
4. 할 일 목록 없이 서브에이전트 2개가 시작되고 1개가 끝나면 `Agents 1/2`를 그린다.
5. savvy-flow가 보고 중이면 할 일 목록이 있어도 flow 막대를 그린다.
6. 새 요청(`prompt.submit`)이 오면 완료된 목록은 비우고, 미완료 목록은 유지한다.
7. ✕를 누르면 숨겨지고, 새 `TodoWrite`가 오면 다시 보인다.
8. `autoBar: off`면 할 일 목록이 있어도 막대가 없다.

마지막으로 실제 세션(`--plugin-dir`)에서 여러 단계 작업을 시켜 막대가 뜨고 갱신되는지 확인한다.

## 9. 저장소 반영

- `mods/savvy-progress/.claude-plugin/plugin.json`: `version` 1.3.0, `userConfig.autoBar` 추가
- `THIRD_PARTY_NOTICES.md`: savvy-progress 행의 "수정 여부"를 "자동 진행 막대 추가 (할 일 목록·서브에이전트), 1.3.0"으로 변경
- `mods/README.md`: 추가된 동작과 `autoBar` 설정을 설명 (upstream README는 수정하지 않는다)
- `README.md`: mod 목록의 savvy-progress 설명 갱신
- `claude plugin validate ./mods/savvy-progress`와 `claude plugin validate .` 통과
