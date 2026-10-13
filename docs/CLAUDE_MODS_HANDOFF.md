# Claude Code Mods — 핸드오프 문서

> 목적: Claude Code에서 mod 개발 프로젝트를 시작하기 위한 참고 자료
> 범위: Anthropic 공식 문서(code.claude.com/docs/ko)와 Anthropic 공개 저장소 내용만 정리 (2026-10-13 기준)
> 문서 기준 버전: reference 페이지는 Claude Code **v2.1.289** 기준
> ⚠️ 이벤트·메서드는 릴리스마다 바뀔 수 있음. 최종 기준은 mod 로드 시 생성되는 `.claude-plugin/types/claude-code/index.d.ts` (문서와 다르면 타입 파일을 신뢰하라고 공식 문서에 명시)

---

## 0. 공식 소스 목록

### 문서 (한국어)
| 페이지 | URL |
| :- | :- |
| Mods 개요 | https://code.claude.com/docs/ko/plugins/mods/overview |
| mod 만들기 | https://code.claude.com/docs/ko/plugins/mods/create |
| 인터페이스에 그리기 | https://code.claude.com/docs/ko/plugins/mods/interface |
| 이벤트에 반응하기 | https://code.claude.com/docs/ko/plugins/mods/events |
| mods API 사용하기 | https://code.claude.com/docs/ko/plugins/mods/api |
| mod 테스트하기 | https://code.claude.com/docs/ko/plugins/mods/test |
| mod 문제 해결 | https://code.claude.com/docs/ko/plugins/mods/troubleshoot |
| 조직의 mod 관리 | https://code.claude.com/docs/ko/plugins/mods/admin |
| Mods 참조 | https://code.claude.com/docs/ko/plugins/mods/reference |
| 플러그인 설치 및 관리 | https://code.claude.com/docs/ko/plugins/install |
| 전체 문서 인덱스 | https://code.claude.com/docs/llms.txt |

영문 문서는 URL의 `/ko/`를 빼거나 `/en/`으로 바꾸면 됨.

### 관련 문서 (mods 문서에서 링크됨)
- 플러그인 개요 `/docs/ko/plugins/overview`
- 플러그인 만들기 `/docs/ko/plugins/create`
- 매니페스트 참조 `/docs/ko/plugins/manifest-reference`
- 마켓플레이스 참조 `/docs/ko/plugins/marketplace-reference`
- 플러그인 CLI 참조 `/docs/ko/plugins/cli-reference`
- 플러그인 로딩 `/docs/ko/plugins/loading`
- 플러그인 보안 `/docs/ko/plugins/security`
- 설정 훅 `/docs/ko/hooks`
- 권한 `/docs/ko/permissions`
- 관리형 설정 `/docs/ko/managed-settings`

### 코드 저장소
- 샘플 mod: https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods
  - `token-weather`: 프롬프트 위에 컨텍스트 윈도우 "예보"를 그림
  - `blast-radius`: `rm -rf`, 강제 푸시 같은 위험한 셸 명령을 보류하고, 무엇이 바뀌는지 보여 준 뒤 진행/취소 버튼 제공
  - `replay-theater`: 마지막 턴의 파일 편집을 단계별로 다시 보는 `/replay` 명령
  - 있는 그대로(as-is) 공유되며 지원은 없음
- 내장 mod 소스: https://github.com/anthropics/claude-code/tree/main/mods
  - `diff`: `/diff` 창. 키보드 동작에 바인딩한 버튼, mod가 직접 처리하는 스크롤
  - `agents-md`: `AGENTS.md`를 프로젝트 지침으로 로드. `userConfig` 옵션 예시
  - `sec-default`: 기본 보호 기능. 정책 mod를 만들 때 모델로 삼을 수 있음
  - `telemetry`: 다른 mod가 호출할 수 있는 메서드를 추가하고 타입을 함께 제공
- 온라인 타입 정의: `mods/types/claude-code.d.ts` (위 claude-code 저장소). 첫 줄에 작성한 버전이 적혀 있음

---

## 1. 개념

- mod는 Claude Code의 모양과 동작을 바꾸는 **플러그인**이다.
  - JS/TS 이벤트 핸들러(**훅**)로 이루어진다.
  - 도구 호출, 프롬프트 제출, UI 렌더링 같은 이벤트가 생기면 Claude Code가 훅을 호출한다.
- 설정 파일 기반 훅(셸/HTTP/프롬프트)과 다르다. mod의 훅은 **Claude Code 프로세스 안에서 실행되는 함수**다.
  - 문서에서 "훅"은 mod 핸들러를 뜻하고, 설정 파일 방식은 "설정 훅"이라고 부른다.
- mod로 할 수 있는 일
  - 직접 쓰는 UI 그리기: 트랜스크립트 옆 창(Pane), 프롬프트 위 띠(Band)에 탭·버튼·텍스트 필드 배치
  - Claude Code 자체 UI 다시 그리기: 도구 호출 행, 스피너, 질문 대화 상자 등
  - 도구 호출·요청에 개입: 보류 후 사용자에게 묻기, 실행 없이 응답하기, 특정 요청을 다른 모델로 보내기
  - `/command` 추가: Claude 턴 없이, Claude가 작업 중일 때도 즉시 실행
  - 훅 간 데이터 공유: 같은 파일의 모듈 변수를 공유

### 다른 확장 수단과 비교 (공식 표)
| | Mod | 설정 훅 | 스킬 | MCP 서버 |
| :- | :- | :- | :- | :- |
| 정의 | Claude Code가 자체 프로세스에서 호출하는 플러그인 내 함수 | 라이프사이클 이벤트에서 실행하는 셸/HTTP/프롬프트 | Claude가 읽는 `SKILL.md` | 도구를 제공하는 외부 프로세스 |
| 변경 대상 | 도구 호출, 프롬프트, 명령, 턴, UI | 진행 여부, 인수/결과, 추가 컨텍스트 | Claude가 알고 하는 것 | 사용 가능한 도구 |
| UI 그리기 | 예 | 아니요 | 아니요 | 아니요 |
| 작성 언어 | JS/TS | 스크립트 + `settings.json` | Markdown | 아무 언어 |
| 선택 시점 | 창·띠·명령이 필요하거나 이벤트를 재작성할 때 | 기존 스크립트로 차단/허용/로깅할 때 | 같은 지침을 반복해 붙여 넣을 때 | 외부 시스템에 접근할 때 |

하나의 플러그인에 mod, 스킬, MCP 서버를 함께 담아 배포할 수 있다.

