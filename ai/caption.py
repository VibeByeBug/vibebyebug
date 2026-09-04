"""슬라이드 PNG -> 검색용 텍스트 (멀티모달 모델).

render.py 가 만든 슬라이드 이미지를 모델에게 읽혀서, ingest.py 와 '똑같은 형식'의
chunks.jsonl 을 만든다. 형식이 같으므로 뒤쪽(임베딩·검색)은 두 경로를 구분할 필요가 없다.

  글자 있는 자료:  ingest.py  ─┐
                              ├─→ chunks.jsonl → 임베딩 → 검색
  이미지 자료:  render.py → caption.py ─┘

핵심은 프롬프트다. 이건 '사람이 읽을 요약'이 아니라 '검색에 걸릴 텍스트'를 만드는 작업이라,
요약하면 안 되고 보이는 걸 그대로 옮겨야 한다. 특히 숫자.

사용:
    python caption.py data/slides_x -o data/chunks_x.jsonl --source 발표자료.pptx
    python caption.py data/slides_x --dry-run          # 호출 없이 비용/건수만
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# 검색 대상 텍스트를 만드는 프롬프트.
# '추측 금지' 가 특히 중요하다. 모델이 지어낸 문장이 근거로 저장되면,
# Ready-Q 가 내세우는 '환각 방지' 가 인덱싱 단계에서부터 무너진다.
PROMPT = """이 발표 슬라이드에 보이는 내용을 검색용 텍스트로 옮겨줘.

규칙:
1. 요약하지 마. 슬라이드에 적힌 문장을 그대로 옮겨 적어.
2. 숫자는 절대 바꾸지 마. 반올림·단위변환·재계산 금지. 보이는 그대로.
3. 표는 행마다 한 줄씩, 항목을 " | " 로 구분해서 적어.
4. 그래프·차트는 제목, 축 이름, 범례, 그리고 읽을 수 있는 수치를 적어.
5. 지도·다이어그램은 무엇을 나타내는지와 표시된 라벨·수치를 적어.
6. 안 보이거나 흐려서 못 읽는 건 지어내지 마. 그냥 빼.
7. 설명이나 인사말 없이 옮긴 내용만 출력해.

