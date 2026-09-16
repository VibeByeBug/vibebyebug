"""발표자료 -> 슬라이드별 PNG.

글자가 이미지로 깔린 자료는 텍스트 추출이 통하지 않는다(ingest.py 참고).
그런 자료는 슬라이드를 통째로 그림으로 만든 뒤 멀티모달 모델에게 읽힌다.
이 파일은 그 앞단, '그림으로 만들기' 만 담당한다.

경로 두 가지:
  PPTX -> PowerPoint COM (윈도우 + PowerPoint 필요)
  PDF  -> PyMuPDF (의존성 없음, 어디서나 됨)

사용:
    python render.py 발표자료.pptx -o data/slides
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# 멀티모달 모델이 슬라이드 글씨를 읽기에 충분한 해상도.
# 더 키워도 인식률은 거의 안 오르고 토큰만 늘어난다.
WIDTH = 1600
HEIGHT = 900


def from_pptx(path: Path, out_dir: Path) -> list[Path]:
    """PowerPoint COM으로 슬라이드를 PNG로 내보낸다."""
    try:
        import win32com.client
    except ImportError:
        raise RuntimeError(
            "pywin32가 필요합니다: pip install pywin32\n"
            "  (또는 PowerPoint에서 PDF로 저장한 뒤 그 PDF를 넣으세요)"
        )

    ppt = None
    pres = None
    try:
        ppt = win32com.client.Dispatch("PowerPoint.Application")
        # ReadOnly=1: 원본을 절대 건드리지 않는다
        pres = ppt.Presentations.Open(
            str(path.resolve()), ReadOnly=1, Untitled=0, WithWindow=0
        )
        out_dir.mkdir(parents=True, exist_ok=True)
        for i, slide in enumerate(pres.Slides, start=1):
            slide.Export(str((out_dir / f"p{i:03d}.png").resolve()), "PNG", WIDTH, HEIGHT)
    finally:
        if pres is not None:
            pres.Close()
        if ppt is not None:
            ppt.Quit()

    return sorted(out_dir.glob("p*.png"))


def from_pdf(path: Path, out_dir: Path) -> list[Path]:
    """PyMuPDF로 각 쪽을 PNG로 렌더한다."""
    import fitz

    doc = fitz.open(path)
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for i, page in enumerate(doc, start=1):
        # 쪽 크기에 맞춰 목표 너비가 나오도록 확대율 계산
        zoom = WIDTH / page.rect.width
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        target = out_dir / f"p{i:03d}.png"
        pix.save(target)
        paths.append(target)
    doc.close()
    return paths


def render(path: Path, out_dir: Path) -> list[Path]:
    suffix = path.suffix.lower()
    if suffix == ".pptx":
        return from_pptx(path, out_dir)
    if suffix == ".pdf":
        return from_pdf(path, out_dir)
    raise ValueError(f"지원하지 않는 형식: {suffix}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path)
    ap.add_argument("-o", "--output", type=Path, default=Path("data/slides"))
    args = ap.parse_args()

    if not args.input.exists():
        print(f"파일 없음: {args.input}", file=sys.stderr)
        return 1

    try:
        paths = render(args.input, args.output)
    except Exception as e:
        print(f"[렌더 실패] {e}", file=sys.stderr)
        return 3

    total_kb = sum(p.stat().st_size for p in paths) / 1024
    print(f"{args.input.name} -> {args.output}/")
    print(f"  슬라이드 {len(paths)}장, 합계 {total_kb / 1024:.1f}MB "
          f"(장당 평균 {total_kb / max(len(paths), 1):.0f}KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