### 실행 위치
| 실행 환경 | 훅 실행 | mod가 그린 UI 표시 |
| :- | :- | :- |
| 터미널 `claude` (에디터 통합 터미널, JetBrains 포함) | 예 | 예 |
| Desktop 앱 Code 탭 (WSL 제외) | 예 | 예 (터미널 전용 요소 제외) |
| Desktop 앱 WSL 세션 | 아니요 (플러그인 미지원) | 아니요 |
| VS Code 확장 채팅 패널 | 예 | 아니요 |
| `claude -p`, Agent SDK | 예 | 아니요 |
| Remote Control (claude.ai/모바일) | 예 (사용자 컴퓨터 세션에서) | 사용자 컴퓨터 터미널에 표시 |
| 클라우드 세션 | 예 (클라우드로 전달되는 플러그인만) | 아니요 |

UI를 그리는 mod는 자신이 어느 앱에서 실행 중인지 확인할 수 있다. 그릴 수 없는 곳에서는 트랜스크립트 한 줄이나 명령의 텍스트 응답으로 대체할 수 있다.

---

## 2. 요구사항, 켜고 끄기

- **Claude Code v2.1.287 이상**이 필요하고, 기본으로 켜져 있다 (overview 기준).
  - admin 페이지에는 v2.1.286으로 적혀 있음. 문서 간 불일치.
- 얼리 액세스용 `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`는 v2.1.287부터 무시된다. 설정해 두었다면 제거한다.
- 끄는 방법
  - mod 하나: `/plugin` → **Installed** 탭에서 비활성화하거나 제거
  - 한 세션 동안 설치된 모든 mod: `--safe-mode` (다른 사용자 지정도 함께 꺼짐)
  - 모든 세션에서 사용자 mod 전부: `~/.claude/settings.json`에 `"disableAllHooks": true` (설정 훅과 상태줄도 꺼짐)
- `disableAllHooks`와 `allowManagedModsOnly`는 mod만 멈춘다.
  - 플러그인의 스킬, 명령, 에이전트, MCP는 그대로 로드된다.
- 로드 확인: `/plugin`을 열면 탭 아래 흐린 줄에 `1 mod active · first-mod`처럼 표시된다.

### 내장 mod (`/plugin` → Installed → Built-in)
| 이름 | 기능 | 끄는 방법 |
| :- | :- | :- |
| `cc-plugin-agents-md` | `AGENTS.md` 로드 | `/plugin`에서 비활성화 |
| `cc-plugin-diff` | `/diff` 창 | `/plugin`에서 비활성화 (내장 버전으로 대체됨) |
| `cc-plugin-plugin-authoring` | mod 작성용 `plugin-authoring` 스킬 (스킬만 있고 mod 코드는 없음) | `/plugin`에서 비활성화 |
| `cc-plugin-sec-default` | 사용자 mod로부터 조직 관리 항목 보호 | 끌 수 없음 |
| `cc-plugin-telemetry` | 분석 레코드 전송 | `/plugin` 또는 `DISABLE_TELEMETRY` |
| `cc-plugin-you-should-know` | 긴 작업 중 보조 에이전트가 알릴 만한 내용을 프롬프트 위에 표시 | 기본 꺼짐. `/plugin enable cc-plugin-you-should-know@builtin` |

`disableAllHooks`, `--bare`, `--safe-mode`는 내장 mod를 멈추지 않는다.

---

## 3. 파일 구조와 최소 예제

```text
first-mod/
├── .claude-plugin/
│   └── plugin.json        # 매니페스트 (mod 전용 필수 필드 없음)
└── hooks/
    ├── hooks.json         # "modules" 키가 있으면 mod가 됨
    └── register.js        # 훅 모듈
```

`hooks/hooks.json`. 경로는 hooks.json 기준 상대 경로이고, 배열에 경로 하나만 넣는다. 같은 파일의 `hooks` 아래에 설정 훅을 함께 둘 수 있다.
```json
{ "description": "The first-mod hooks module", "modules": ["./register.js"] }
```

`plugin.json` 필드는 `name`, `version`, `description`, `author`.
- `claude-`로 시작하는 등 Anthropic 플러그인처럼 보이는 `name`은 validate를 통과하지 못한다.

훅 모듈 규칙
- `register(on, options)`를 export하는 ES 모듈이다.
- 확장자는 `.js/.mjs/.cjs/.jsx/.ts/.mts/.cts/.tsx`.
- Claude Code가 `.js`/`.ts`를 직접 로드한다. Node.js, 번들러, 빌드가 필요 없다.

선택 파일
- `types/index.d.ts`: `$.state`를 쓰거나 네임스페이스를 추가할 때
- `*.test.ts(x)`: 테스트

### `register.js` 예제 (도구 호출 카운터 + `/tally` 명령, create 페이지)
```javascript
let calls = 0

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'tally', description: 'Show how many tool calls Claude has made' })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    calls += 1
    $.ui.invalidate('ui.render')   // 다시 그리기 요청
    return next(e)                 // 도구를 평소대로 실행
  })

  on('command.run', { command: 'tally' }, async () => {
    return { text: 'Claude has made ' + calls + ' tool calls since this mod loaded' }
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    return next({ ...e, props: { ...e.props, suffix: ' · tool calls: ' + calls + '…' } })
  })
}
```

---

## 4. 개발 루프

### Claude에게 맡기기
- 내장 스킬 `plugin-authoring`을 쓴다. 자동으로 로드되거나 `/plugin-authoring`으로 직접 로드한다.
- Claude는 `~/.claude/dev-mods/<세션ID>/<mod명>/`에 mod를 작성한다.
  - `default`/`acceptEdits` 모드에서는 `~/.claude`가 보호된 경로라 파일마다 확인을 받는다.
- 첫 저장 시 핫 리로딩 여부를 묻는다.
  - **Enable for this session**: 턴이 끝날 때 로드하고, 변경할 때마다 다시 로드한다. 세션을 재개해도 유지된다.
  - **Not now**: 이 세션이 다음에 시작될 때 로드한다.
- Claude가 작성한 mod는 **그 세션에서만** 로드된다.
  - 폴더는 `cleanupPeriodDays`가 지나면 삭제된다.
  - 계속 쓰려면 다른 곳에 복사하고 `--plugin-dir`로 로드하거나 마켓플레이스에 추가한다.
- Claude가 작성한 mod가 로드되지 않는 경우
  - `claude -p`, `dontAsk` 모드
  - 워크스페이스 신뢰 프롬프트를 수락하지 않음
  - `--safe-mode`, `--bare`, `disableAllHooks`, 조직 정책

### 직접 작성
- `claude --plugin-dir ./first-mod`
  - 설치 없이 한 세션 동안 로드한다.
  - 디렉터리를 감시하다가 저장하면 **핫 리로드**한다.
