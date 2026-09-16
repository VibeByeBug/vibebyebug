"""발표자료 -> chunks.jsonl. 글자 추출이 안 되는 슬라이드는 이미지로 읽는다.

업로드된 자료가 어떤 모양인지 서버는 미리 모른다. 그래서 순서를 정해둔다.

  1. 글자 추출(ingest.py)을 먼저 한다. API 호출 0회.
  2. 글자가 없거나 너무 적은 슬라이드만 골라낸다(quality_report.MIN_LETTERS 기준).
  3. 그 슬라이드만 그림으로 만들고(render.py) 멀티모달 모델로 읽는다(caption.py).
  4. 두 결과를 같은 형식으로 합친다.

글자가 다 있는 자료는 1번에서 끝난다. 전부 이미지인 자료는 모든 장을 읽는다.
섞인 자료는 모자란 장만 읽어서 호출 수를 아낀다.

이미지로 못 읽어도 예외를 던지지 않는다. 키가 없거나 하루 한도가 떨어져도
글자로 뽑은 슬라이드는 살리고, 못 읽은 슬라이드 번호와 이유를 결과에 담는다.
서버가 그걸 보고 발표자에게 알리면 된다.

코드에서:
    from build_chunks import build
    result = build("발표.pdf")
    result["rows"]        # ingest() 와 같은 형식의 청크 목록
    result["unreadable"]  # 끝내 못 읽은 슬라이드 번호
    result["reason"]      # 못 읽은 이유 (없으면 None)

명령줄:
    python build_chunks.py 발표.pdf -o data/chunks.jsonl
    python build_chunks.py 발표.pptx --dry-run      # 호출 없이 몇 회 필요한지만

종료 코드: 0 전부 읽음 / 1 파일 없음 / 3 한 장도 못 읽음 / 4 일부만 읽음
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import caption
import render
from ingest import NoTextError, ingest
from quality_report import MIN_LETTERS, letters

NOTE_MARK = "\n\n[노트] "

# 못 읽은 이유. 서버가 화면 문구를 고를 때 쓴다.
MESSAGES = {
    "no_api_key": "이미지 인식에 쓸 API 키가 없습니다. ai/.env 에 GEMINI_API_KEY 를 넣어야 합니다.",
    "daily_quota": "이미지 인식 API 의 하루 사용량을 다 썼습니다. 내일 다시 올리면 나머지를 읽습니다.",
    "call_limit": "한 번에 읽을 수 있는 장수를 넘었습니다. 나머지 슬라이드는 읽지 않았습니다.",
    "render_failed": "슬라이드를 이미지로 바꾸지 못했습니다. PPTX 는 PowerPoint 가 있어야 하니 PDF 로 저장해서 올리면 됩니다.",
    "caption_error": "일부 슬라이드를 이미지로 읽는 중 오류가 났습니다. 다시 올리면 성공한 장은 건너뜁니다.",
}


def _page_count(path: Path) -> int:
    if path.suffix.lower() == ".pdf":
        import fitz
        with fitz.open(path) as doc:
            return doc.page_count
    from pptx import Presentation
    return len(Presentation(path).slides)


def _split_notes(body: str) -> tuple[str, str]:
    text, _, notes = body.partition(NOTE_MARK)
    return text, notes


def _is_quota(err: Exception) -> bool:
    return "PerDay" in str(err)


def build(path: Path | str, slides_dir: Path | str | None = None,
          provider: str | None = None, model: str | None = None,
          max_calls: int | None = None, workers: int = 2,
          dry_run: bool = False) -> dict:
    """발표자료 하나를 청크로 만든다. 결과는 dict 하나로 돌려준다.

    slides_dir  슬라이드 이미지와 캡션 캐시를 둘 곳. 기본은 자료 옆 "<이름>_slides".
                같은 곳을 다시 쓰면 이미 읽은 장은 호출하지 않는다.
    max_calls   이번에 쓸 API 호출 상한. 캐시에서 꺼낸 장은 세지 않는다.
    dry_run     그림만 만들고 호출은 하지 않는다. calls_needed 로 필요한 횟수를 본다.

    ValueError(지원하지 않는 형식)와 파일을 못 여는 오류는 그대로 올린다.
    """
    path = Path(path)
    if path.suffix.lower() not in (".pdf", ".pptx"):
        raise ValueError(f"지원하지 않는 형식: {path.suffix} (.pdf 또는 .pptx만)")

    try:
        text_rows = ingest(path)
    except NoTextError:
        text_rows = []

    total = _page_count(path)
    by_page = {r["page"]: r for r in text_rows}
    # 노트는 글자 수에서 뺀다. 슬라이드 본문이 이미지인데 노트만 있는 경우가 흔하다.
    need = [p for p in range(1, total + 1)
            if letters(_split_notes(by_page.get(p, {}).get("text", ""))[0]) < MIN_LETTERS]

    result = {
        "rows": text_rows,
        "method": "text",
        "pages": total,
        "captioned": [],
        "unreadable": [],
        "reason": None,
        "message": "",
        "calls": 0,
        "calls_needed": 0,
    }
    if not need:
        return result

    def finish(rows, captioned, unreadable, reason):
        rows = sorted(rows, key=lambda r: r["page"])
        result.update(rows=rows, captioned=sorted(captioned), unreadable=sorted(unreadable),
                      reason=reason, message=MESSAGES.get(reason, ""))
        if captioned:
            result["method"] = "image" if len(captioned) == total else "mixed"
        return result

    # 글자가 조금 있던 장은 캡션이 안 되면 그 글자라도 남긴다
    def fallback_rows(pages):
        return [by_page[p] for p in pages if p in by_page]

    keep = [r for p, r in by_page.items() if p not in need]

    provider = provider or caption.detect_provider()
    if provider is None and not dry_run:
        return finish(keep + fallback_rows(need), [], need, "no_api_key")

    slides_dir = Path(slides_dir) if slides_dir else path.with_name(f"{path.stem}_slides")
    try:
        images = render.render(path, slides_dir)
    except Exception:
        return finish(keep + fallback_rows(need), [], need, "render_failed")
    image_of = {int(p.stem[1:]): p for p in images}

    model = model or (caption.PROVIDERS[provider][1] if provider else "")
    cache_dir = slides_dir / ".cache"

    def cached(p):
        return provider and (cache_dir / f"{caption._cache_key(image_of[p], provider, model)}.txt").exists()

    todo = [p for p in need if p in image_of]
    uncached = [p for p in todo if not cached(p)]
    result["calls_needed"] = len(uncached)
    if dry_run:
        return finish(text_rows, [], [], None)

    # 상한을 넘는 장은 앞에서부터 자른다. 캐시에 있는 장은 공짜라 항상 읽는다.
    over = set(uncached[max_calls:]) if max_calls is not None else set()
    todo = [p for p in todo if p not in over]

    stop = threading.Event()
    lock = threading.Lock()
    errors: dict[int, str] = {}

    def work(p):
        if stop.is_set():
            errors[p] = "daily_quota"
            return p, None
        was_cached = cached(p)
        try:
            text = caption.caption_one(image_of[p], provider, model, cache_dir)
        except Exception as e:
            if _is_quota(e):
                stop.set()
                errors[p] = "daily_quota"
            else:
                errors[p] = "caption_error"
            return p, None
        finally:
            if not was_cached:
                with lock:
                    result["calls"] += 1
        if not text.strip():
            errors[p] = "caption_error"
            return p, None
        return p, text.strip()

    captioned, rows = [], list(keep)
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for p, text in ex.map(work, todo):
            if text is None:
                continue
            _, notes = _split_notes(by_page.get(p, {}).get("text", ""))
            body = f"{text}{NOTE_MARK}{notes}" if notes else text
            rows.append({
                "id": f"{path.stem}#p{p}",
                "source": path.name,
                "page": p,
                "text": body,
                "n_chars": len(body),
                "origin": "caption",
            })
            captioned.append(p)

    failed = [p for p in need if p not in captioned]
    rows += fallback_rows(failed)
    # 이유가 여럿이면 발표자가 손쓸 수 있는 것부터 알린다
    reasons = set(errors.values()) | ({"call_limit"} if over else set())
    if len(image_of) < total:
        reasons.add("render_failed")
    reason = next((r for r in ("daily_quota", "call_limit", "render_failed", "caption_error")
                   if r in reasons), None) if failed else None
    return finish(rows, captioned, failed, reason)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path)
    ap.add_argument("-o", "--output", type=Path, default=Path("data/chunks.jsonl"))
    ap.add_argument("--slides-dir", type=Path, default=None)
    ap.add_argument("--provider", choices=list(caption.PROVIDERS), default=None)
    ap.add_argument("--model", default=None)
    ap.add_argument("--max-calls", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    if not a.input.exists():
        print(f"파일 없음: {a.input}", file=sys.stderr)
        return 1

    r = build(a.input, a.slides_dir, a.provider, a.model, a.max_calls, dry_run=a.dry_run)

    if a.dry_run:
        print(f"{a.input.name}: {r['pages']}장, 글자로 읽힘 {len(r['rows'])}장")
        print(f"  이미지로 읽어야 할 API 호출 {r['calls_needed']}회 (캐시 제외)")
        return 0

    a.output.parent.mkdir(parents=True, exist_ok=True)
    with a.output.open("w", encoding="utf-8") as f:
        for row in r["rows"]:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"{a.input.name} -> {a.output}")
    print(f"  방식 {r['method']}, {r['pages']}장 중 {len(r['rows'])}장 저장, API 호출 {r['calls']}회")
    if r["captioned"]:
        print(f"  이미지로 읽은 장: {r['captioned']}")
    if r["unreadable"]:
        print(f"  못 읽은 장: {r['unreadable']}", file=sys.stderr)
        print(f"  {r['message']}", file=sys.stderr)
    if not r["rows"]:
        return 3
    return 4 if r["unreadable"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
