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
| `mods/token-weather/` | `claude-code/mods/token-weather/` | `569c5283d9a0a7ee7938df85bb32e4f48cbb8c86` | 입력창 위 밴드에서 다른 mod의 밴드를 그 아래에 이어 그림, `hasSurvey`/`bodyColumns`를 `e.props`에서 읽음, 테스트 추가 |

## johnnyvizz/claude-kit

- 저장소: https://github.com/johnnyvizz/claude-kit
- 라이선스: MIT License, Copyright (c) 2026 johnnyvizz (원문: [`licenses/MIT-johnnyvizz-claude-kit.txt`](licenses/MIT-johnnyvizz-claude-kit.txt))

| 이 저장소 경로 | upstream 경로 | upstream 커밋 | 내용 |
| --- | --- | --- | --- |
| `mods/work-band/hooks/draw.ts` | `plugins/savvy-progress/hooks/register.tsx` | `c871c153ead54ad9547cc717d0f3e5a676c73986` | 점묘 막대, 크랩, 글자 폭 계산, 패널 행 SVG를 차용해 수정 (등급·의상·RTL 제거, 막대 입력을 단계/할 일 기준으로 변경) |
| `mods/work-band/hooks/agents.ts` | `plugins/savvy-progress/hooks/register.tsx` | `c871c153ead54ad9547cc717d0f3e5a676c73986` | 가격표, 비용·컨텍스트 계산, 모델 이름과 포맷 함수를 차용 |
| `mods/work-band/hooks/work-band.tsx` | `plugins/savvy-progress/hooks/register.tsx` | `c871c153ead54ad9547cc717d0f3e5a676c73986` | 서브에이전트 수집 훅(`agent.spawn`, `turn.step`, `turn.complete`)과 패널 렌더 구조를 차용해 수정 |

복사한 mod를 수정하면 "수정 여부" 칸에 변경 내용을 한 줄로 적고, 그 mod의 `.claude-plugin/plugin.json` `version`을 올립니다.