- 리로드할 때마다 `register`가 다시 실행되므로 모듈 변수는 초기화된다. 값을 유지하려면 `$.state`/`$.store`를 쓴다.
- 비대화형 확인: `claude -p "/tally" --plugin-dir ./first-mod`
- 저장으로 모듈이 깨지면 `reload failed, the previous version stays loaded:`가 표시되고 이전 버전이 유지된다.
- 개발은 설치된 사본이 아닌 원본 디렉터리에서 `--plugin-dir`로 한다. 설치본은 버전별로 캐시된다.
- 환경 변수
  - `CLAUDE_CODE_PLUGIN_DIRS`: 디렉터리 목록. `:`로 구분, Windows는 `;`
  - `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`: 장시간 비대화형 세션에서도 저장 시 리로드

### 타입 정의 (빌드별 자동 생성)
mod를 로드할 때마다 `.claude-plugin/types/`에 생성된다.
- `claude-code/index.d.ts`: 모든 이벤트(입력/결과), API 네임스페이스·메서드, 환경별 요소. 가장 완전한 참조다.
- `claude-code-tools/index.d.ts`: 기본 도구의 입력/결과. `e.tool === 'Bash'`로 타입이 좁혀진다.
- `claude-code-mcp/index.d.ts`: 연결된 MCP 도구의 입력
- `<의존 플러그인>/index.d.ts`: `plugin.json`의 `dependencies`마다 하나씩
- `tsconfig.json`: mod에 자체 tsconfig가 없으면 이를 확장하는 파일이 추가된다. `tsc -p ./first-mod`로 타입 검사할 수 있다.

### 정적 검증 `claude plugin validate <dir>` (`--strict`, `--json`)
코드를 실행하지 않고 매니페스트를 검사하고 훅 모듈을 정적 분석한다. 출력 예:
```text
  ❯ ./register.js hooks: session.start, tool.call, command.run{command=tally}, ui.render{component=Spinner}
  ❯ ./register.js calls: $.command.register, $.ui.invalidate
✔ Validation passed
```
조건에 따라 `env reads:`/`env writes:`, `state reads:`/`state writes:` 줄이 추가된다.

**정적 분석 규칙** (어기면 검증과 로드가 실패함)
- API는 `$.네임스페이스.메서드(...)` 형태로 전부 써서 호출한다.
- `$`를 넘겨도 되는 곳은 **같은 파일 최상위에 선언한 함수**뿐이다.
  - 출력에는 `$.store.get (via loadNotes)`처럼 표시된다.
  - 메서드, 훅 안에서 정의한 함수, import한 함수에 `$`를 넘기면 실패한다. 예외는 `$.state`의 `read`/`update`.
- `$`나 네임스페이스를 변수에 할당·구조 분해하거나 계산된 이름으로 접근하면 안 된다.
  - 예: `const ui = $.ui` → `$.ui is used as a value`
- `on()`의 이벤트 이름은 문자열 리터럴이어야 한다.
- `register` 안에서 `on`을 다시 선언(shadowing)하면 안 된다.
- import는 플러그인 디렉터리 안의 상대 경로만 된다. 허용되는 bare import는 `claude-code` 하나다.
- 파일 상단의 정적 `import`만 쓴다. 동적 `import()`와 `require`는 안 된다. 모든 파일은 ES 모듈이다.
- 같은 이벤트를 matcher 없이 두 번 등록하면 로드가 실패한다.
- `$.env`의 변수 이름과 `$.state`의 `plugin`/`key`는 문자열 리터럴이어야 한다.

---

## 5. 이벤트 모델

### 훅 시그니처
`on(event, [matcher], async ($, e, next) => ...)`. 끝에 `.catch(handler)`를 붙일 수 있다.
- `$`: mods API
- `e`: 이벤트 데이터. **깊게 동결**되어 있어서 필드에 할당하면 오류가 난다.
- `next`: 체인의 다음 mod, 최종적으로 Claude Code 자체 동작으로 넘긴다.
  - `next.signal`: AbortSignal
  - `next.origin`: `{plugin, tier}`. Claude Code 자신은 `engine`/`core`
  - `next.budget.ms`, `next.budget.remainingMs`
  - `next.to(e, 'append'|'builtin'|'core')`: prepend/append 목록에 있는 mod만 사용 가능
  - `.catch` 안에서만: `next.error.kind`(`throw`/`timeout`), `next.error.message`, `next.called`
- `turn.step`과 `process.spawn` 훅은 **async generator**이고, 나머지는 async 함수다.

### 이벤트를 다루는 세 가지 방식
- **관찰**: `return next(e)`, 또는 `await next(e)` 뒤에 작업하고 결과를 반환
- **재작성**: `return next({ ...e, ... })`
- **응답(단락)**: `next`를 호출하지 않고 결과를 반환

### matcher
- 값은 단일 값, 배열, 정규식이 가능하며 모든 필드가 일치해야 실행된다.
- 와일드카드: `'classic.*'`는 모든 설정 훅 이벤트, `'*'`는 텔레메트리를 뺀 모든 이벤트다.
- 텔레메트리 이벤트는 `{ to: 'collector' }` 필터가 필수다.

### 이벤트 전체 목록 (reference)
| 분류 | 이벤트 |
| :- | :- |
| 도구 | `tool.call`, `tool.check`, `tool.describe` |
| 프롬프트/Claude가 읽는 내용 | `prompt.submit`, `prompt.fill`, `prompt.suggest`, `prompt.edit`, `prompt.compose`, `prompt.section`, `prompt.context`, `prompt.attachment`, `skill.prompt`, `attribution.text` |
| 명령/구성 | `command.run`, `command.describe`, `config.set`, `config.describe` |
| 턴 | `turn.start`, `turn.step`, `turn.complete` |
| 세션 | `session.start`, `session.end`, `session.compact`, `session.receive`, `session.send`, `session.append`, `session.attach`, `session.detach`, `session.measure` |
| 서브에이전트 | `agent.offer`, `agent.spawn` |
| 인터페이스 | `ui.render`, `ui.resolve`, `ui.press`, `ui.input`, `ui.select`, `ui.focus`, `ui.scroll`, `ui.close`, `ui.message`, `ui.fault`(v2.1.289+) |
| 다른 mod | `plugin.register`, `engine.create` |
| 텔레메트리 | `telemetry.log`, `telemetry.mark` |
| 설정 훅 | `classic.<Event>` (예: `classic.Stop`, `classic.PostToolUse`, `classic.SessionStart`). `e`는 설정 훅이 stdin으로 받는 JSON이며 `transcript_path` 포함 |
| API 호출 | 모든 `$.` 메서드가 이벤트이기도 하다 (예: `fs.read`, `model.complete`, `ui.open`). 반환은 `next(e)` / `{ deny }` / `{ value }` |

`session.end`의 `reason`: `clear`/`resume`/`logout`/`prompt_input_exit`/`other`

