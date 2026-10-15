# work-band 설계

- 작성일: 2026-10-15
- 상태: 사용자 검토 대기
- 대체: `2026-10-15-savvy-progress-auto-bar-design.md` (savvy-progress 확장안, 폐기)
- 기준 환경: Claude Code 2.1.299~2.1.300, Windows 11, Git Bash

## 1. 목적

프롬프트 입력창 위에 한 줄짜리 진행 막대를 띄워, 지금 하는 작업의 **단계와 진행 상황**, 그리고 **동작 중인 에이전트 수**를 보여 주는 mod를 만든다.

사용자는 두 가지 방식으로 일한다.

- **superpowers 흐름:** brainstorming → spec → plan → SDD 또는 TDD로 구현 → 리뷰 → 마무리
- **하네스만 사용:** superpowers 없이 Claude Code에 바로 요청

두 방식 모두에서 막대가 자동으로 뜨고, 슬래시 커맨드는 필요 없다.

## 2. 확정된 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 추가 토큰 | 0 | 사용자 조건. 도구 등록·프롬프트 수정 없이 이미 일어나는 이벤트만 읽는다 |
| savvy-flow | 쓰지 않음 | 사용자 결정 |
| 코드 | 새 mod `work-band`. savvy-progress(johnnyvizz/claude-kit, MIT)의 그리기 코드를 차용 | savvy 전용 코드가 원본의 절반 이상이라, 덜어 내는 것보다 새로 쓰고 필요한 부분만 가져오는 편이 작고 명확하다 |
| 형태 | 한 줄. 단계나 `Tasks m/n`을 막대 안 알약에 넣는다 | 사용자 선택 (savvy 막대 구조 차용) |
| superpowers 막대 채움 | 전체 흐름 기준, 6칸 눈금 | 사용자 선택 |
| 제목 | 주제 우선, 없으면 현재 할 일 | 사용자 선택 |
| 에이전트 | ×N = 실행 중 수, 누르면 상세 패널 | 사용자 선택 |
| 언어 | 영어, 한국어 | 사용자가 한국어 사용. 러시아어·히브리어(RTL)는 차용하지 않는다 |

## 3. 범위 밖

- savvy-flow 연동, savvy 도구(`progress`, `step`), 등급·의상, Planned 섹션
- TDD 빨강/초록 표시, 요청 경과 시간 (나중 후보)
- 세션을 다시 열었을 때(`--resume`) 이전 흐름 복원
- superpowers 외 다른 워크플로 스킬의 단계 인식

## 4. 막대 한 줄

```
● 제목   [점묘 막대 ··· 알약 ··· │ ··· │ ···]   NN%   🦀×N   ✕
```

| 요소 | 내용 |
|---|---|
| ● | 진행 중이면 보라(`#8f8cf4`), 끝나면 초록(`#5fbf8f`) |
| 제목 | §5, §6 |
| 막대 | 점묘 채움(savvy `rowSvg` 차용). 진행 중인 몫은 흐린 두 번째 층. superpowers 모드는 단계 경계에 눈금 |
| 알약 | 채움의 머리에 붙는 라벨. `Spec`, `Build 3/7`, `Tasks 3/5`, `Agents 1/2`, `Done` |
| NN% | 막대 채움 비율 |
| 🦀 | 크랩 그림(savvy 차용, 의상 없는 기본형). 실행 중인 에이전트가 있으면 걷는다 |
| ×N | 실행 중인 서브에이전트 수. 0이면 숨긴다(그때는 `/work-band`로 패널을 연다). 누르면 패널을 열고 닫는다 |
| ✕ | §7 |

- 데스크톱은 SVG 한 장과 버튼 두 개, 터미널은 텍스트 행(`●`, `█░` 막대, 알약 글자, `NN%`)으로 그린다. savvy와 같은 방식이다.
- 보여 줄 데이터가 없으면 막대를 그리지 않고 다른 mod의 막대에 자리를 넘긴다(`next(e)`).
- 다른 mod가 같은 자리에 그린 막대는 savvy처럼 이 막대 아래에 이어 그린다.

