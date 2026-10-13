# cc-mods 통합 저장소 (시범: 공식 예시 mod) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `cc-mods`를 Claude Code 플러그인 마켓플레이스 저장소로 만든다. 공식 예시 mod 3개를 수정 없이 복사해 GitHub public 저장소로 배포하고, 이 PC에 설치해 동작을 확인한다.

**Architecture:** 저장소 루트가 마켓플레이스 루트다. `.claude-plugin/marketplace.json`이 `./mods/<name>` 상대 경로로 mod를 나열한다. 각 mod는 독립된 플러그인 폴더로, upstream `anthropics/claude-code-playground` 커밋 `569c528`에서 바이트 단위 그대로 복사한다. 빌드 단계는 없다. Claude Code가 `.mjs` 훅 모듈을 직접 로드한다.

**Tech Stack:** Claude Code 2.1.296 CLI (`claude plugin validate|install|list`, `claude -p --plugin-dir`), git, GitHub CLI `gh`, Git Bash (명령은 모두 Git Bash 문법), Node.js(검증용 one-liner만)

**Spec:** `docs/superpowers/specs/2026-10-13-cc-mods-marketplace-design.md`

## Global Constraints

- Claude Code 버전: 2.1.287 이상 (테스트 기준 2.1.296)
- 마켓플레이스 이름: `cc-mods`. 설치 ID는 `<mod>@cc-mods`
- GitHub 저장소: `StarHawkMK1/cc-mods`, **public**
- upstream: `https://github.com/anthropics/claude-code-playground.git`, 경로 `claude-code/mods/<name>`, 커밋 `569c5283d9a0a7ee7938df85bb32e4f48cbb8c86`, Apache-2.0
- 복사한 mod는 **수정하지 않는다**. `plugin.json` version은 `0.1.0` 그대로 둔다
- 버전 규칙: mod 파일을 바꾸면 그 mod의 `plugin.json` `version`을 반드시 올린다
- marketplace 엔트리에 `version`을 쓰지 않는다
- mod 이름은 `claude-`로 시작할 수 없다
- 저장소 라이선스: Apache-2.0
- public push(Task 6)는 **실행 직전에 사용자에게 명시적으로 확인을 받는다**
- 모든 commit 메시지 끝에 다음 두 줄을 넣는다:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0137dKfj4wdxPDVr9AsyW53f
  ```
- 작업 디렉터리: `C:\dev2\workspace\cc-mods` (Git Bash에서 `/c/dev2/workspace/cc-mods`)
- 임시 파일은 세션 스크래치패드에 둔다. 셸 변수는 명령 호출 사이에 **유지되지 않는다**. 그래서 `$SCRATCH`, `$UP`, `$SHA`, `$T`를 쓰는 명령 블록 앞에는 항상 아래 공통 변수 정의를 붙여 실행한다. `SCRATCH`는 실행하는 세션의 스크래치패드 경로로 바꾼다. 이번 세션 값은 아래와 같다.
  ```bash
  SCRATCH=/c/Users/kjoon/AppData/Local/Temp/claude/C--dev2-workspace-cc-mods/bd936eac-82a8-4878-9b97-c93b4053bf95/scratchpad
  UP="$SCRATCH/upstream-569c528"
  SHA=569c5283d9a0a7ee7938df85bb32e4f48cbb8c86
  T="$SCRATCH/blast-test"
  cd /c/dev2/workspace/cc-mods
  ```

## Review Focus

1. **줄바꿈 변환** (`core.autocrlf=true`): 복사 과정에서 CRLF로 바뀐 파일이 upstream과 다른 내용으로 commit될 수 있다. 기대 동작은 저장소에 들어간 blob이 upstream blob과 해시까지 같은 것이다. → Task 2 Step 5의 blob 해시 비교로 고정한다.
2. **생성물·캐시 유출**: mod를 로드하면 `mods/*/.claude-plugin/types/`가 생성된다. 작업 폴더에는 `graft/` 캐시도 있다. 이것들이 public 저장소에 올라가면 안 된다. → Task 2 Step 7(로드 후 `git status` 깨끗함)과 Task 6 Step 1(`git ls-files` 검사)로 고정한다.
3. **엔트리와 mod 이름 불일치**: marketplace 엔트리의 `name`/`source`가 mod 폴더의 `plugin.json` `name`이나 실제 경로와 어긋나면 설치 ID가 혼란스러워지거나 설치가 실패한다. 기대 동작은 세 값이 모두 일치하는 것이다. → Task 3 Step 4의 Node 검사로 고정한다.
4. **README 설치 명령 오류**: README에 적은 명령이 실제로 동작하지 않으면 다른 PC와 팀원이 막힌다. → Task 7이 README의 셸 설치 명령을 글자 그대로 실행해 검증한다.
5. **사용자 설정 손상**: 설치 명령은 `~/.claude/settings.json`(`enabledPlugins`, `extraKnownMarketplaces`)을 수정한다. 기대 동작은 기존 플러그인 설정을 그대로 두고 `cc-mods` 관련 키만 추가되는 것이다. → Task 7 Step 1의 백업과 Step 5의 diff로 고정한다.

---

## File Structure

| 경로 | 책임 | Task |
|---|---|---|
| `.gitignore` | 생성물(`.claude-plugin/types/`)과 도구 캐시(`graft/`) 제외 | 1 |
| `docs/CLAUDE_MODS_HANDOFF.md` | 기존 참고 문서. 내용 변경 없이 추적만 시작 | 1 |
| `mods/blast-radius/**`, `mods/replay-theater/**`, `mods/token-weather/**` | upstream 복사본 (수정 없음) | 2 |
| `.claude-plugin/marketplace.json` | 마켓플레이스 정의 | 3 |
| `LICENSE`, `licenses/Apache-2.0.txt`, `THIRD_PARTY_NOTICES.md` | 라이선스와 출처 고지 | 4 |
| `README.md` | 저장소 소개, 설치, 개발, 규칙 | 5 |
| `docs/pilot/2026-10-13-official-examples.md` | 시범 결과 기록 | 8 |

---

### Task 1: 저장소 기본 설정 (.gitignore, 기존 문서 추적)

**Files:**
- Create: `.gitignore`
- Track (변경 없음): `docs/CLAUDE_MODS_HANDOFF.md`

**Interfaces:**
- Consumes: 없음 (저장소는 이미 `git init` 되어 있고 `main`에 스펙 commit `6ee91f2`가 있음)
- Produces: `graft/`와 `**/.claude-plugin/types/`를 무시하는 `.gitignore`. 이후 모든 Task가 `git status` 정리를 이 파일에 의존한다

- [ ] **Step 1: 실패 확인 (graft가 아직 추적 후보로 보임)**

```bash
cd /c/dev2/workspace/cc-mods
git status --porcelain
```
Expected: `?? graft/`와 `?? docs/CLAUDE_MODS_HANDOFF.md`가 보인다.

- [ ] **Step 2: `.gitignore` 작성**

```gitignore
# 로컬 도구 캐시 (graft 인덱서 세션/텔레메트리 파일)
graft/