### 주요 이벤트 상세
- **`tool.call`**
  - 서브에이전트 호출과 MCP 호출도 포함한다.
  - 도구 이름은 `e.tool`, 인수는 `e.command`, `e.file_path`처럼 `e`의 필드로 들어온다.
  - 반환: `{ deny: reason }` 또는 `{ result }`. 결과에는 `isError`, `deny`가 있을 수 있다.
  - `next(e)`를 호출하면 권한 검사 후 실행된다. 다시 호출하면 재시도된다.
  - 보류: `await $.ui.ask(question, options)`. 선택한 레이블이나 입력 텍스트로 resolve된다.
    - 닫기, **Chat about this**, `claude -p`에서는 reject된다.
  - 시간 제한: mods API 호출 안에서 기다린 시간은 훅 시간 제한에서 제외되고, 직접 만든 promise를 기다린 시간은 포함된다.
  - 시간 초과된 훅은 건너뛰어진다. 그러면 보류했던 명령이 실행된다.
- **`tool.check`**
  - 권한 규칙과 설정 훅이 결정한 뒤에 발생한다.
  - `next(e)`는 `allow`/`ask`/`deny`로 resolve된다. 훅은 `{ decision, reason }`을 반환할 수 있다.
  - 인수는 `e.input`에 있다.
- **`prompt.submit`**
  - 재작성: `next({ ...e, text })`
  - Claude만 읽는 텍스트: `context` 배열에 추가
  - 전송 막기: `{ drop: reason }`
- **`prompt.section`**(시스템 프롬프트 섹션), **`prompt.context`**(첫 메시지 컨텍스트), **`skill.prompt`**
  - 요청마다 내용이 바뀌면 프롬프트 캐시가 무효화된다.
- **`turn.start`**: `e.turnId`
- **`turn.step`**
  - 모델 요청마다 발생하고, 서브에이전트면 `e.agentId`가 있다.
  - async generator로 작성하고 `yield* next(e)`를 쓴다.
  - 다른 모델로 보내기: `next({ ...e, model })`
  - `result.usage`: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `model`
- **`turn.complete`**
  - 필드: `e.isAborted`, `e.answer`, `e.durationMs`, `e.usage`
  - `{ text }`를 반환하면 답변 아래에 한 줄이 표시된다.
- **`session.receive`**
  - 필드: `e.text`, `e.origin.kind`(`peer`, `peer-send-message`, `task-notification`, `scheduled-trigger` 등)
  - `{ consumed: reason }`을 반환하면 Claude에게 전달하지 않는다.
  - 발신자 이름은 신뢰하지 말라고 되어 있다.
- **`session.send`**: `e.to`, `e.text`, `e.origin.kind`(`model`/`plugin`)

### 체인 실행 순서
첫 번째가 가장 바깥이다. 먼저 보고, 결과는 마지막에 본다.
1. `sec-default@builtin`, 조직의 `prependPlugins`, `appendPlugins`에 없는 조직 mod
2. 사용자 설치 mod. 이 안에서는 자기 매니페스트 `dependencies`에 나열한 mod보다 먼저 실행된다.
3. 조직의 `appendPlugins`
4. 그 밖의 내장 mod

한 모듈 안에서는 `on` 호출 순서를 따른다. 여러 mod를 함께 쓰면 로드된 순서대로 실행된다.

설정 훅과의 관계
- **관리형 설정의 `PreToolUse`**: 모든 mod의 `tool.call`보다 먼저 실행된다. 차단하면 최종이다.
- **그 외 설정 및 플러그인 `hooks.json`의 `PreToolUse`**: 마지막 `next` 이후에 실행된다. 그래서 `next` 없이 응답한 mod는 이 훅의 실행을 막는다.
  - `tool.check`는 이 그룹이 차단한 호출도 승인할 수 있다.

### 훅 실패 처리 (예외, 시간 초과, 잘못된 결과)
- `next` 호출 전에 실패하면 그 훅을 건너뛴다. `next`가 완료된 뒤 실패하면 그 결과가 유지된다.
- 로그 예: `my-mod: tool.call hook skipped: threw Error: boom`
- fail-closed가 필요하면 `on(...).catch(handler)`를 붙인다. 이 핸들러의 제한은 1초다.

---

## 6. 인터페이스

### 렌더링 지점과 matcher
- Claude Code는 지점을 그리기 직전마다 `ui.render`를 발생시키고, 훅은 **요소 트리**를 반환한다.
- 예: `on('ui.render', { component: 'Pane' }, ...)`
- 필드: `e.component`, `e.surface`(`terminal`/`desktop`), `e.props`, `e.requestId`(pane `id`)

화면 배치
- **Pane**: 넓은 전체 화면 터미널에서는 트랜스크립트 오른쪽 사이드바, 그 외에는 프롬프트 위 테두리 영역. 여러 개면 탭이 생긴다.
- **Band**: `AbovePrompt`. 항상 존재하고 모든 mod가 공유한다.
  - 그리지 않으려면 `next(e)`를 반환한다.
  - 다른 mod의 내용을 유지하려면 `await next(e)` 결과를 `Box` children에 넣는다.
- **Toast**: 오른쪽 위
- **로그 줄**: 트랜스크립트 안
- **상태줄**: 프롬프트 아래
- 프롬프트는 Claude Code 소유다. **권한 프롬프트는 렌더링 지점이 아니라서 바꿀 수 없다.**

렌더링 지점 지원 범위
- 터미널과 Desktop 모두: `Pane`, `AbovePrompt`, `UserMessage`, `AssistantMessage`, `ToolUse`, `ToolResult`, `ToolGroup`, `CommandOutput`, `AskUserQuestion`, `Spinner`, `SessionMode`, `PromptHint`
- 터미널만: `ToolProgress`, `TurnDuration`, `InfoNotice`

Claude Code가 이미 그리는 지점을 다루는 방법
- 세부 변경: `next({ ...e, props: {...} })`
- 대체: 트리를 반환하고 `next`를 호출하지 않음
- 유지: `next(e)`
- 이 지점들에서 `next(e)`는 `{ type: 'engine', ref }`를 반환한다.
- `AskUserQuestion` 트리는 ref를 정확히 한 번 포함해야 하고, 직접 만든 요소는 ref 위에 있어야 한다.

### Pane 열고 닫기
- 열기: `$.ui.open({ id, title, focus, closeOnEscape, holdToasts, rows, columns })`
  - `rows` 기본값은 공간의 1/3이다.
  - `focus`, `closeOnEscape`, `holdToasts`는 `true`만 허용한다.
  - 반환: `{ isPlaced: true }`, 또는 `isPlaced: false`와 `reason`
