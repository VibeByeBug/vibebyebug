"""chunks.jsonl -> 검색 평가용 질문셋.

주의 1) 슬라이드 문장을 그대로 베낀 질문을 만들면 안 된다.
단어가 겹쳐 어떤 검색기든 다 맞히므로 모델 간 차이가 안 드러난다.
실제 Q&A 처럼 '말로 풀어서 묻는' 질문이어야 평가가 의미를 갖는다.

주의 2) 슬라이드마다 API 를 부르면 무료 등급(분당 5회)에 계속 걸려 한 시간이 넘는다.
전체 슬라이드를 한 번에 보내고 슬라이드 번호를 붙여 받는다 -> 호출 1회.

사용:
    python make_questions.py data/chunks_x.jsonl -o data/questions_x.jsonl
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

from caption import PROVIDERS, detect_provider, load_env, _retry_delay

PROMPT = """아래는 어떤 발표의 슬라이드 내용이야. 슬라이드마다 번호가 붙어 있어.

발표가 끝나고 청중이나 심사위원이 실제로 물어볼 법한 질문을 만들어줘.
내용이 있는 슬라이드마다 {n}개씩, 그 슬라이드를 봐야만 답할 수 있는 질문으로.

지켜야 할 것:
1. 슬라이드에 있는 문장을 그대로 베끼지 마. 말로 풀어서 물어봐.
2. 슬라이드에 적힌 숫자를 질문에 넣지 마. 그 숫자를 물어보는 질문을 만들어.
   나쁜 예: "94,469건이 맞나요?"
   좋은 예: "포트홀 데이터는 얼마나 모으신 거죠?"
3. 실제 말투로. "~인가요?", "~좀 설명해주세요" 같은 구어체.
4. 표지나 '감사합니다' 같은 슬라이드는 건너뛰어.

출력 형식 (다른 말 붙이지 말고 이것만):
슬라이드번호<TAB>질문

예:
4	데이터는 어디서 구하신 건가요?
4	표본만 쓰신 건지 전체를 다 받으신 건지 궁금합니다

--- 슬라이드 내용 ---
{slides}"""


def call_model(prompt: str, provider: str, model: str) -> str:
    if provider == "gemini":
        from google import genai
        # 클라이언트를 임시 객체로 두면 호출 도중 닫히는 경우가 있어 참조를 유지한다
        client = genai.Client()
        resp = client.models.generate_content(model=model, contents=prompt)
        return resp.text or ""
    if provider == "anthropic":
        import anthropic
        r = anthropic.Anthropic().messages.create(
            model=model, max_tokens=8000,
            messages=[{"role": "user", "content": prompt}])
        return "".join(b.text for b in r.content if b.type == "text")
    from openai import OpenAI
    r = OpenAI().chat.completions.create(
        model=model, max_tokens=8000,
        messages=[{"role": "user", "content": prompt}])
    return r.choices[0].message.content or ""


def parse(out: str, valid_pages: set[int]) -> list[dict]:
    """'번호<TAB>질문' 을 파싱한다. 탭 대신 다른 구분자를 쓰는 경우도 받아준다."""
    rows = []
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^\D{0,3}(\d{1,3})\s*(?:\t|\||:|\.|\)|\s{2,})\s*(.+)$", line)
        if not m:
            continue
        page, q = int(m.group(1)), m.group(2).strip()
        # 모델이 없는 슬라이드 번호를 지어내면 버린다 (정답 라벨이 틀리면 평가가 무의미)
        if page not in valid_pages or len(q) < 8:
            continue
        rows.append({"page": page, "question": q})
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("chunks", type=Path)
    ap.add_argument("-o", "--output", type=Path, default=Path("data/questions.jsonl"))
    ap.add_argument("--per-slide", type=int, default=3)
    ap.add_argument("--min-chars", type=int, default=150)
    ap.add_argument("--provider", choices=list(PROVIDERS), default=None)
    ap.add_argument("--model", default=None)
    args = ap.parse_args()

    load_env()
    provider = args.provider or detect_provider()
    if provider is None:
        print("API 키 없음", file=sys.stderr)
        return 2
    model = args.model or PROVIDERS[provider][1]

    rows = [json.loads(l) for l in args.chunks.open(encoding="utf-8")]
    targets = [r for r in rows if r["n_chars"] >= args.min_chars]
    valid = {r["page"] for r in targets}
    by_page = {r["page"]: r for r in rows}

    slides = "\n\n".join(f"[슬라이드 {r['page']}]\n{r['text']}" for r in targets)
    prompt = PROMPT.format(n=args.per_slide, slides=slides)

    print(f"[질문 생성] 슬라이드 {len(targets)}/{len(rows)}장을 한 번에 -> {provider}/{model}")
    print(f"  프롬프트 {len(prompt):,}자, API 호출 1회")

    out = ""
    for attempt in range(6):
        try:
            out = call_model(prompt, provider, model)
            break
        except Exception as e:
            wait = _retry_delay(e)
            if wait is None or attempt == 5:
                print(f"  실패: {e}", file=sys.stderr)
                return 4
            print(f"  제한 걸림, {wait:.0f}초 대기", flush=True)
            time.sleep(wait)

    qs = parse(out, valid)
    if not qs:
        print("  파싱된 질문 0개. 모델 응답 앞부분:", file=sys.stderr)
        print(out[:500], file=sys.stderr)
        return 4

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        for q in qs:
            f.write(json.dumps({
                "question": q["question"],
                "gold_page": q["page"],
                "gold_id": by_page[q["page"]]["id"],
            }, ensure_ascii=False) + "\n")

    per_page = {}
    for q in qs:
        per_page[q["page"]] = per_page.get(q["page"], 0) + 1
    covered = len(per_page)
    print(f"\n  질문 {len(qs)}개 / 슬라이드 {covered}장 커버 -> {args.output}")
    missing = sorted(valid - set(per_page))
    if missing:
        print(f"  질문이 안 붙은 슬라이드: {missing}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
