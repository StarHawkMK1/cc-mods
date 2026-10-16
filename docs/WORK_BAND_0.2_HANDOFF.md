# work-band 0.2 — 핸드오프 문서

- 작성일: 2026-10-16
- 상태: 구현과 병합 완료(`main`, 9e293a1까지), 실제 세션 점검 전
- 기준 문서: spec `docs/superpowers/specs/2026-10-16-work-band-0.2-design.md`, plan `docs/superpowers/plans/2026-10-16-work-band-0.2.md`

## 0. 지금 상태

0.2.0의 네 기능(다른 스킬 막대, 테스트 칩, 요청 경과 시간, resume 복원)을 구현해 `main`에 병합했습니다.

| 커밋 | 내용 |
|---|---|
| 5fd2867 | 상태 규칙을 `hooks/events.ts`로 옮김(동작 동일) |
| ab17637 | 요청 경과 시간, 슬래시 스킬을 `skill.prompt`로 확정 |
| d73c77e | 테스트 칩(빨강/초록) |
| 018ae5c | 다른 스킬 막대, 설정 `skills` |
| 490e538 | resume 때 대화 기록을 다시 읽어 흐름 복원 |
| c929211 | README, 버전 0.2.0, 마켓플레이스 설명 |
| 9e293a1 | 브랜치 전체 리뷰 반영(짧은 슬래시 이름, 줄바꿈·`&` 분리, 같은 디스패치의 쓰기 뒤 읽기, 오류 삼키기) |

- `claude plugin test ./mods/work-band`: 151 pass, 0 fail
- `claude plugin validate ./mods/work-band`, `claude plugin validate .`: 통과
- plan의 Task 0(실제 세션으로 spec §12 가정 확인)은 건너뛰었습니다. 그래서 아래 1절의 점검이 유일한 실전 확인입니다.
- 0.2.0은 실제 세션 점검 전에 push되었습니다. 다른 PC는 다음 업데이트 때 0.2.0을 받습니다.

## 1. 다음 할 일: 실제 세션 점검 (사람이 직접)

```
claude --plugin-dir ./mods/work-band
```

| # | 할 일 | 기대 결과 | 다르면 볼 곳 |
|---|---|---|---|
| 1 | `/superpowers:brainstorming 테스트 흐름` | 막대에 `Brainstorm`, 0부터 가는 시간. 답이 끝나면 시간이 멈춘다 | 흐름이 안 뜨면 가정 (d): `work-band.tsx`의 `skill.prompt` 훅(253행), `events.ts`의 `confirmSlash`(118행) |
| 2 | 실패하는 테스트를 돌리게 한다 → 고쳐서 다시 | 빨강 `✗ tests` → 초록 `✓ tests` | 가정 (e): `tests.ts`의 `testVerdict`(83행). 실패인데 초록이면 `isError`가 안 오는 것 |
| 3 | `/model`을 열고 닫는다 | 막대와 시간이 그대로 | `prompt.submit` 훅(270행), `onSlash`(`events.ts` 90행) |
| 4 | `/impeccable`(또는 설치된 다른 스킬) | 제목이 스킬 이름, `Running` → 끝나면 `Done` | `flow.ts`의 `skillBar`(296행) |
| 5 | 1의 흐름이 있는 상태에서 종료 → `claude --resume --plugin-dir ./mods/work-band` | 같은 단계·제목의 막대. 다음 요청 전까지 시간 없음 | 가정 (a)(b)(c): `work-band.tsx`의 `restore`(110행), `replay.ts`의 `signalsOf`(23행) |
| 6 | 세션 안에서 `/resume`으로 다른 세션 → 다시 원래 세션 | 막대가 돌아온다 | `classic.SessionStart` 훅(163행). 안 돌아오면 `$.state`가 초기화되지 않는 것(2절 마지막 줄) |
| 7 | 데스크톱 앱에서 요청이 도는 동안 막대를 본다 | 점묘 반짝임과 크랩 걸음이 1초마다 처음부터 다시 시작하지 않는다 | 결과만 기록. 고치는 방법은 따로 정한다 |
| 8 | Build 단계(계획 경로가 스킬 인자로만 주어진 흐름)에서 종료 → resume | 계획 제목과 `Build n/m`이 돌아온다 | `restore`의 계획 읽기, `readPlan` |