- 닫기: `$.ui.close({ id })`. 명령을 턴 중에도 실행하려면 `$.command.register`에 `immediate: true`를 넣는다.
- 사용자 동작 없이 열린 Pane은 터미널 폭이 **144열 이상**일 때만 배치된다. 사용자가 한 번 직접 연 뒤에는 **110열 이상**이면 된다.

### 요소 (`$.ui.resolve(e)`)
| 요소 | 사용 위치 | 비고 |
| :- | :- | :- |
| `Box` | 모두 | `flexDirection`, `columnGap`, `padding`, `borderStyle`, `width` |
| `Text` | 모두 | `color`, `bold`, `dimColor`, `italic`, `wrap`. 문자열 자식 하나 최대 10,000자 |
| `Button` | 모두 | `onPress`, `hotkey`(숫자 하나 또는 소문자 하나), `plain` |
| `Link`, `Code`, `Markdown` | 모두 | `Markdown`은 `text` prop. `Code`/`Markdown` 최대 10,000자 |
| `Input`, `Select` | 터미널, Desktop | `onSubmit`/`onInput`, `onSelect`(`options` 필요) |
| `Client` | 터미널, Desktop | 별도 파일이 그림. mod API 사용 불가, `ui.message`로 통신, 실패 시 `ui.fault` |
| `Svg` | Desktop만 | 최대 131,072자 |
| `Raster` | 터미널만 | `key`, `columns`(최대 512), `rows`(최대 256), base64 `cells`. 애니메이션은 `$.ui.blit({ requestId, key, columns, rows, cells })` |
| `Image` | 터미널만 | PNG/RGBA 최대 2 MiB 또는 파일 경로 |

- 검증에 실패한 트리는 엔진이 자체 버전으로 대신 그린다.
  - 트랜스크립트: `ui.render (Pane) refused:`
  - 디버그 로그: `a hook returned a tree that does not validate`

### 입력과 키
- 컨트롤을 쓸 때마다 `ui.press`/`ui.input`/`ui.select` 이벤트가 발생하고, 이 훅은 콜백보다 먼저 실행된다.
- 포커스 얻기: `focus: true`로 열기(프롬프트가 비어 있을 때만), Ctrl+X 다음 Tab, 클릭
- 키 동작
  - Tab, Up/Down, Enter, PgUp/PgDn, Home/End
  - Ctrl+X 다음 화살표: 크기 조정
  - Ctrl+X 다음 X: 닫기
  - Esc: 프롬프트로 복귀
  - Tab과 화살표는 다시 바인딩할 수 없다.

### 다시 그리기와 상태
- Claude Code는 prop이나 터미널 폭이 바뀔 때만 자동으로 다시 그린다. 그 외에는 `$.ui.invalidate('ui.render')`를 호출한다.
- 주기적 갱신은 `$.clock.every`로 한다. 다시 그리기는 초당 10회로 제한되고, 초과한 호출은 병합된다.

| 보관 위치 | 유지 기간 |
| :- | :- |
| 모듈 변수 | 모듈 재로드까지 |
| `$.state` | 세션 종료 또는 `/clear`·`/resume`·`/branch`까지. **반응형**이라 값을 읽은 지점이 자동으로 다시 그려지고, 재로드 후에도 유지됨 |
| `$.store` | `~/.claude/plugins/store/`의 플러그인별 JSON KV. 머신의 모든 세션이 공유. 삭제하거나 `cleanupPeriodDays` 동안 아무도 쓰지 않을 때까지 |

`$.state`
- 선언: 타입 파일에 `declare module 'claude-code' { interface PluginState {...} }`를 쓰고, 매니페스트 `types` 필드가 그 파일을 가리키게 한다.
- 사용: `import { atom, read, update } from 'claude-code'`
- `ui.render` 안에서는 쓸 수 없다. 선언하지 않은 값은 validate에서 실패한다.
- `/clear`·`/resume`·`/branch`를 실행하면 `$.state`가 초기화되고 `session.start`는 **다시 실행되지 않는다.**
  - 저장값은 `classic.SessionStart`(`source`: `clear`/`resume`/`fork`)에서 다시 로드한다.

`$.store`
- `get` 다음 `set`은 원자적이지 않다. 항목마다 키를 따로 두고, 쓰기 직전에 다시 읽으라고 권장한다.

---

## 7. mods API (`$`)

- 모든 `$.` 호출은 그 자체로 이벤트다. 이벤트 이름은 `$.`을 뺀 것이다 (`$.fs.read` → `fs.read`).
  - 체인 앞쪽 mod나 조직이 관찰, 재작성, 거부할 수 있다.
- 훅 모듈에는 **Node.js API, `setTimeout`, 자체 파일·네트워크 접근이 없다.**
  - 쓸 수 있는 것: `URL`, `TextEncoder`, `AbortController`, `crypto.subtle` 같은 표준 웹 API
  - 이 제약 덕분에 validate가 코드를 실행하지 않고 `calls:`를 나열할 수 있다.

### 네임스페이스와 메서드 (reference)
| 네임스페이스 | 메서드 |
| :- | :- |
| `$.plugin` | `name`, `root` |
| `$.ui` | `resolve`, `invalidate`, `open`, `close`, `panes`, `focus`, `scroll`, `toast`, `status`, `log`, `notice`, `ask`, `copy`, `selection`, `blit` |
| `$.command` | `register`, `run`, `list` |
| `$.tool` | `register`, `call`, `check`, `list` |
| `$.agent` | `register`, `spawn`, `list` |
| `$.model` | `complete`, `fork`, `classify` |
| `$.prompt` | `submit`, `read`, `fill`, `suggest`, `compose` |
| `$.turn` | `abort` |
| `$.session` | `messages`, `cwd`, `root`, `model`, `turns`, `id`, `repo`, `surfaces`, `usage`, `version`, `compact`, `send`, `append`, `authorize` |
| `$.config` | `list`, `set` |
| `$.settings` | `read` |
| `$.env` | `get`, `set` |
| `$.fs` | `read`, `write`(원자적이지 않음), `list`, `exists`, `stat`, `ancestors` |
| `$.store` | `get`, `set`, `delete`, `keys` |
| `$.state` | `get`, `set` + 헬퍼 `atom`, `read`, `update`, `derive`, `memberOf` |
| `$.clock` | `now`, `sleep`, `after`, `every` |
| `$.http` | `fetch` |
| `$.process` | `run`, `spawn` |
| `$.mcp` | `call`, `connect` |
| `$.audio` | `play`, `speak` |
| `$.telemetry` | `log`, `mark` |