## 5. superpowers 모드

### 5.1 단계 인식

메인 세션의 신호만 쓴다. 서브에이전트가 부르는 스킬은 무시한다(예: SDD 구현 워커가 TDD를 불러도 단계는 그대로).

| 신호 | 잡는 곳 |
|---|---|
| 모델이 부른 스킬 | `tool.call` `{ tool: 'Skill' }`에서 `e.agentId`가 없을 때의 `e.skill`, `e.args` |
| 사용자가 슬래시로 부른 스킬 | `command.run`의 `e.command`, `e.args`. 2.1.299 이후 빌드는 `prompt.submit`의 `e.command`로도 알려 주며, 두 번 와도 결과는 같다 |
| 파일 쓰기 | `tool.call` `{ tool: 'Write' }`, `Edit`, `NotebookEdit`에서 `e.agentId`가 없을 때의 `e.file_path`, (`Write`면) `e.content` |
| 턴 끝 | `turn.complete`에서 `e.agentId`가 없을 때 |

스킬 이름은 `superpowers:<이름>`일 때만 인정한다. 비교할 때 앞의 `superpowers:`를 떼고 아래 이름과 맞춘다.

| 단계 | 들어가는 조건 |
|---|---|
| Brainstorm | `brainstorming` |
| Spec | Brainstorm 단계에서 `docs/superpowers/specs/` 아래 `.md` 파일이 써짐 |
| Plan | `writing-plans` |
| Build | `subagent-driven-development`, `executing-plans`, `test-driven-development`. 또는 Brainstorm·Spec 단계에서 `docs/superpowers/`와 `.superpowers/`(brainstorming의 visual companion 작업 폴더) 밖의 파일을 처음 쓰거나 고칠 때(spec·plan 없이 바로 구현하는 경로) |
| Review | `requesting-code-review` |
| Finish | `finishing-a-development-branch` |

- 흐름이 없을 때 위 스킬 중 하나가 불리면 그 단계에서 새 흐름을 시작한다. 앞 단계는 건너뛴 것으로 친다.
- `brainstorming`이 불리면 어느 단계에서든 이전 흐름을 버리고 Brainstorm에서 새로 시작한다.
- 그 밖의 신호로는 단계가 앞으로만 간다. 지금보다 앞 단계의 신호는 무시하고, 같은 단계의 신호(Build 중 다시 불린 `test-driven-development` 등)는 단계를 바꾸지 않는다.
- 그 밖의 스킬(`systematic-debugging` 등)은 단계를 바꾸지 않는다.
- finishing 스킬은 보통 병합/PR/유지를 묻고 턴을 끝낸다. 그래서 Finish 단계에서는 사용자가 답한 뒤(그 답이 새 요청), 그 답을 처리한 메인 턴이 정상 응답으로 끝나야 흐름이 끝남(`Done`)이 된다. 오류나 중단으로 끝난 턴은 흐름을 끝내지 않는다.

### 5.2 막대 채움

6칸(Brainstorm, Spec, Plan, Build, Review, Finish)으로 나눈다.

- 비율 = (현재 단계 순번 + 단계 안 진행) / 6. 순번은 Brainstorm이 0이고, 건너뛴 단계도 지난 것으로 친다.
- 단계 안 진행은 Build에서만 쓴다: 완료 작업 수 / 전체 작업 수. 나머지 단계에서는 0이다.
- 끝남이면 비율 1.
- 눈금은 단계 경계 5곳에 그린다.

Build의 작업 수:

- **전체:** 계획 파일의 `### Task ` 제목 줄 수. 계획 파일은 이 흐름에서 `docs/superpowers/plans/` 아래 써진 마지막 `.md`의 `content`에서 센다. 이 흐름에서 써지지 않았으면 Build 스킬의 인자에 `.md` 경로가 있을 때 `$.fs.read`로 읽어서 센다. 둘 다 없으면 메인 할 일 목록의 항목 수를 쓴다.
- **완료:** 메인 할 일 목록의 완료 항목 수. 전체를 넘지 않게 자른다.

