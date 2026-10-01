"""시연용 발표자료를 미리 넣어둔다.

Cloud Run 은 인스턴스가 내려가면 올린 자료가 사라진다. 시연 때마다 다시 올리는 것을
피하려고, 준비가 끝난 발표 한 벌을 `seed/` 에 담아 두고 서버가 켜질 때 제자리로 옮긴다.

`seed/` 의 구조는 실제 폴더와 똑같다.

    seed/uploaded_files/<id>.pdf      원본 (슬라이드 이미지와 강조에 쓴다)
    seed/data/<id>.jsonl              검색 색인
    seed/data/notes/<id>.json         보강 자료
    seed/data/refined/<id>.json       AI 정리본
    seed/data/core/<id>.json          확정한 핵심 답변
    seed/data/practice/<id>.json      만들어 둔 예상 질문
    seed/data/slides/<id>/*.png       슬라이드 이미지

이미 같은 이름의 파일이 있으면 건드리지 않는다. 발표자가 그 자리에서 고친 것을
서버가 다시 켜질 때 덮어쓰면 안 된다.

`seed/` 는 저장소에 올리지 않는다(.gitignore). 발표자료가 공개 저장소에 남는 것을
막으려는 것이다. 대신 `.gcloudignore` 에서 이 폴더만 통과시켜 Cloud Run 이미지에는 들어간다.
"""

from __future__ import annotations

import shutil
from pathlib import Path

SEED = Path("seed")


def place_seed() -> list[str]:
    """seed/ 의 파일을 제자리로 옮긴다. 넣은 발표 id 목록을 돌려준다."""
    if not SEED.is_dir():
        return []

    copied = 0
    for src in SEED.rglob("*"):
        if not src.is_file():
            continue
        dst = Path(*src.parts[1:])          # seed/ 를 떼어낸 경로
        if dst.exists():
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        copied += 1

    ids = sorted(p.stem for p in (SEED / "uploaded_files").glob("*.pdf")) \
        if (SEED / "uploaded_files").is_dir() else []
    if copied:
        print(f"📦 시연용 자료를 넣었습니다 ({copied}개 파일, 발표 {len(ids)}건)")
    return ids