### 사용법 요점
- **명령**
  - `session.start`에서 `$.command.register({ name, description, argumentHint, immediate })`로 등록한다. 첫 프롬프트 전에 완료를 기다린다.
  - 처리는 `on('command.run', { command: 'x' }, ...)`에서 한다. `e.args`는 명령 뒤 텍스트다.
  - `{ text }`를 반환하면 트랜스크립트에 출력되고 Claude가 읽는다. `{}`는 출력하지 않는다.
  - 출력 앞에는 플러그인 이름이 붙는다.
  - 내장 명령 이름과 겹치면 예외가 나고(`"/focus" refused: it is the built-in /focus`) `session.start`의 나머지가 실행되지 않는다. 마지막에 등록하거나 `try/catch`로 감싼다.
- **도구**
  - `$.tool.register({ name, description, inputSchema })`
  - 전체 이름은 `mcp__<플러그인명>__<name>`이고, 그 이름으로 필터한 `tool.call`에서 `{ result }`를 반환한다.
- **모델**
  - `$.model.complete({ model, system, prompt, maxTokens, timeoutMs, effort... })`
    - 대화 기록 없이 사용자 자격 증명으로 호출한다.
    - API 오류는 reject가 아니다. `r.isAnswered`, `r.text`, `r.reason`을 확인한다.
    - 조직이 차단한 모델처럼 보내지 않는 요청은 reject된다.
  - `$.model.fork({ prompt })`: 현재 대화, 같은 모델, 같은 시스템 프롬프트로 보내므로 대부분 프롬프트 캐시에서 처리된다.
  - 둘 다 사용자의 플랜이나 API 키 사용량을 쓴다.
- **타이머**
  - `$.clock.every(ms, fn)`, `$.clock.after(ms, fn)`는 `cancel()`이 있다. 현재 시각은 `await $.clock.now()`.
  - 콜백에서 오류가 나면 로그에 남고 다음 간격에 다시 실행된다. 모듈을 재로드하면 중지된다.
- **턴 없이 표시**
  - `$.ui.status(text)`: 프롬프트 아래, `⚠ mod명:` 접두
  - `$.ui.toast(text)`: 4초
  - `$.ui.log(text)`: 트랜스크립트의 흐린 줄, `● mod명:` 접두, Claude는 읽지 않음
  - `$.ui.log(text, { to: 'debug' })`: 디버그 로그로만
- **턴 시작**
  - `$.prompt.submit({ text, asUser })`: 세션이 유휴가 되면 턴 시작 시 resolve된다. 작업 중 실행되는 핸들러에서는 await하지 않는다.
  - `asUser: true`가 없으면 Claude는 mod가 보냈다는 문장 뒤에 텍스트를 읽는다.
- **세션 간 메시지**
  - `$.session.send({ to, text })`: `to`는 `{ sessionId }`, `{ agentId }`(`$.agent.list()`), 또는 수신 주소 문자열
  - 결과: `{ isDelivered }` 또는 `reason`
- **파일·프로세스·네트워크** (사용자 권한으로 실행)
  - `$.fs`: 상대 경로는 작업 디렉터리 기준. `list`는 재귀하지 않고 `{ name, kind, size, isLink }`를 반환한다.
  - `$.process.run([...])`: 셸 없이 실행하고 `{ exitCode, stdout, stderr }`를 반환한다. 기본 타임아웃은 30초. `spawn`은 출력을 스트리밍한다.
  - `$.http.fetch(url, init)`: `{ status, ok, headers, text }`
- **장기 작업**: `next.signal`을 전달한다.

---

## 8. 테스트 (`claude plugin test [dir]`)

- 세션, 로그인, 네트워크 없이 실행된다. 실패하면 종료 코드 1이므로 CI에서 쓸 수 있다. 테스트 하나의 제한은 5초.
- 키트: `import { test, expect, mock, tier } from 'claude-code/testing'`
- 파일명은 `*.test.ts(x)`이고 플러그인 디렉터리 어디에 두어도 된다. 파일마다 `test()`가 하나 이상 있어야 한다.
- `test('name', async ($, on) => {...})`
  - `$`: Claude Code 역할을 한다.
    - `$.tool.call`, `$.command.run`, `$.prompt.submit`, `$.session.start`, `$.turn.complete`, `$.turn.step`, `$.session.receive`, `$.ui.mount`, `$.classic.*`로 이벤트를 발생시킨다.
  - `on`: 스텁을 등록한다. mods API 이름은 `$.` 없이 쓴다 (예: `on('store.get', ...)`).
- 스텁 반환 형식
  - mods API: `{ value }`, 실패시키려면 `{ deny }`
  - 엔진 이벤트(`tool.call` 등): 이벤트 결과 자체 (예: `{ result: 'ok' }`)
- 규칙
  - 스텁은 `$`를 처음 호출하기 **전에** 모두 등록한다.
  - `session.start`는 자동으로 실행되지 않으니 직접 발생시킨다. `command.register` 스텁도 필요하다.
  - `next(e)`를 반환하는 훅에는 응답할 스텁이 필요하다. 없으면 `no implementation for ...` 오류가 난다.
  - `$.clock`은 반드시 `mock.clock(on)`을 쓴다. `$.ui.invalidate`와 `$.state`는 키트가 직접 처리한다.
- 내장 mock
  - `mock.clock(on, { now })`: `advance`, `set`, `now`, `settle`, `sleep`
  - `mock.store(on, init)`
  - `mock.env(on, vars)`
- 그리기 테스트
  - `$.ui.mount({ plugin, component, requestId, viewport, props, surface })`로 핸들을 얻는다.
  - 핸들 메서드: `press({key})`, `input({key, text})`, `select({key, value})`, `find({key} | {type, text})`, `unmount()`
  - 실제 화면에서 어떻게 보이는지는 확인하지 않는다.
- `/clear` 직후 상태 테스트: `on('classic.SessionStart', () => ({}))` 스텁 + `$.classic.SessionStart({ source: 'clear' })`
- 정책 mod 테스트: 파일 상단에 `tier('prepend')`, 그리고 `test(name, { plugins: [...] }, fn)`
- `expect`: `toBe`, `toEqual`, `toMatch`, `toMatchObject`, `toContain`, `toBeDefined`, `toBeUndefined`, `toThrow`, `.not`

```typescript
import { expect, test } from 'claude-code/testing'

test('/tally reports the tool calls the mod has seen', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }))
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Read', file_path: 'README.md' })
  const answer = await $.command.run({ command: 'tally', args: '' })
  expect(answer.text).toBe('Claude has made 2 tool calls since this mod loaded')
})
```

---

## 9. 제한값 (reference)

