# mods

이 폴더의 하위 폴더 하나가 mod(플러그인) 하나입니다. 목록, 설치 방법, 개발 방법은 [저장소 README](../README.md)를 보세요.

| mod | 설치 ID | 출처 |
| --- | --- | --- |
| [`blast-radius`](blast-radius/) | `blast-radius@cc-mods` | Anthropic 샘플 (claude-code-playground) |
| [`filetree`](filetree/) | `filetree@cc-mods` | data-goblin/claude-code-filetree (MIT) |
| [`replay-theater`](replay-theater/) | `replay-theater@cc-mods` | Anthropic 샘플 (claude-code-playground) |
| [`token-weather`](token-weather/) | `token-weather@cc-mods` | Anthropic 샘플 (claude-code-playground) |
| [`work-band`](work-band/) | `work-band@cc-mods` | 직접 작성 (johnnyvizz/claude-kit savvy-progress 일부 차용, MIT) |

## Anthropic 샘플 mod의 README에 대해

`blast-radius`, `replay-theater`, `token-weather` 폴더의 README는 [anthropics/claude-code-playground](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods)의 원문을 수정 없이 둔 것입니다. 그래서 두 가지가 이 저장소와 다릅니다.

- README 안의 설치 안내는 upstream 마켓플레이스(`<mod>@claude-code-playground-mods`) 기준입니다. 이 저장소에서는 `<mod>@cc-mods`로 설치합니다. 방법은 [저장소 README의 설치 섹션](../README.md#설치)을 따르세요.
- README의 `../README.md` 링크는 upstream에서는 upstream mod 목록을 가리키고, 이 저장소에서는 이 문서를 가리킵니다.

출처, 커밋, 라이선스는 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)에 있습니다. Anthropic 샘플은 upstream이 밝힌 대로 "Not an official Anthropic product; no support or maintenance is implied"입니다.

## filetree의 README에 대해

`filetree` 폴더의 README도 [data-goblin/claude-code-filetree](https://github.com/data-goblin/claude-code-filetree)의 원문을 수정 없이 둔 것입니다. README의 설치 안내는 upstream 마켓플레이스(`filetree@claude-code-filetree`) 기준이니, 이 저장소에서는 `filetree@cc-mods`로 설치합니다. 같은 mod를 두 마켓플레이스에서 동시에 설치하지 마세요. 출처는 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)에 있습니다.