# Claude Code가 mod를 로드할 때마다 생성하는 TypeScript 타입
**/.claude-plugin/types/
```

- [ ] **Step 3: 무시 규칙 검증**

```bash
git check-ignore -v graft/.cache/telemetry-repo-id.json mods/x/.claude-plugin/types/claude-code/index.d.ts
git status --porcelain
```
Expected: 첫 명령은 두 경로 모두 `.gitignore:2:graft/`와 `.gitignore:5:**/.claude-plugin/types/` 규칙을 출력한다. 두 번째 명령은 `?? .gitignore`와 `?? docs/CLAUDE_MODS_HANDOFF.md`만 출력하고 `graft/`는 없다.

- [ ] **Step 4: Commit**

```bash
git add .gitignore docs/CLAUDE_MODS_HANDOFF.md
git commit -q -F - <<'EOF'
chore: add .gitignore and track mods handoff notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0137dKfj4wdxPDVr9AsyW53f
EOF
git status --porcelain
```
Expected: 마지막 명령의 출력이 비어 있다.

---

### Task 2: upstream mod 3개 복사 (바이트 동일성 + 로드 검증)

**Files:**
- Create: `mods/blast-radius/**`, `mods/replay-theater/**`, `mods/token-weather/**` (upstream 26개 파일)

**Interfaces:**
- Consumes: Task 1의 `.gitignore`
- Produces: `mods/<name>/.claude-plugin/plugin.json`(`name`이 폴더명과 같고 `version`은 `"0.1.0"`). Task 3의 marketplace 엔트리가 이 경로와 이름을 참조한다

- [ ] **Step 1: upstream을 고정 커밋으로 새 빈 폴더에 받기**

```bash
SCRATCH=/c/Users/kjoon/AppData/Local/Temp/claude/C--dev2-workspace-cc-mods/bd936eac-82a8-4878-9b97-c93b4053bf95/scratchpad
UP="$SCRATCH/upstream-569c528"
rm -rf "$UP" && mkdir -p "$UP"
git clone -q --filter=blob:none --no-checkout https://github.com/anthropics/claude-code-playground.git "$UP/repo"
git -C "$UP/repo" cat-file -t 569c5283d9a0a7ee7938df85bb32e4f48cbb8c86
```
Expected: `commit`. clone이 2분 넘게 걸리면 `run_in_background`로 돌리고 끝날 때까지 기다린다.

- [ ] **Step 2: 실패하는 동일성 검사부터 실행**

```bash
cd /c/dev2/workspace/cc-mods
SHA=569c5283d9a0a7ee7938df85bb32e4f48cbb8c86
for m in blast-radius replay-theater token-weather; do
  if diff <(git -C "$UP/repo" ls-tree -r "$SHA" "claude-code/mods/$m" | awk '{print $3, substr($4, 18)}') \
          <(git ls-files -s "mods/$m" | awk '{print $2, substr($4, 6)}') >/dev/null; then
    echo "$m IDENTICAL"; else echo "$m DIFFERENT"; fi
done
```
Expected: 세 줄 모두 `DIFFERENT`. 아직 복사하지 않았기 때문이다. (`substr($4,18)`은 `claude-code/mods/`를, `substr($4,6)`은 `mods/`를 떼어 상대 경로끼리 비교한다.)

- [ ] **Step 3: 줄바꿈 변환 없이 복사**

```bash
mkdir -p mods
for m in blast-radius replay-theater token-weather; do
  git -C "$UP/repo" -c core.autocrlf=false archive "$SHA" "claude-code/mods/$m" | tar -x -C mods --strip-components=2
done
find mods -type f | sort
```
Expected: 26개 파일이 나온다. 각 mod마다 `.claude-plugin/plugin.json`, `.gitignore`, `README.md`, `hooks/hooks.json`, `hooks/<name>.mjs`, `screenshots/*.png`이 있다(blast-radius 4장, replay-theater 4장, token-weather 3장). `.claude-plugin/types/`는 없다.

- [ ] **Step 4: mod별 정적 검증**

```bash
for m in blast-radius replay-theater token-weather; do claude plugin validate "mods/$m" 2>&1 | tail -1; done
```
Expected: 세 줄 모두 `✔ Validation passed`.

- [ ] **Step 5: stage 후 동일성 검사 통과 확인**

```bash
git add mods
for m in blast-radius replay-theater token-weather; do
  if diff <(git -C "$UP/repo" ls-tree -r "$SHA" "claude-code/mods/$m" | awk '{print $3, substr($4, 18)}') \
          <(git ls-files -s "mods/$m" | awk '{print $2, substr($4, 6)}'); then
    echo "$m IDENTICAL"; else echo "$m DIFFERENT"; fi
done
```
Expected: 세 줄 모두 `IDENTICAL`. `DIFFERENT`가 나오면 diff 출력에서 해시가 다른 파일을 찾는다. 대개 줄바꿈 변환이 원인이다. Step 3을 `core.autocrlf=false`로 다시 실행했는지 확인하고, 그래도 다르면 멈추고 보고한다.

- [ ] **Step 6: 실제 로드 확인 (비대화형)**

```bash
claude -p "/replay" \
  --plugin-dir ./mods/blast-radius --plugin-dir ./mods/replay-theater --plugin-dir ./mods/token-weather \
  --debug-file "$SCRATCH/load.log" 2>"$SCRATCH/load.stderr"; echo "exit=$?"
grep -oE "hooks module (blast-radius|replay-theater|token-weather)@inline loaded" "$SCRATCH/load.log" | sort -u
grep -iE "not loaded|did not load|refused" "$SCRATCH/load.stderr" "$SCRATCH/load.log" || echo "NO LOAD ERRORS"
```
Expected:
- `exit=0`
- `hooks module blast-radius@inline loaded`, `hooks module replay-theater@inline loaded`, `hooks module token-weather@inline loaded` 세 줄
- `NO LOAD ERRORS`

stdout에는 replay-theater가 `/replay`에 답한 텍스트가 나온다. 이 세션에서 파일 편집이 없었으므로 다시 볼 편집이 없다는 내용이다. 로그 문구가 위 패턴과 다르면 `grep -n "hooks module" "$SCRATCH/load.log"`로 실제 문구를 확인하고, 세 mod 각각에 성공 로드 줄이 있는지로 판정한다.

- [ ] **Step 7: 로드 후 생성물이 추적되지 않는지 확인**

```bash
ls -d mods/*/.claude-plugin/types 2>/dev/null || echo "(types not generated in -p mode)"
git status --porcelain
```
Expected: 첫 명령은 types 폴더 목록이나 안내 문구 중 하나를 출력한다. 두 번째 명령은 Step 5에서 stage한 `A  mods/...` 줄만 출력하고 `??` 줄은 없다.

- [ ] **Step 8: Commit**

```bash
git commit -q -F - <<'EOF'
feat: vendor official example mods from claude-code-playground@569c528