### 5.3 알약과 제목

- **알약:** 단계 이름. Build에서 전체 작업 수를 알면 `Build 3/7`. 끝남이면 `Done`.
- **제목:** 아래 순서로 처음 있는 것.
  1. 이 흐름에서 써진 계획 파일의 첫 `# ` 줄. 끝의 ` Implementation Plan`은 뗀다.
  2. 이 흐름에서 써진 spec 파일의 첫 `# ` 줄. 끝의 ` 설계`, ` Design`은 뗀다.
  3. `brainstorming`의 인자 첫 줄
  4. 메인 할 일 목록의 진행 중 항목(`activeForm`)
  5. `superpowers`
- 데스크톱의 대체 텍스트(마우스를 올리면 보이는 글)에는 제목, 알약, 현재 할 일을 함께 넣는다.

## 6. 하네스 모드

진행 중인 superpowers 흐름이 없을 때 쓴다. 우선순위 순으로 하나를 보여 준다.

1. **메인 할 일 목록**이 있으면: 제목은 진행 중 항목의 `activeForm`(없으면 첫 미완료 항목, 다 끝났으면 마지막 항목), 알약 `Tasks 완료/전체`, 다 끝나면 `Done`.
2. **이번 요청의 서브에이전트**가 있으면: 제목 `Subagents`, 알약 `Agents 끝남/전체`, 다 끝나면 `Done`. 끝남에는 실패도 포함한다.
3. 둘 다 없으면 막대를 그리지 않는다.

할 일 목록 수집(메인 세션만, 다른 훅이 거부했거나 오류난 호출은 무시):

| 도구 | 처리 |
|---|---|
| `TodoWrite` | 입력 `todos[]`로 목록 전체 교체. 빈 `content`는 버리고, 모르는 `status`는 `pending` |
| `TaskCreate` | 결과의 `task.id`와 입력의 `subject`, `activeForm`으로 `pending` 항목 추가 |
| `TaskUpdate` | 아는 id만 갱신. `deleted`면 제거 |

목록은 최대 200개, 글자는 120자로 자른다. 할 일 목록은 superpowers 모드의 Build 진행에도 같이 쓰인다.

"이번 요청의 서브에이전트"는 실행 중이거나, 마지막 새 요청 이후에 시작한 실행이다.

## 7. 언제 사라지나

**새 요청**은 실행 중인 턴이 없을 때 사용자가 보낸 프롬프트다(`prompt.submit`에서 `e.turnId`가 없고, `e.origin.kind`가 `composer`·`bridge`·`sdk`). 끝난 백그라운드 작업 알림이나 다른 세션의 메시지는 새 요청이 아니다. 슬래시 커맨드는 새 요청으로 치지 않지만, superpowers 스킬을 부르는 슬래시 커맨드는 §5.1의 신호로 쓴다.

| 상황 | superpowers 흐름 | 하네스 막대 |
|---|---|---|
| 새 요청 | 끝남이면 지운다. 진행 중이면 유지 | 다 끝난 할 일 목록은 지운다. 서브에이전트 기준 시각을 지금으로 바꾼다 |
| ✕ | 흐름을 지운다 | 숨긴다. 새 할 일이나 새 서브에이전트가 생기면 다시 보인다 |

## 8. 패널

×N을 누르거나 `/work-band`를 입력하면 패널을 열고 닫는다. 자동으로 열리지 않는다.

savvy의 에이전트 패널을 차용한다.

- **상단 합계:** 예상 비용, 토큰, 시간
- **실행 중 섹션, 완료 섹션(접기 가능):** 행마다 크랩, 설명, 에이전트 종류, 모델·effort, 진행 막대, `ctx NN% · 토큰`, 예상 비용, 경과 시간, 상태 표시(실행 중 ●, 완료 ✓, 실패 ✗)
- **진행 막대:** 그 서브에이전트가 자기 할 일 목록을 쓰면 완료/전체를 색으로 표시하고, 아니면 컨텍스트 사용률을 회색으로 표시한다. 서브에이전트의 할 일 목록은 `agentId`별로 따로 모은다(§6과 같은 규칙).
- **압축 보기 전환:** savvy와 같다.
- 데이터는 savvy와 같은 훅에서 모은다: `agent.spawn`, `turn.step`, `turn.complete`. 가격표와 컨텍스트 크기 계산도 차용한다.

