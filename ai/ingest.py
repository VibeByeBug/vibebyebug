"""발표자료(PDF/PPTX) -> 슬라이드 단위 청크 JSONL.

청크 단위를 '슬라이드'로 고정한 이유:
Ready-Q가 발표자에게 내놓는 산출물이 '키워드 + 슬라이드 출처'다.
인용 단위가 곧 슬라이드이므로, 그보다 잘게 쪼개면 검색은 나아질지 몰라도
"몇 번 슬라이드" 를 되돌려줄 수 없게 된다. 검색 단위 = 인용 단위.

사용:
    python ingest.py <파일.pdf|파일.pptx> [-o data/chunks.jsonl]

종료 코드: 0 정상 / 1 파일 없음 / 3 추출 실패(텍스트 0건)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from pptx.enum.shapes import MSO_SHAPE_TYPE


class NoTextError(RuntimeError):
    """추출 가능한 텍스트가 전혀 없는 자료. 조용히 0건으로 넘기면 안 된다."""


def _clean(text: str) -> str:
    """줄바꿈/공백 정리. 슬라이드 텍스트는 레이아웃 때문에 공백이 지저분하다."""
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def from_pdf(path: Path) -> list[dict]:
    import fitz  # PyMuPDF

    doc = fitz.open(path)
    chunks = []
    for i, page in enumerate(doc, start=1):
        chunks.append({"page": i, "text": _clean(page.get_text()), "notes": ""})
    # 묶음 경계는 공백이 빠진 자료에만 필요하다. 읽는 데 장당 0.1초가 들어서 필요할 때만 구한다.
    if needs_spacing("\n".join(c["text"] for c in chunks)):
        for c, page in zip(chunks, doc):
            c["bounds"] = _run_bounds(page, c["text"])
    doc.close()

    if not any(c["text"] for c in chunks):
        raise NoTextError(
            f"{path.name}: {len(chunks)}쪽에서 텍스트를 한 글자도 못 찾았습니다. "
            "스캔본이거나 글자가 이미지로 깔린 PDF입니다."
        )
    return [c for c in chunks if c["text"]]


def _run_bounds(page, text: str) -> set[int] | None:
    """PDF 안 글자 묶음이 끝나는 자리. 공백을 뺀 글자 수로 센다.

    PowerPoint 는 글자를 단어 비슷한 묶음으로 나눠 적는다 ("구독|500|명으로|운영").
    원래 공백은 이 경계에만 있을 수 있다. 분석기가 넣자는 공백 중 경계가 아닌 것은
    틀린 것이라 버린다. 이게 없으면 "민서정" 이 "민 서정", "미들웨어" 가 "미들 웨어" 가 된다.
    묶음을 이어 붙인 글자가 본문과 안 맞으면 None (경계 없이 분석기만 쓴다).
    """
    flat = "".join(ch for ch in text if not ch.isspace())
    bounds, n = set(), 0
    # rawdict(글자 단위)는 dict 보다 3배 느리다. 묶음 글자만 필요하니 dict 로 충분하다.
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            run = "".join(ch for s in line["spans"] for ch in s["text"] if not ch.isspace())
            if not run:
                continue
            if flat[n:n + len(run)] != run:
                return None
            n += len(run)
            bounds.add(n)
    return bounds if n == len(flat) else None


def _walk(shapes):
    """도형을 재귀 순회. 그룹 안에 텍스트가 든 자료가 흔해서 반드시 파고들어야 한다."""
    for shape in shapes:
        yield shape
        if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
            yield from _walk(shape.shapes)


def from_pptx(path: Path) -> list[dict]:
    from pptx import Presentation

    prs = Presentation(path)
    chunks = []
    n_picture = 0

    for i, slide in enumerate(prs.slides, start=1):
        parts = []
        for shape in _walk(slide.shapes):
            if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                n_picture += 1
            if shape.has_text_frame and shape.text_frame.text.strip():
                parts.append(shape.text_frame.text)
            # 표는 발표자료에서 수치 근거가 가장 많이 사는 곳이라 반드시 긁는다
            if getattr(shape, "has_table", False) and shape.has_table:
                for row in shape.table.rows:
                    parts.append(" | ".join(c.text for c in row.cells))

        # 발표자 노트: 청중에겐 안 보이지만 백데이터가 여기 있는 경우가 많다
        notes = ""
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame is not None:
            notes = slide.notes_slide.notes_text_frame.text.strip()

        chunks.append({"page": i, "text": _clean("\n".join(parts)), "notes": _clean(notes)})

    kept = [c for c in chunks if c["text"] or c["notes"]]
    if not kept:
        raise NoTextError(
            f"{path.name}: 슬라이드 {len(chunks)}장에서 텍스트를 한 글자도 못 찾았습니다 "
            f"(그림 도형 {n_picture}개).\n"
            "  디자인 툴에서 이미지로 내보낸 자료입니다. 텍스트 추출로는 검색이 불가능하므로,\n"
            "  슬라이드를 이미지로 렌더해 멀티모달 캡션 경로를 써야 합니다."
        )
    return kept


# ── 띄어쓰기 복원 ─────────────────────────────────────────────────────
# PowerPoint 에서 PDF 로 저장한 한글 자료 중에 공백이 통째로 빠지는 것이 있다.
#   "구독500 명으로운영BEP,"  "1회용응시링크와지원자별리포트,"
# 글자 위치를 재봐도 단어 사이 간격이 0 이거나 겹쳐서 위치로는 되살릴 수 없었다.
# 형태소 분석기(kiwipiepy, 키워드 추출에 이미 쓰는 것)로 띄어쓰기를 다시 넣는다.
#   "구독 500명으로 운영 BEP,"  "1회용 응시 링크와 지원자별 리포트,"
# 19장에 0.15초. 정상 자료에 돌리면 멀쩡한 공백을 건드리므로 공백이 모자란 쪽에만 쓴다.

# "한글 공백 한글" 이 한글 글자 수에 비해 얼마나 있나.
# 전체 공백 수로 재면 숫자, 영어, 쉼표 뒤 공백이 섞여서 공백 빠진 자료도 0.10 이 나왔다.
#   공백 빠진 PDF 0.0  /  정상 자료(톰과젤리) 0.25
MIN_SPACE_RATIO = 0.05
_kiwi = None


def _hangul(text: str) -> int:
    return len(re.findall(r"[가-힣]", text))


def needs_spacing(text: str) -> bool:
    h = _hangul(text)
    gaps = len(re.findall(r"[가-힣] (?=[가-힣])", text))
    return h >= 30 and gaps / h < MIN_SPACE_RATIO


def _get_kiwi():
    global _kiwi
    if _kiwi is None:
        from kiwipiepy import Kiwi
        _kiwi = Kiwi(num_workers=-1)
    return _kiwi


def restore_spacing(text: str, bounds: set[int] | None = None) -> str:
    kiwi = _get_kiwi()
    lines = text.split("\n")
    # 줄마다 따로 부르면 484줄에 3.7초, 목록으로 한 번에 넘기면 0.14초였다
    todo = [l for l in lines if _hangul(l)]
    done = iter(kiwi.space(todo, reset_whitespace=True)) if todo else iter(())
    out, k = [], 0                      # k: 지금까지 지나온 공백 아닌 글자 수
    for line in lines:
        n = sum(1 for ch in line if not ch.isspace())
        if not _hangul(line):
            out.append(line)
            k += n
            continue
        spaced = next(done)
        if bounds is not None:
            spaced = _keep_at_bounds(line, spaced, bounds, k)
        out.append(spaced)
        k += n
    # 분석기가 숫자와 단위를 떼어놓는다 ("10 곳", "95 %"). 근거 문장에서 제일 눈에 띄는 곳이라 되붙인다.
    return _NUM_UNIT.sub(r"\1\2", "\n".join(out))


def _keep_at_bounds(line: str, spaced: str, bounds: set[int], k: int) -> str:
    """분석기가 넣은 공백 중 묶음 경계이거나 원래 있던 자리만 남긴다."""
    had, j = set(), k
    for ch in line:
        if ch.isspace():
            had.add(j)
        else:
            j += 1
    res, j = [], k
    for ch in spaced:
        if ch == " ":
            if (j in bounds or j in had) and res and res[-1] != " ":
                res.append(" ")
            continue
        res.append(ch)
        j += 1
    # 분석기가 글자를 바꿨다면 맞춰볼 수 없다. 분석기 결과를 그대로 쓴다.
    return "".join(res).strip() if j == k + sum(1 for ch in line if not ch.isspace()) else spaced


_NUM_UNIT = re.compile(r"(\d)\s+(%|곳|명|인|개|건|원|억|만|년|월|일|배|회|장|차|위|종|시간|분|초|점|퍼센트)")


# 슬라이드 글상자 폭 때문에 줄이 바뀐 자리를 되붙인다.
# 안 붙이면 근거로 "누적 응시자 1,000명," 이나 "1. AI 도입 기업의 최대 우려는" 같은 반쪽 줄이 뜬다.
# 줄이 쉼표나 조사, 연결 어미("~는", "~인데", "~해")로 끝나면 문장이 안 끝난 것으로 본다.
_BULLET = re.compile(r"^\s*([-•▪◦●○■□※➢❖✓›]|\d+[.)]|[①-⑳]|STEP\s)")
_OPEN_TAGS = {"JKS", "JKC", "JKG", "JKO", "JKB", "JKV", "JX", "JC", "EC", "ETM"}
MAX_JOINED = 150          # 이보다 길게는 안 붙인다. 근거 칸에 120자만 보인다.
MIN_NEXT = 8              # 다음 줄이 이보다 짧으면 소제목일 가능성이 커서 안 붙인다


# 분석기가 줄 끝만 보고 종결 어미로 판정하지만 실제로는 문장이 이어지는 꼴
#   "누가 걸러낼 줄 아는지" / "불필요한 LLM 호출을 줄여"
_OPEN_EF = re.compile(r"(지|여|어|아|고|며|서|게|는데|인데)$")


def _is_open(line: str) -> bool:
    s = line.rstrip()
    if not s or not re.search(r"[가-힣]$", s):
        return False
    toks = _get_kiwi().tokenize(s[-12:])
    if not toks:
        return False
    last = toks[-1]
    return last.tag in _OPEN_TAGS or (last.tag == "EF" and bool(_OPEN_EF.search(s)))


def join_wrapped(text: str) -> str:
    out: list[str] = []
    for line in text.split("\n"):
        nxt = line.strip()
        comma = bool(out) and out[-1].rstrip().endswith(",")
        if (out and nxt and not _BULLET.match(nxt)
                # 쉼표로 끝난 줄은 뒤가 짧아도 이어진다 ("웹 샌드박스 프로토타입," + "오픈 베타")
                and len(re.sub(r"\s", "", nxt)) >= (3 if comma else MIN_NEXT)
                and len(out[-1]) + len(nxt) < MAX_JOINED
                and (comma or _is_open(out[-1]))):
            out[-1] = out[-1].rstrip() + " " + nxt
        else:
            out.append(line)
    return "\n".join(out)


def ingest(path: Path) -> list[dict]:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        raw = from_pdf(path)
    elif suffix == ".pptx":
        raw = from_pptx(path)
    else:
        raise ValueError(f"지원하지 않는 형식: {suffix} (.pdf 또는 .pptx만)")

    # 공백 판정은 자료 전체로 한다. 슬라이드마다 하면 짧은 장에서 흔들린다.
    spacing = needs_spacing("\n".join(c["text"] for c in raw))

    out = []
    for c in raw:
        text = restore_spacing(c["text"], c.get("bounds")) if spacing else c["text"]
        c = {**c, "text": join_wrapped(text)}
        notes = c.get("notes", "")
        body = c["text"] if not notes else f"{c['text']}\n\n[노트] {notes}"
        out.append(
            {
                "id": f"{path.stem}#p{c['page']}",
                "source": path.name,
                "page": c["page"],
                "text": body,
                "n_chars": len(body),
            }
        )
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path)
    ap.add_argument("-o", "--output", type=Path, default=Path("data/chunks.jsonl"))
    args = ap.parse_args()

    if not args.input.exists():
        print(f"파일 없음: {args.input}", file=sys.stderr)
        return 1

    try:
        chunks = ingest(args.input)
    except NoTextError as e:
        print(f"[추출 실패] {e}", file=sys.stderr)
        return 3

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        for c in chunks:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")

    lens = sorted(c["n_chars"] for c in chunks)
    print(f"{args.input.name} -> {args.output}")
    print(f"  슬라이드 {len(chunks)}개")
    print(f"  글자수 min/중앙/max: {lens[0]} / {lens[len(lens) // 2]} / {lens[-1]}")
    thin = [c["page"] for c in chunks if c["n_chars"] < 30]
    if thin:
        print(f"  [주의] 30자 미만 슬라이드 {len(thin)}개: {thin[:10]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