맨 첫 줄에는 이 슬라이드의 제목을 적어."""


def _b64(path: Path) -> str:
    return base64.standard_b64encode(path.read_bytes()).decode("utf-8")


# --- 제공사별 어댑터 -------------------------------------------------------
# 어느 모델이 이 작업을 제일 잘하는지는 재봐야 안다. 그래서 갈아끼울 수 있게 둔다.

def _caption_anthropic(path: Path, model: str) -> str:
    import anthropic

    client = anthropic.Anthropic()
    resp = client.messages.create(
        model=model,
        max_tokens=4000,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {
                    "type": "base64", "media_type": "image/png", "data": _b64(path)}},
                {"type": "text", "text": PROMPT},
            ],
        }],
    )
    return "".join(b.text for b in resp.content if b.type == "text").strip()


def _caption_openai(path: Path, model: str) -> str:
    from openai import OpenAI

    client = OpenAI()
    resp = client.chat.completions.create(
        model=model,
        max_tokens=4000,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": PROMPT},
                {"type": "image_url",
                 "image_url": {"url": f"data:image/png;base64,{_b64(path)}"}},
            ],
        }],
    )
    return (resp.choices[0].message.content or "").strip()


def _caption_gemini(path: Path, model: str) -> str:
    from google import genai
    from google.genai import types

    client = genai.Client()
    resp = client.models.generate_content(
        model=model,
        contents=[
            types.Part.from_bytes(data=path.read_bytes(), mime_type="image/png"),
            PROMPT,
        ],
    )
    return (resp.text or "").strip()


PROVIDERS = {
    # 캡션은 발표 전에 미리 도는 오프라인 작업이라 지연은 상관없다.
    # 다만 슬라이드 수만큼 호출되므로 모델 선택이 곧 비용이다 -> bake-off 대상.
    "anthropic": (_caption_anthropic, "claude-opus-5", "ANTHROPIC_API_KEY"),
    "openai": (_caption_openai, "gpt-4o", "OPENAI_API_KEY"),
    "gemini": (_caption_gemini, "gemini-3.6-flash", "GEMINI_API_KEY"),
}


def load_env() -> None:
    """ai/.env 를 읽어 환경변수로 올린다.

    PowerShell 의 `$env:X = "..."` 는 그 창에서만 살아서, 다른 프로세스가 실행하면
    안 보인다. 파일로 두면 어디서 실행하든 잡히고 창을 닫아도 남는다.
    .env 는 .gitignore 에 있으므로 레포에 올라가지 않는다.
    """
    env_file = Path(__file__).parent / ".env"
    if not env_file.exists():
        return
    for raw in env_file.read_text(encoding="utf-8-sig").splitlines():
        raw = raw.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, _, value = raw.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))

def detect_provider() -> str | None:
    load_env()
    for name, (_, _, env_key) in PROVIDERS.items():
        if os.environ.get(env_key):
            return name
    return None


# --- 캐시 -----------------------------------------------------------------
# 같은 슬라이드를 다시 부르지 않는다. 프롬프트나 모델을 바꾸면 키가 달라져 자동 무효화된다.

def _cache_key(path: Path, provider: str, model: str) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    h.update(f"{provider}/{model}/{PROMPT}".encode("utf-8"))
    return h.hexdigest()[:16]


def _retry_delay(err: Exception) -> float | None:
    """429 응답에 서버가 알려준 대기 시간이 있으면 꺼낸다."""
    text = str(err)
    # 503 = 모델 혼잡. 잠시 뒤 되는 경우가 대부분이라 429 와 같이 재시도한다.
    if "UNAVAILABLE" in text or "503" in text or "high demand" in text:
        return 0.0
    if "RESOURCE_EXHAUSTED" not in text and "429" not in text:
        return None
    m = re.search(r"retryDelay.{0,4}?(\d+(?:\.\d+)?)s", text)
    if m:
        return float(m.group(1)) + 1.0
    m = re.search(r"retry in (\d+(?:\.\d+)?)s", text)
    return float(m.group(1)) + 1.0 if m else 0.0


def _call_with_retry(fn, path: Path, model: str, attempts: int = 6) -> str:
    """무료 등급은 분당 요청 수가 빡빡해서 429 가 일상이다. 기다렸다 다시 친다."""
    last = None
    for i in range(attempts):
        try:
            return fn(path, model)
        except Exception as e:
            wait = _retry_delay(e)
            if wait is None:
                raise
            last = e
            if i == attempts - 1:
                break
            time.sleep(max(wait, 2.0 * (i + 1)))
    raise last


def caption_one(path: Path, provider: str, model: str, cache_dir: Path) -> str:
    cache_file = cache_dir / f"{_cache_key(path, provider, model)}.txt"
    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8")

    fn = PROVIDERS[provider][0]
    text = _call_with_retry(fn, path, model)

    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(text, encoding="utf-8")
    return text


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("slides_dir", type=Path)
    ap.add_argument("-o", "--output", type=Path, default=Path("data/chunks.jsonl"))
    ap.add_argument("--provider", choices=list(PROVIDERS), default=None)
    ap.add_argument("--model", default=None)
    ap.add_argument("--source", default=None, help="원본 파일명 (출처 표기용)")
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    images = sorted(args.slides_dir.glob("p*.png"))
    if not images:
        print(f"이미지 없음: {args.slides_dir} (render.py 를 먼저 돌리세요)", file=sys.stderr)
        return 1

    load_env()
    provider = args.provider or detect_provider()

    if args.dry_run:
        chosen = provider or "(키 없음 — 아직 미정)"
        model_preview = args.model or (PROVIDERS[provider][1] if provider else "-")
        print(f"[미리보기] {len(images)}장 -> {chosen} / {model_preview}")
        print(f"  슬라이드당 이미지 1장, 총 {len(images)}회 호출 예정")
        cached = len(list((args.slides_dir / '.cache').glob('*.txt')))
        if cached:
            print(f"  캐시 {cached}건 있음 -> 실제 호출은 그만큼 줄어듭니다")
        print("  실제 호출 없음.")
        return 0

    if provider is None:
        print("[중단] API 키가 없습니다. 아래 중 하나를 설정하세요:", file=sys.stderr)
        for name, (_, _, env_key) in PROVIDERS.items():
            print(f"    {env_key}   ({name})", file=sys.stderr)
        print(file=sys.stderr)
        env_path = Path(__file__).parent / ".env"
        print(f"  권장: {env_path} 파일에 한 줄로 적으세요", file=sys.stderr)
        print("      GEMINI_API_KEY=발급받은키", file=sys.stderr)
        print("  (.gitignore 에 있어서 레포에는 안 올라갑니다)", file=sys.stderr)
        return 2

    model = args.model or PROVIDERS[provider][1]

    cache_dir = args.slides_dir / ".cache"
    print(f"[캡션] {len(images)}장 -> {provider} / {model}")

    def work(item):
        i, path = item
        try:
            return i, path, caption_one(path, provider, model, cache_dir), None
        except Exception as e:
            return i, path, None, e

    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for i, path, text, err in ex.map(work, enumerate(images, start=1)):
            if err is not None:
                print(f"  p{i} 실패: {err}", file=sys.stderr)
            else:
                print(f"  p{i} 완료 ({len(text)}자)")
            results.append((i, path, text, err))

    failed = [r for r in results if r[3] is not None]
    ok = [r for r in results if r[3] is None and r[2]]

    source = args.source or args.slides_dir.name
    stem = Path(source).stem
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        for i, _, text, _ in ok:
            f.write(json.dumps({
                "id": f"{stem}#p{i}",
                "source": source,
                "page": i,
                "text": text,
                "n_chars": len(text),
                "origin": "caption",   # 텍스트 추출본과 구분 (품질 비교용)
            }, ensure_ascii=False) + "\n")

    print(f"\n  성공 {len(ok)}/{len(images)} -> {args.output}")
    if failed:
        print(f"  실패 {len(failed)}장: {[r[0] for r in failed]}", file=sys.stderr)
        print("  실패한 슬라이드는 검색에 안 잡힙니다. 재실행하면 캐시 덕에 성공분은 건너뜁니다.",
              file=sys.stderr)
        return 4
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