## 9. 설정

| 키 | 값 | 기본 |
|---|---|---|
| `language` | `auto`, `en`, `ko` | `auto`: Claude Code `language` 설정, 그다음 시스템 로캘, 없으면 영어 |

## 10. 테스트

`claude plugin test ./mods/work-band`. 막대 테스트는 터미널과 데스크톱 양쪽에서 한다.

1. 하네스: 메인 `TodoWrite` → 진행 중 항목 제목과 `Tasks 1/3`. 서브에이전트의 `TodoWrite`는 막대를 만들지 않는다.
2. 하네스: `TaskCreate`·`TaskUpdate`(완료, 삭제), 모르는 id는 무시.
3. 하네스: 서브에이전트만 있을 때 `Agents 1/2`, 다 끝나면 `Done`.
4. superpowers: `brainstorming` → spec 파일 쓰기 → `writing-plans` → plan 파일 쓰기(작업 7개) → `subagent-driven-development` → 할 일 3개 완료 순으로 알약 `Brainstorm`, `Spec`, `Plan`, `Build 3/7`과 비율, 제목(plan 제목)을 확인.
5. superpowers: Brainstorm 단계에서 `docs/superpowers/` 밖의 파일을 쓰면 Build. 서브에이전트의 스킬 호출은 단계를 바꾸지 않는다. 앞 단계 신호는 무시.
6. superpowers: 사용자의 슬래시 `/superpowers:brainstorming`이 흐름을 시작한다.
7. superpowers: Finish 단계에서 메인 턴이 끝나면 `Done`, 다음 새 요청에서 사라진다.
8. 새 요청 규칙: 끝난 하네스 목록은 지우고 진행 중 목록은 유지. 실행 중인 턴에 끼어든 프롬프트는 지우지 않는다.
9. ✕: 흐름은 지우고, 하네스 막대는 새 데이터가 올 때까지 숨긴다.
10. ×N: 실행 중 수만 세고, 0이면 버튼이 없다. 누르면 패널이 열린다.
11. 패널: 실행 중·완료 행, 서브에이전트 할 일 목록 진행, 비용 계산(savvy 비용 테스트 차용).
12. 이상한 입력: 빈 항목, 모르는 상태, 200개 초과, 긴 제목, 거부된 도구 호출.

마지막으로 실제 세션(`--plugin-dir`)에서 superpowers 흐름 한 번과 하네스 작업 한 번을 확인한다.

## 11. 저장소 반영

- 새 폴더 `mods/work-band/`: `.claude-plugin/plugin.json`(version 0.1.0), `hooks/hooks.json`, `hooks/work-band.tsx`, `hooks/*.test.ts`, `types/index.d.ts`, `.gitignore`, `README.md`(한국어)
- 아직 커밋하지 않은 `mods/savvy-progress/`, `mods/savvy-flow/` vendoring은 지운다. 마켓플레이스, README, `mods/README.md`에서 두 항목을 빼고 `work-band`를 넣는다.
- `licenses/MIT-johnnyvizz-claude-kit.txt`는 남긴다. `THIRD_PARTY_NOTICES.md`의 johnnyvizz/claude-kit 섹션은 "work-band의 그리기·패널·비용 계산 코드 일부를 `plugins/savvy-progress/hooks/register.tsx`(커밋 `c871c153`)에서 차용해 수정"으로 바꾼다.
- 폐기한 savvy-progress 확장 spec과 계획의 상태 줄에 폐기를 표시한다.
- `claude plugin validate ./mods/work-band`와 `claude plugin validate .` 통과.