blast-radius, replay-theater and token-weather copied unmodified from
anthropics/claude-code-playground claude-code/mods (Apache-2.0).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0137dKfj4wdxPDVr9AsyW53f
EOF
git status --porcelain
```
Expected: 출력이 비어 있다.

---

### Task 3: marketplace.json

**Files:**
- Create: `.claude-plugin/marketplace.json`

**Interfaces:**
- Consumes: Task 2의 `mods/<name>/.claude-plugin/plugin.json`
- Produces: 마켓플레이스 `cc-mods`, 플러그인 ID `blast-radius@cc-mods`, `replay-theater@cc-mods`, `token-weather@cc-mods`. Task 5 README와 Task 7 설치가 이 ID를 쓴다

- [ ] **Step 1: 실패 확인**

```bash
cd /c/dev2/workspace/cc-mods
claude plugin validate . 2>&1 | tail -3
```
Expected: 실패한다. 마켓플레이스나 플러그인 매니페스트를 찾지 못했다는 오류가 나오고 `✔ Validation passed`는 없다.

- [ ] **Step 2: `marketplace.json` 작성**

`.claude-plugin/marketplace.json`:
```json
{
  "name": "cc-mods",
  "owner": {
    "name": "StarHawkMK1"
  },
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

- [ ] **Step 3: 마켓플레이스 검증 통과 확인**

```bash
claude plugin validate . 2>&1 | tail -3
claude plugin validate . --strict 2>&1 | tail -3
```
Expected: 두 명령 모두 마지막 줄이 `✔ Validation passed`. `--strict`에서 경고 때문에 실패하면 경고 문구를 그대로 기록하고 멈춰서 보고한다. 엔트리를 임의로 바꾸지 않는다.

- [ ] **Step 4: 엔트리, 폴더, plugin.json 일치 검사**

```bash
node -e '
const fs = require("fs"), path = require("path");
const m = JSON.parse(fs.readFileSync(".claude-plugin/marketplace.json", "utf8"));
let ok = m.name === "cc-mods";
for (const p of m.plugins) {
  const pj = JSON.parse(fs.readFileSync(path.join(p.source, ".claude-plugin/plugin.json"), "utf8"));
  const good = p.source === "./mods/" + p.name && pj.name === p.name && !("version" in p) && !p.name.startsWith("claude-");
  console.log(p.name, pj.version, good ? "OK" : "MISMATCH");
  ok = ok && good;
}
process.exit(ok ? 0 : 1);
'; echo "exit=$?"
```
Expected:
```
blast-radius 0.1.0 OK
replay-theater 0.1.0 OK
token-weather 0.1.0 OK
exit=0
```

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/marketplace.json
git commit -q -F - <<'EOF'
feat: add cc-mods marketplace listing the vendored mods

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0137dKfj4wdxPDVr9AsyW53f
EOF
```

---

### Task 4: 라이선스와 출처 고지

**Files:**
- Create: `LICENSE`, `licenses/Apache-2.0.txt`, `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Consumes: Task 2 Step 1의 `$UP/repo` (커밋 `569c528`의 `LICENSE`)
- Produces: README(Task 5)가 링크하는 `LICENSE`, `THIRD_PARTY_NOTICES.md`

- [ ] **Step 1: 실패 확인**

```bash
cd /c/dev2/workspace/cc-mods
for f in LICENSE licenses/Apache-2.0.txt THIRD_PARTY_NOTICES.md; do test -f "$f" && echo "$f present" || echo "$f MISSING"; done
```
Expected: 세 줄 모두 `MISSING`.

- [ ] **Step 2: Apache-2.0 원문 복사 (upstream 파일 그대로)**

```bash
mkdir -p licenses
git -C "$UP/repo" -c core.autocrlf=false show 569c5283d9a0a7ee7938df85bb32e4f48cbb8c86:LICENSE > licenses/Apache-2.0.txt
cp licenses/Apache-2.0.txt LICENSE
```
`LICENSE`는 이 저장소 자체의 라이선스다. upstream과 같은 Apache-2.0 원문을 쓴다. 원문 끝 appendix의 `Copyright [yyyy] [name of copyright owner]` 템플릿 문구는 원문 그대로 둔다(라이선스 본문의 일부다).

- [ ] **Step 3: `THIRD_PARTY_NOTICES.md` 작성**

```markdown
# Third-party notices

이 저장소의 `mods/` 아래 일부 mod는 다른 저장소에서 복사한 것입니다. 복사한 mod는 원래 라이선스를 따릅니다.

## anthropics/claude-code-playground

- 저장소: https://github.com/anthropics/claude-code-playground
- 라이선스: Apache License 2.0 (원문: [`licenses/Apache-2.0.txt`](licenses/Apache-2.0.txt))
- upstream 고지: "Shared as-is as part of claude-code-playground. Not an official Anthropic product; no support or maintenance is implied."

| 이 저장소 경로 | upstream 경로 | upstream 커밋 | 수정 여부 |
| --- | --- | --- | --- |
| `mods/blast-radius/` | `claude-code/mods/blast-radius/` | `569c5283d9a0a7ee7938df85bb32e4f48cbb8c86` | 수정 없음 |
| `mods/replay-theater/` | `claude-code/mods/replay-theater/` | `569c5283d9a0a7ee7938df85bb32e4f48cbb8c86` | 수정 없음 |
| `mods/token-weather/` | `claude-code/mods/token-weather/` | `569c5283d9a0a7ee7938df85bb32e4f48cbb8c86` | 수정 없음 |

복사한 mod를 수정하면 "수정 여부" 칸에 변경 내용을 한 줄로 적고, 그 mod의 `.claude-plugin/plugin.json` `version`을 올립니다.
```

- [ ] **Step 4: 검증**

```bash
for f in LICENSE licenses/Apache-2.0.txt THIRD_PARTY_NOTICES.md; do test -s "$f" && echo "$f present" || echo "$f MISSING"; done
head -2 LICENSE | tail -1 | tr -s ' '
cmp LICENSE licenses/Apache-2.0.txt && echo "LICENSE == Apache-2.0.txt"
grep -c "569c5283d9a0a7ee7938df85bb32e4f48cbb8c86" THIRD_PARTY_NOTICES.md
```
Expected: 세 파일 모두 `present`. 그다음 ` Apache License`, `LICENSE == Apache-2.0.txt`, `3`이 출력된다.

- [ ] **Step 5: Commit**

```bash
git add LICENSE licenses/Apache-2.0.txt THIRD_PARTY_NOTICES.md
git commit -q -F - <<'EOF'
docs: add Apache-2.0 license and third-party notices

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0137dKfj4wdxPDVr9AsyW53f
EOF
```

---

### Task 5: README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: Task 3의 플러그인 ID, Task 4의 `LICENSE`/`THIRD_PARTY_NOTICES.md`
- Produces: Task 7이 글자 그대로 실행할 셸 설치 명령 `claude plugin install replay-theater --marketplace StarHawkMK1/cc-mods`

- [ ] **Step 1: 실패 확인**

```bash
cd /c/dev2/workspace/cc-mods
test -f README.md && echo present || echo MISSING
```
Expected: `MISSING`

- [ ] **Step 2: `README.md` 작성**

````markdown
# cc-mods

Claude Code [mods](https://code.claude.com/docs/en/plugins/mods/overview)를 모아 두는 저장소입니다. 이 저장소 자체가 Claude Code 플러그인 마켓플레이스(`cc-mods`)라서, mod를 한 줄로 설치하고 자동 업데이트로 받을 수 있습니다.

- 요구 버전: Claude Code **2.1.287 이상** (테스트: 2.1.296, Windows 11 / Git Bash)
- mod는 샌드박스 없이 **사용자 권한으로** 실행됩니다. 설치 전에 아래 [보안](#보안)을 읽어 주세요.

## mod 목록

| mod | 하는 일 | 출처 |
| --- | --- | --- |
| [`blast-radius`](mods/blast-radius/) | `rm -rf`, `git reset --hard`, 강제 푸시 같은 위험한 셸 명령을 보류하고, 무엇이 바뀌는지 보여 준 뒤 진행/취소 버튼을 띄웁니다. Bash 도구 호출만 감시합니다. | 공식 예시 |
| [`replay-theater`](mods/replay-theater/) | `/replay`: 마지막 턴에 Claude가 한 파일 편집을 diff 단위로 다시 봅니다. | 공식 예시 |
| [`token-weather`](mods/token-weather/) | 프롬프트 위에 컨텍스트 윈도우 사용량을 날씨 아이콘과 그래프로 보여 줍니다. | 공식 예시 |

"공식 예시"는 [anthropics/claude-code-playground](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods)에서 수정 없이 복사한 mod입니다. 자세한 출처는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있습니다.

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
claude plugin install replay-theater --marketplace StarHawkMK1/cc-mods
claude plugin install blast-radius@cc-mods --scope user
claude plugin install token-weather@cc-mods --scope user
```

첫 줄이 마켓플레이스 추가와 설치를 함께 합니다. 이미 열려 있는 세션에서는 `/reload-plugins`를 실행해야 반영됩니다.

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

### 새 mod 추가 규칙

1. `mods/<name>/`에 만듭니다. 최소 구성은 `.claude-plugin/plugin.json`, `hooks/hooks.json`(`"modules": ["./<file>.mjs"]`), 훅 모듈 파일입니다.
2. `name`은 `claude-`로 시작할 수 없습니다.
3. `.claude-plugin/marketplace.json`의 `plugins`에 `{ "name": "<name>", "source": "./mods/<name>", "description": "..." }`를 추가합니다. 엔트리에는 `version`을 쓰지 않습니다.
4. `claude plugin validate .`가 통과해야 합니다.

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
````

- [ ] **Step 3: 링크와 명령 검증**

```bash
for p in mods/blast-radius mods/replay-theater mods/token-weather THIRD_PARTY_NOTICES.md LICENSE; do test -e "$p" && echo "$p ok" || echo "$p BROKEN"; done
grep -c "claude plugin install replay-theater --marketplace StarHawkMK1/cc-mods" README.md
grep -oE "[a-z-]+@cc-mods" README.md | sort -u
```
Expected: 다섯 줄 모두 `ok`. 그다음 `1`. 마지막으로 `blast-radius@cc-mods`와 `token-weather@cc-mods` 두 줄만 출력된다(`<mod>@cc-mods`는 `>` 때문에 잡히지 않는다). marketplace.json에 없는 이름이 나오면 README를 고친다.

- [ ] **Step 4: 마켓플레이스 재검증 후 Commit**

```bash
claude plugin validate . 2>&1 | tail -1
git add README.md
git commit -q -F - <<'EOF'
docs: add README with install, dev loop and versioning rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0137dKfj4wdxPDVr9AsyW53f
EOF
```
Expected: `✔ Validation passed`

---

### Task 6: GitHub public 저장소 생성과 push (사용자 확인 필수)

**Files:** 없음 (원격 생성과 push)

**Interfaces:**
- Consumes: Task 1~5의 commit
- Produces: `https://github.com/StarHawkMK1/cc-mods` (public, 기본 브랜치 `main`). Task 7이 `StarHawkMK1/cc-mods` 소스로 설치한다

- [ ] **Step 1: 공개 전 검사 (유출 방지)**

```bash
cd /c/dev2/workspace/cc-mods
git status --porcelain
git ls-files | grep -E '^graft/|/\.claude-plugin/types/' || echo "NO CACHE OR GENERATED FILES TRACKED"
git ls-files | wc -l
gh repo view StarHawkMK1/cc-mods 2>&1 | head -1
```
Expected:
- `git status` 출력이 비어 있다
- `NO CACHE OR GENERATED FILES TRACKED`
- 추적 파일 수는 35개다: 스펙 1, 계획 1, handoff 1, `.gitignore` 1, mod 26, marketplace 1, 라이선스 관련 3(`LICENSE`, `licenses/Apache-2.0.txt`, `THIRD_PARTY_NOTICES.md`), README 1. 수가 다르면 `git ls-files`로 무엇이 더 있거나 빠졌는지 확인하고 보고한다
- `gh repo view`는 `Could not resolve to a Repository`를 출력한다(아직 없음)

- [ ] **Step 2: 사용자 확인 (STOP)**

다음을 사용자에게 보여 주고 **명시적인 승인을 받기 전에는 진행하지 않는다.**
- 만들 저장소: `StarHawkMK1/cc-mods`, **public**
- 올라갈 내용: `git ls-files` 목록 (Step 1 출력)
- 되돌리기: `gh repo delete StarHawkMK1/cc-mods`로 지울 수 있지만, 공개된 동안 복제나 캐시가 생길 수 있다

- [ ] **Step 3: 생성과 push**

```bash
gh repo create StarHawkMK1/cc-mods --public \
  --description "Custom Claude Code mods marketplace (cc-mods), with vendored official examples" \
  --source . --remote origin --push
```
Expected: 저장소 URL이 출력되고 `main`이 push된다.

- [ ] **Step 4: 원격 검증**

```bash
git ls-remote origin main | cut -c1-40
git rev-parse HEAD
gh api repos/StarHawkMK1/cc-mods --jq '.visibility + " " + .default_branch'
gh api repos/StarHawkMK1/cc-mods/contents/.claude-plugin/marketplace.json --jq '.name'
```
Expected: 처음 두 줄의 해시가 같다. 그다음 `public main`, `marketplace.json`이 출력된다.

---

### Task 7: 이 PC에 설치 (README 명령 그대로)

**Files:** 저장소 변경 없음. 사용자 설정 `~/.claude/settings.json`이 Claude Code CLI에 의해 수정된다.

**Interfaces:**
- Consumes: Task 6의 GitHub 저장소, Task 5 README의 셸 설치 명령
- Produces: 설치 ID `blast-radius@cc-mods`, `replay-theater@cc-mods`, `token-weather@cc-mods` (user scope, enabled)

- [ ] **Step 1: 설정 백업**

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.bak-20261013-ccmods
ls -l ~/.claude/settings.json.bak-20261013-ccmods
```

- [ ] **Step 2: 설치 전 상태 확인 (실패 확인)**

```bash
claude plugin list 2>&1 | grep -c "@cc-mods"
```
Expected: `0`

- [ ] **Step 3: README의 셸 설치 명령을 글자 그대로 실행**

```bash
claude plugin install replay-theater --marketplace StarHawkMK1/cc-mods
claude plugin install blast-radius@cc-mods --scope user
claude plugin install token-weather@cc-mods --scope user
```
Expected:
- 첫 명령이 `Successfully added marketplace: cc-mods (declared in user settings)`를 출력한 뒤 설치한다
- 세 명령 모두 `Successfully installed plugin: <mod>@cc-mods (scope: user)`를 출력한다

첫 명령이 실패하면 README의 명령이 틀린 것이다. 오류를 기록하고 멈춰서 보고한다. README는 실제로 동작하는 명령으로 고친 뒤 다시 실행한다.

- [ ] **Step 4: 설치 상태 검증 (완료 기준 9a)**

```bash
claude plugin marketplace list 2>&1 | grep -A1 "cc-mods"
claude plugin list 2>&1 | grep -A4 "@cc-mods"
```
Expected:
- 마켓플레이스: `cc-mods` / `Source: GitHub (StarHawkMK1/cc-mods)`
- 플러그인 세 개가 각각 `Version: 0.1.0`, `Scope: user`, enabled 상태로 나온다

- [ ] **Step 5: 기존 설정 보존 확인**

```bash
node -e '
const fs = require("fs"), path = require("path"), home = require("os").homedir();
const a = JSON.parse(fs.readFileSync(path.join(home, ".claude/settings.json.bak-20261013-ccmods"), "utf8"));
const b = JSON.parse(fs.readFileSync(path.join(home, ".claude/settings.json"), "utf8"));
const keys = (o) => Object.keys(o || {});
const lost = keys(a.enabledPlugins).filter(k => b.enabledPlugins[k] !== a.enabledPlugins[k]);
const added = keys(b.enabledPlugins).filter(k => !(k in a.enabledPlugins));
const mktAdded = keys(b.extraKnownMarketplaces).filter(k => !(k in (a.extraKnownMarketplaces || {})));
console.log("changed-or-lost:", lost.length ? lost : "none");
console.log("added plugins:", added);
console.log("added marketplaces:", mktAdded);
'
```
Expected:
```
changed-or-lost: none
added plugins: [ 'replay-theater@cc-mods', 'blast-radius@cc-mods', 'token-weather@cc-mods' ]
added marketplaces: [ 'cc-mods' ]
```
(배열 순서는 달라도 된다.) `changed-or-lost`가 `none`이 아니면 멈추고, 백업에서 해당 키를 복구할지 사용자에게 묻는다.

- [ ] **Step 6: 사용자에게 자동 업데이트 켜기 요청**

다음을 사용자에게 안내한다(UI 조작이라 에이전트가 할 수 없다): 새 `ccd` 세션에서 `/plugin` → **Marketplaces** → `cc-mods` → **Enable auto-update**.

확인:
```bash
node -e 'const k=JSON.parse(require("fs").readFileSync(require("path").join(require("os").homedir(),".claude/plugins/known_marketplaces.json"),"utf8")); console.log(JSON.stringify(k["cc-mods"] && {source:k["cc-mods"].source, autoUpdate:k["cc-mods"].autoUpdate}))'
```
Expected: 사용자가 켠 뒤 `"autoUpdate":true`가 포함된다. 이 파일 구조가 예상과 다르면 출력 전체를 기록하고, 사용자의 화면 확인으로 판정한다.

---

### Task 8: 동작 확인 체크리스트와 시범 결과 기록

**Files:**
- Create: `docs/pilot/2026-10-13-official-examples.md`

**Interfaces:**
- Consumes: Task 7의 설치 상태, 사용자가 수행한 확인 결과
- Produces: 시범 결과 문서. 이후 커스텀 mod 브레인스토밍의 입력이 된다

- [ ] **Step 1: blast-radius 확인용 임시 저장소 준비**

```bash
T="$SCRATCH/blast-test"
rm -rf "$T" && mkdir -p "$T/build" && cd "$T"
git init -q && echo keep > build/a.txt && echo tracked > tracked.txt && git add . && git -c user.name=t -c user.email=t@t commit -q -m init
echo "changed" >> tracked.txt
echo "$T"; ls build
```
Expected: 경로와 `a.txt`가 출력된다. 이 폴더는 9e와 9f에서 쓴다.

- [ ] **Step 2: 사용자에게 체크리스트 전달 (STOP, 결과 대기)**

다음 표를 사용자에게 그대로 보여 주고, 항목별 결과(통과/실패와 화면에 보인 내용)를 받는다. 9e와 9f는 Git Bash에서 Step 1의 `$T` 폴더로 이동한 뒤 `ccd`로 실행한다.

| # | 하는 일 | 통과 기준 |
|---|---|---|
| 9b | `ccd`로 새 세션 → `/plugin` | 흐린 줄에 `3 mods active` |
| 9c | 아무 질문 하나 보내기 | 응답 후 프롬프트 위에 날씨 아이콘과 % 표시 |
| 9d | "README.md 첫 줄 끝에 ' (test)'를 붙여줘"처럼 파일 편집 요청 → 끝나면 `/replay` | Pane이 열리고 Prev/Next로 diff를 넘길 수 있음 (확인 후 편집은 되돌림) |
| 9e | `$T` 폴더에서 "Bash 도구로 `rm -rf build` 실행해줘" | 명령이 보류되고 Pane/Band에 영향 범위 표시. Cancel → `build/` 유지. 다시 요청 후 Proceed → 삭제됨. 무조건 거부되거나 오류가 나면 그 문구를 그대로 기록 |
| 9f | `$T`에 `build/`를 다시 만들고 "PowerShell 도구로 `Remove-Item -Recurse -Force build` 실행해줘" | 보류되지 않는 것이 예상 결과(Bash만 감시). 실제 결과를 기록 |
| 10 | `/plugin` → Installed → `token-weather`에서 Space로 끄기 → `/reload-plugins` → 질문 하나 | 날씨 표시가 사라짐. 다시 Space로 켜고 `/reload-plugins` → 다음 응답 후 다시 나타남 |

- [ ] **Step 3: 결과 문서 작성**

`docs/pilot/2026-10-13-official-examples.md`를 아래 구조로 작성한다. `<...>` 칸은 Task 7 출력과 Step 2에서 받은 **실제 결과**로 채운다. 결과를 받지 못한 항목은 "미확인"으로 적고 이유를 한 줄 남긴다.

```markdown
# 시범 결과: 공식 예시 mod 적용 (2026-10-13)

- 환경: Claude Code 2.1.296, Windows 11, Git Bash에서 `ccd`(`claude --dangerously-skip-permissions`) 실행
- 설치 소스: GitHub `StarHawkMK1/cc-mods` @ `<push된 커밋 해시 7자리>`
- 설계: [스펙](../superpowers/specs/2026-10-13-cc-mods-marketplace-design.md)

## 결과

| # | 항목 | 결과 | 관찰 내용 |
| --- | --- | --- | --- |
| 9a | `claude plugin list` | <통과/실패> | <버전, scope, 상태> |
| 9b | `/plugin` mods active | <통과/실패> | <표시된 문구> |
| 9c | token-weather | <통과/실패> | <표시 모양> |
| 9d | replay-theater `/replay` | <통과/실패> | <Pane 동작> |
| 9e | blast-radius (Bash) | <기록> | <보류 여부, Cancel/Proceed 결과, 오류 문구> |
| 9f | blast-radius (PowerShell) | <기록> | <보류 여부> |
| 10 | Installed 탭 on/off | <통과/실패> | <관찰> |

## 발견 사항

- <예상과 다른 점, Windows 관련 동작, 설치 과정에서 막힌 점. 없으면 "없음">

## 커스텀 mod 후보

- 설치 도우미 스킬 (`cc-mods-setup`): 체크박스 질문으로 설치할 mod를 고르고 `claude plugin install`을 대신 실행
- 설치 관리자 mod: Pane에 mod 목록과 설치/해제 버튼
- <시범을 해 보며 사용자가 떠올린 후보>
```

- [ ] **Step 4: 완료 기준 판정**

9a, 9b, 9c, 9d, 10이 모두 "통과"이고, 9e와 9f가 "기록"으로 채워졌는지 확인한다. 하나라도 실패하면 문서에 실패 내용을 남긴 채로 commit하고, 사용자에게 완료 기준 미충족을 보고한다. 이 경우 실패를 숨기거나 "통과"로 적지 않는다.

- [ ] **Step 5: Commit과 push**

```bash
cd /c/dev2/workspace/cc-mods
git add docs/pilot/2026-10-13-official-examples.md
git commit -q -F - <<'EOF'
docs: record pilot results for official example mods

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0137dKfj4wdxPDVr9AsyW53f
EOF
git push -q origin main
git status -sb | head -1
```
Expected: `## main...origin/main` (앞서거나 뒤처진 표시 없음)

- [ ] **Step 6: 정리**

```bash
rm -rf "$SCRATCH/blast-test"
```
설정 백업 `~/.claude/settings.json.bak-20261013-ccmods`는 지우지 않는다. 사용자에게 백업 위치를 알린다.