| 항목 | 값 |
| :- | :- |
| 훅 실행 시간 | 10초 (`prompt.edit`은 50ms) |
| `.catch` 핸들러 | 1초 |
| `session.end` 훅 합계 | SessionEnd 예산 (기본 1.5초) |
| `$.process.run` 타임아웃 | 기본 30초, 최대 10분 |
| `$.model.complete` `maxTokens` | 기본 1024, 최대 64,000 또는 모델 출력 한도 |
| `$.fs.read`/`write` | 파일당 4 MiB |
| `$.store` | JSON 총 4 MiB |
| `$.session.messages()` | 최신 4,096개 |
| 다시 그리기 | 초당 10회 (터미널의 보이는 창 등은 초당 30회) |
| Toast | 4초 |
| 요청 없이 열린 Pane | 144열 이상 (사용자가 한 번 연 뒤 110열) |
| 명령·도구·서브에이전트·창 이름 | 문자·숫자·`_`·`-`, 최대 64자 |
| `claude plugin test` 테스트 하나 | 5초 |

훅 시간 제한에는 `next`와 mods API 호출을 기다린 시간이 들어가지 않는다. 단, `$.clock.sleep`은 들어간다.

---

## 10. 보안과 신뢰

- mod는 **샌드박스 없이 사용자 권한으로** 실행된다.
  - 파일 읽기·쓰기, 프로세스 실행, 네트워크 요청, 환경 변수와 API 키 읽기
  - 모든 프롬프트와 도구 호출 보기 및 재작성, 사용자처럼 프롬프트 제출, 다른 세션에 메시지 보내기
  - 사용자에게 묻지 않고 도구 호출 승인, 사용자 플랜으로 모델 호출
- 샌드박싱을 켜도 Claude의 Bash만 격리된다. mod가 시작한 프로세스는 샌드박스 밖에서 실행된다.
- mod는 `ask` 규칙이 걸린 호출이나 사용자 자신의 `PreToolUse` 훅이 막은 호출도 승인할 수 있다.
- `deny` 규칙은 **Claude의 도구 호출에만** 적용되고 mod 자신의 `$.fs`/`$.process`에는 적용되지 않는다.
  - 예: `Read(.env)`를 거부해도 mod는 `$.fs.read`로 그 파일을 읽을 수 있다.
- 자동 모드에서 mod가 승인한 호출은 분류기 검사 없이 실행된다.
- 네트워크 정책은 `$.http.fetch`에는 적용되지만 `$.process.run`에는 적용되지 않는다.
- mod는 **권한 프롬프트를 바꿀 수 없다.**
- 신뢰하지 않은 디렉터리에서는 신뢰 프롬프트를 수락하기 전까지 mod가 로드되지 않는다.
- 설치 전 검토: 저장소를 클론한 뒤 `claude plugin validate ./some-mod`를 실행해 `hooks:`/`calls:` 줄을 확인한다.
  - 주의할 calls: `$.fs.read/write`, `$.process.run/spawn`, `$.http.fetch`, `$.env.get/set`, `$.settings.read`, `$.mcp.call`, `$.model.complete`, `$.prompt.submit`, `$.session.send`
  - 주의할 hooks: `tool.call`, `prompt.submit`, `session.append`, `ui.render{component=AskUserQuestion}`, `tool.check`

---

## 11. 조직 관리 (관리형 설정)

### sec-default 가드
- 내장 가드 `sec-default@builtin`(표시명 `cc-plugin-sec-default`)은 사용자 mod보다 먼저 로드되며 끌 수 없다.
- 로드 조건: 머신에 관리형 설정이 있거나, Team/Enterprise 플랜으로 로그인한 경우
  - API 키, Bedrock, Google Cloud Agent Platform, Microsoft Foundry 사용자는 관리형 설정이 있을 때만 로드된다.
- 사용자 mod가 바꿀 수 없는 것
  - 관리형 훅의 입력과 결정
  - 시스템 프롬프트
  - 관리형 `CLAUDE.md`와 관리형 지침
  - 모든 mod가 설정으로 읽는 내용
  - 관리형 MCP 서버의 도구와 설명
- 관리형 설정을 읽지 못하면 사용자 mod를 모두 거부한다(fail-closed).

### 주요 설정
- `pluginConfigs."cc-plugin-sec-default@builtin".options`
  - `allowManagedModsOnly: true`: 사용자 플러그인, `--plugin-dir`, Claude가 작성한 mod, 원격 마켓플레이스, claude.ai에서 켠 mod를 모두 차단한다. 조직 mod와 내장 mod는 유지된다.
    - **관리형 설정에서만** 읽는다.
  - `allowModsToOverrideDenyRules: true`: 사용자 mod가 `deny` 규칙이 거부한 호출을 승인할 수 있게 한다.
- `prependPlugins` / `appendPlugins`
  - 조직 mod의 실행 위치를 정한다.
  - 목록이 기본값을 **대체**하므로 가드를 유지하려면 `sec-default@builtin`을 직접 넣어야 한다.
  - 저장소 설정에서는 읽지 않는다.
- `disableAllHooks`: 관리형 설정에 두면 조직 플러그인과 관리형 `PreToolUse`까지 모두 멈춘다. 상태줄과 `/goal`도 멈춘다.
- `allowManagedHooksOnly`: 사용자 설정 파일의 훅까지 차단한다.
- `disableSideloadFlags`: `--plugin-dir`, `--plugin-url`, `--agents`, `--mcp-config`와 Claude가 작성한 mod를 막는다.
- `strictKnownMarketplaces` 같은 기존 플러그인 제어도 mod에 적용된다.

### 조직 mod로 인정되는 조건 (모두 충족)
1. 관리형 `enabledPlugins`에서 `true`
2. 관리형 `extraKnownMarketplaces`가 사용자 컴퓨터의 디렉터리를 절대 경로로 지정
3. 마켓플레이스가 플러그인을 상대 경로로 나열해 제자리에서(in-place) 로드됨. 해당 디렉터리와 상위 디렉터리는 관리자만 쓸 수 있어야 함

GitHub, git, URL, npm에서 캐시로 복사된 플러그인은 사용자 mod로 취급된다.

### 정책 mod
- `plugin.register` 훅에서 `e.tier`(`prepend`/`user`/`append`/`builtin`)와 `e.uses.calls`를 읽고, `{ refuse: reason }`을 반환해 로드를 거부한다.
- API 이벤트 이름(예: `fs.write`)에 훅을 걸어 다른 mod의 호출을 `{ deny }`할 수 있다. 호출한 mod는 `next.origin.plugin`으로 알 수 있다.
- `plugin.register` 훅이 실패하면 기본은 fail-open이다. `.catch`로 `user` 티어 mod만 거부하면 fail-closed가 된다.
- 훅 워커가 3번 충돌하면 내장이 아닌 mod가 모두 언로드된다.

---

## 12. 설치·배포

- mod는 마켓플레이스에서 **플러그인으로** 설치한다.
  - 세션 안: `/plugin install <name>@<marketplace>`
  - 셸: `claude plugin install <name>@<marketplace> [--scope project|local]`
  - 마켓플레이스 추가와 설치를 한 번에(v2.1.275+): `/plugin install <name> --marketplace <source>`