다르게 나온 항목은 systematic-debugging으로 원인을 찾고, 고친 뒤 그 항목을 다시 확인합니다.

## 2. 확인 안 된 가정 (spec §12)

Task 0을 건너뛰어 아래 가정은 실제로 확인되지 않았습니다. 틀렸을 때의 대안은 spec §12 표의 "틀리면" 열에 있습니다.

| | 가정 | 확인하는 점검 | 틀리면 생기는 일 |
|---|---|---|---|
| a | `--resume` 때 `classic.SessionStart`(`source: resume`)와 `session.start`가 온다 | 5, 6 | 막대가 돌아오지 않는다 |
| b | 그때 `$.session.messages()`가 이전 기록을 돌려준다 | 5 | 막대가 돌아오지 않는다 |
| c | 기록에 슬래시 스킬이 `<command-name>/superpowers:…</command-name>`으로 남는다 | 5 | 슬래시로 시작한 흐름이 다음 단계부터 보인다. 짧은 이름(`/brainstorming`)으로 남으면 복원하지 않는다 |
| d | 슬래시 입력 뒤 `skill.prompt`가 오고, 이름이 짝지어진다 | 1, 4 | 슬래시로 부른 스킬이 막대에 안 뜬다(모델이 부른 스킬은 뜬다) |
| e | 0이 아닌 종료 코드의 `Bash`는 `isError`다 | 2 | 실패한 테스트가 초록으로 보인다 |
| f | 실행 중인 턴에 입력한 슬래시 스킬은 그 턴이 끝난 뒤 펼쳐진다 | 1(턴 중에 입력해 보기) | 대기열 커맨드가 새 요청으로 잡혀 시간이 다시 0부터 간다 |

- in-session `/resume`·`/branch`는 엔진이 그때 `$.state`를 초기화한다는 가정에 기댑니다(spec §9.1). 6번이 실패하면 `isReplayed` 대신 세션 id(`e.session_id`)를 함께 적는 방식으로 바꿉니다.

## 3. 구현 중 내린 결정

spec과 plan이 정하지 않았거나 서로 달랐던 곳에서 이렇게 정했습니다. 틀렸다면 되돌리면 됩니다.

| 결정 | 이유 | 틀렸을 때 |
|---|---|---|
| resume 재생에서 사용자 프롬프트는 먼저 이전 메인 턴을 끝낸다(`replay.ts`) | spec §9.2 "Finish에서 `hasReply` 뒤에 다음 요청이 오면 턴 종료" | 답 턴이 중간에 끊긴 Finish 흐름이 resume 때 끝난 것으로 보인다 |
| `skill.prompt`가 슬래시 스킬의 유일한 확정 경로(spec §7.1 그대로) | spec이 정한 방식 | 관리 설정 환경·이 훅이 없는 빌드에서 `/superpowers:*` 입력이 흐름을 못 움직인다. README "알려진 한계"에 적었다. superpowers 단계 이름은 스스로 확정되게 할지는 spec을 바꾸는 결정이라 미정 |
| `command.run` 훅은 0.1의 출처 검사(출처 없음 허용, 늘 idle)를 그대로 둔다 | 같은 이름이면 `prompt.submit`의 첫 후보를 두므로 대기열 후보가 이긴다 | 대기열 커맨드를 `command.run`으로만 알리는 빌드에서 펼쳐질 때 시간이 다시 0부터 간다 |
| `restore`는 계획 파일을 상태 쓰기 **전에** 읽어 한 번에 쓴다(spec §9.3은 "쓰고 난 뒤") | `$.state.get` 문서: 한 디스패치의 모든 `get`은 같은 순간을 읽는다 | 쓰기가 버려져도 파일을 한 번 더 읽을 뿐이다 |
| `resume.test.ts`의 `session.start` 테스트 둘에 `command.register` 스텁 | 스텁 없이는 `/work-band` 등록에서 멈춰 `restore`까지 가지 않는다(`CLAUDE_MODS_HANDOFF.md` 509행) | 테스트 코드만 바뀐다 |

## 4. 미뤄 둔 항목

브랜치 리뷰에서 "병합 뒤에 해도 됨"으로 분류한 것들입니다. 위에서부터 할 만한 순서입니다.