- 셸에서 설치한 뒤 열린 세션에서는 `/reload-plugins`를 실행한다.
- 마켓플레이스 추가: `/plugin marketplace add <source>` 또는 `claude plugin marketplace add <source>`
  - source: GitHub `owner/repo[#ref]`, git URL(`https://` 또는 `git@host:path`), 로컬 경로(`./` 시작), 호스팅된 `marketplace.json` URL
  - 로컬 디렉터리라면 `.claude-plugin/marketplace.json`이 있어야 한다.
- 비공개 저장소: 머신에 있는 git 자격 증명을 쓰고 프롬프트를 띄우지 않는다.
  - HTTPS: 자격 증명 도우미(`gh auth login` 등)
  - SSH: `known_hosts` 등록과 암호 없는 키
  - `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`
- 설치 범위
  - user: `~/.claude/settings.json`의 `enabledPlugins`
  - project: 커밋되는 `.claude/settings.json`. 협업자도 각자 install을 한 번 해야 한다.
  - local: `.claude/settings.local.json`
  - 같은 PC의 터미널, Desktop 로컬 세션, VS Code 확장은 같은 설정 파일을 읽는다.
- 자동 업데이트
  - 세션이 시작된 뒤 마켓플레이스를 새로고침하고 플러그인을 업데이트한다. 실행 중인 세션은 `/reload-plugins` 후에 반영된다.
  - 공식 마켓플레이스(일부 제외)와 claude.ai에서 추가한 마켓플레이스는 기본으로 켜져 있다.
  - **그 밖의 마켓플레이스(커뮤니티, 타사, 로컬)는 기본으로 꺼져 있다.** `/plugin` → **Marketplaces** → **Enable auto-update**로 켠다.
  - 즉시 업데이트: `claude plugin update <plugin>@<marketplace>`
- claude.ai 계정 동기화
  - claude.ai 계정이나 조직에서 켠 플러그인은 그 계정으로 로그인한 **터미널 세션**에 백그라운드로 동기화된다(v2.1.273+). 표시는 `<name>@synced`.
  - 반대로 로컬에서 설치한 플러그인은 계정에 올라가지 않는다.
- 공유 방법 (create 페이지)
  - 소수: 디렉터리나 `.zip` 전달
  - 팀: 자체 마켓플레이스를 만들고 저장소 설정에 등록
  - 조직: 관리형 설정
  - 공개: 공개 마켓플레이스 또는 Anthropic 디렉터리에 제출
  - README에 테스트한 Claude Code 버전을 적는다.
- 기타 명령: `claude plugin list`, `claude plugin details <name>`(토큰 비용), `claude plugin marketplace list|update|remove`, `claude plugin prune`

---

## 13. 문제 해결

- 실패한 모듈이나 훅은 **조용히 건너뛰어진다.** 그래서 고장 난 mod가 "아무것도 안 하는 mod"처럼 보일 수 있다. 먼저 `claude plugin validate`를 실행한다.
- 메시지가 보이는 곳
  - `--plugin-dir`이나 핫 리로드 세션: 트랜스크립트의 흐린 줄
  - 그 밖의 대화형 세션: 디버그 로그
  - `claude -p` + `--plugin-dir`: stderr
- 디버그 로그
  - `claude --debug-file ./mod-debug.log --plugin-dir ./first-mod`로 시작하고 `tail -f ./mod-debug.log | grep first-mod`로 본다.
  - 로드 성공 줄 예: `hooks module first-mod@inline loaded (worker, environment 2, tier user); events: ...`
  - `--plugin-dir`로 로드한 mod에는 `@inline`이 붙는다. `pluginConfigs` 키도 `name@inline`이다.
- 환경 확인: mod가 없는 디렉터리에서 `claude plugin test`를 실행한다.
  - `no hooks module to load`: mod를 로드할 수 있음
  - `hooks modules are turned off here`: 설정이나 정책이 막고 있음
  - `hooks modules are turned off in this process`: Anthropic이 원격으로 껐음
- 자주 보는 메시지
  - `hooks module <name> not loaded:` + 사유: 버전, 정책, `--bare`, 이름 충돌 등
  - validate는 통과하는데 `hooks` 줄이 없음: `hooks.json`에 `"modules"`가 빠짐
  - `hooks module did not load:`: 모듈 최상위 코드의 예외 (파일과 줄 번호 표시)
  - `hook skipped:`: 예외, 시간 초과, 잘못된 결과
  - `no command.run hook answered it`: 훅이 없거나, matcher가 다르거나, `next(e)`를 반환함
  - `<mod> was unloaded: it crashed the hooks worker`: await 없는 루프처럼 워커를 막는 코드
  - `... crashed 3 times`: `/reload-plugins` 실행
  - `a hook changed this call's input after the model wrote it`: 자동 모드에서 분류기 검토 이후 입력이 바뀜
  - 가드 메시지: `mods are limited to your organization's by policy (allowManagedModsOnly)`, `tried to lift a deny rule in your settings`
- 증상별 대처
  - Pane이 안 보임: `isPlaced`를 확인하고 터미널 폭을 늘린다.
  - 단축키가 안 먹음: 포커스를 준다 (Ctrl+X → Tab).
  - Desktop에서만 안 됨: 그 렌더링 지점이나 요소를 Desktop이 지원하는지 확인한다.
  - 편집이 반영 안 됨: 캐시된 설치본이 실행 중이다. `--plugin-dir`로 개발한다.
  - `/clear` 후 값이 사라짐: `classic.SessionStart`에서 다시 로드한다.

---

## 14. Claude Code 프로젝트 시작 체크리스트 (공식 절차 기준)

1. `claude --version`이 v2.1.287 이상인지 확인 (reference 문서는 v2.1.289 기준)
2. §3 구조로 디렉터리를 만들고, `hooks.json`에 `"modules"`를 넣는다.
3. `claude --plugin-dir ./<mod>`로 핫 리로드 개발. 또는 세션에서 `/plugin-authoring`을 사용
4. 생성된 `.claude-plugin/types/claude-code/index.d.ts`를 API의 최종 기준으로 삼는다. `tsc -p ./<mod>`로 타입 검사
5. `claude plugin validate ./<mod>`로 정적 규칙(§4)을 검증
6. `*.test.ts`를 작성하고 `claude plugin test`를 CI에서 실행
7. 배포: 마켓플레이스 저장소(`.claude-plugin/marketplace.json`)를 만들고 각 머신에서 `claude plugin marketplace add` → `install`, 이어서 자동 업데이트를 켠다.
8. 참고 코드: 샘플 mod(claude-code-playground)와 내장 mod 소스(claude-code/mods)