**동작에 영향 (점검 결과를 보고 정하기)**
- `skill.prompt`·`Skill` 훅에서 `readPlan`의 `update`가 같은 디스패치 안 첫 쓰기 뒤에 돈다(0.1의 `applySkill` 방식 그대로). 점검 1·8에서 계획 제목이 안 뜨면, `restore`처럼 계획을 먼저 읽고 한 번의 `update`에서 `withPlan`까지 적용하도록 바꾼다.
- 종료 코드 판정이 `isError`만 믿는다. 점검 2가 틀리면 `verdictOf(출력) === 'fail'`이 통과를 뒤집게 한다. 재생에서는 권한 거부된 `npm test`도 `isError`로 남아 실패로 잡힌다.
- 스킬 막대가 새 요청이 아닌 턴(백그라운드 작업 알림 턴)에서 시작되면 이전 요청의 `clock.to` 때문에 곧바로 `Done`이다.
- `onSlash`는 이름으로만 중복을 거른 후보 하나만 둔다. 펼쳐지지 않은 대기열 후보가 나중의 같은 이름 idle 입력을 삼키거나(새 요청 아님, 옛 인자), 대기열 후보 둘이면 앞의 것이 덮인다.
- resume은 기록에 `superpowers:` 접두어로 남은 슬래시만 복원한다(가정 c).

**판정·표시 다듬기**
- `npm run test:unit`, `pnpm run test:e2e`를 테스트로 알아보지 못한다(접두어 뒤에 공백만 허용). `:`도 허용할지 spec에 정하기.
- 따옴표 안의 `|`, `;`, `&`, 줄바꿈도 명령을 자른다. `VAR="a b" npm test`처럼 따옴표 친 환경 변수 값은 떼지 못한다. 둘 다 오판이 아니라 판정 없음이나 출력 판정으로 넘어간다.
- 파이프 출력의 `0 passed`도 통과로 친다.
- 좁은 데스크톱(약 34열 미만)에서 칩이 막대·퍼센트와 겹친다(시간만 빠진다).
- 터미널 폭 계산이 한국어 칩 `✗ 테스트`를 `.length`로 세어 3칸 모자란다.

**코드·테스트 정리**
- `claude plugin validate`의 "gating hook without .catch" 12건(0.1부터 10건, 0.2의 `tool.call{tool=Bash}`·`classic.SessionStart` 2건). 훅 안에서는 이미 오류를 삼킨다. 검증기는 등록 지점의 `on(...).catch(...)`를 원하므로 저장소 전체에서 한 번에 바꾼다.
- `flow.ts`의 `todoBar(...) ?? agentsBar(requestAgents(...))` 두 번 반복.
- `applySkill`이 superpowers 단계가 아닌 스킬에도 같은 객체로 `update`를 부른다. `skillStage`를 두 번 계산한다.
- 테스트 빈칸: 1초 타이머 확장(`isClockLive`), 응답 아닌 턴에서 시계 멈춤, 좁은 터미널의 양성 대조, 데스크톱 360px 미만, 대체 텍스트의 칩·시간, 칩이 시간 앞에 오는 순서, 흐름 중 다른 스킬 기록, `signalsOf`의 `<local-command`·`[Request interrupted`·공백만 있는 줄, `onDismiss(w, false)`가 흐름을 남기는지.
- `resume.test.ts`의 "if the kit … hangs" 대안 주석은 더 이상 필요 없다.

**문서**
- 0.2 spec의 상태 줄 "사용자 검토 대기"를 점검 뒤 "구현 완료"로 바꾼다(0.1 때 c74f91c처럼).
- `mods/work-band/README.md`의 테스트 칩 설명에 한국어 설정이면 `테스트`로 보인다고 덧붙인다.
- work-band 0.2가 요구하는 최소 Claude Code 버전(`skill.prompt`의 `pluginName`이 있는 빌드)을 확인해 README에 적는다. 지금은 테스트한 버전(2.1.299~2.1.301)만 있다.

## 5. 참고

- 코드: `mods/work-band/hooks/` — `events.ts`(상태 규칙), `tests.ts`(테스트 판정), `replay.ts`(resume 재생), `flow.ts`(막대 계산), `draw.ts`(그리기), `work-band.tsx`(훅 연결)
- 테스트: `claude plugin test ./mods/work-band`, 검증: `claude plugin validate ./mods/work-band`, `claude plugin validate .`
- mods API 전반: `docs/CLAUDE_MODS_HANDOFF.md`
