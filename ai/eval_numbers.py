"""숫자 검사(answer.numbers_ok) 회귀 확인.

  python eval_numbers.py        # ai 폴더에서. 틀린 판정이 있으면 종료코드 1

이전 판정(이름 속 숫자도 수치로 대조)과 지금 판정을 나란히 보여준다. 두 가지를 같이 확인한다.
  1. 질문에 나온 이름(BM25, e5-small)을 답변이 되받아도 지어낸 숫자로 버리지 않는다.
  2. 지어낸 수치, 질문에 든 수치를 맞장구치는 답, 자료에 없는 이름은 여전히 막는다.
"""
import re
import sys

from answer import numbers_ok

_NUM = re.compile(r"\d+(?:[.,]\d+)*")


def legacy(text: str, source: str) -> bool:
    """고치기 전 판정. 비교용으로만 남겨둔다."""
    src = re.sub(r"[\s,]", "", source)
    return all(n.replace(",", "") in src for n in _NUM.findall(text))


SLIDES = "검색기는 BM25 와 임베딩을 합친 하이브리드다.\n정확도 88.9%, 응답 169ms\n모델은 gpt-5.4-mini 를 쓴다"
NO_NAMES = "정확도 88.9%, 응답 169ms\n문서 289장"

# (설명, 답변 문장, 자료, 질문, 통과해야 하는가)
CASES = [
    # ── 이름 속 숫자: 이제 통과해야 한다 ──
    ("질문의 이름을 되받음 (이번에 막혔던 경우)",
     "BM25와 e5-small을 함께 쓴 것은 정확한 낱말과 비슷한 뜻을 같이 잡기 위해서입니다.",
     NO_NAMES, "검색 방식은 왜 BM25와 e5-small을 합쳤나요?", True),
    ("이름 표기가 달라도 같은 이름 (E5 small = e5-small)",
     "e5-small 을 썼습니다.", NO_NAMES, "E5 small 은 왜 골랐나요?", True),
    ("대소문자만 다름 (bm25 = BM25)",
     "BM25 는 낱말 일치를 봅니다.", NO_NAMES, "bm25 가 뭔가요?", True),
    ("이름이 자료에 있음 (질문에는 없음)",
     "검색기는 BM25 를 씁니다.", SLIDES, "검색기는 뭘 쓰나요?", True),
    ("소수점 든 이름이 자료에 있음",
     "답변 모델은 gpt-5.4-mini 입니다.", SLIDES, "어떤 모델이죠?", True),
    ("수치는 자료에 있고 이름은 질문에 있음",
     "BM25 와 e5-small 을 합친 결과 정확도는 88.9% 입니다.",
     NO_NAMES, "BM25 와 e5-small 을 합치면 정확도가 어떤가요?", True),
    # ── 여전히 막아야 하는 것 ──
    ("자료에 없는 수치",
     "정확도는 95.2% 입니다.", SLIDES, "정확도가 어떤가요?", False),
    ("질문에 든 수치를 맞장구침 (질문은 수치의 근거가 아니다)",
     "네, 정확도는 95% 입니다.", NO_NAMES, "정확도가 95% 인가요?", False),
    ("질문에 든 이름 옆에 지어낸 수치",
     "BM25 는 0.7ms 걸립니다.", NO_NAMES, "BM25 는 얼마나 빠른가요?", False),
    ("자료에도 질문에도 없는 이름 속 숫자",
     "e7-large 를 썼습니다.", NO_NAMES, "어떤 임베딩을 썼나요?", False),
    ("숫자만 지어냄",
     "문서 300장으로 쟀습니다.", NO_NAMES, "몇 장으로 쟀나요?", False),
    # ── 그대로여야 하는 것 ──
    ("자료에 있는 수치",
     "응답 시간은 169ms 입니다.", NO_NAMES, "응답 시간은요?", True),
    ("숫자 없는 문장",
     "두 방식을 합쳐서 정확도를 높였습니다.", NO_NAMES, "왜 합쳤나요?", True),
]


# 알려진 한계. 숫자 단위로 대조하므로 이름의 다른 버전은 못 잡는다 (이전 판정도 같았다).
# 이름이 자료에 없으면 무조건 막는 식으로 조이면 멀쩡한 답도 더 자주 막혀서 하지 않았다.
KNOWN_LIMITS = [
    ("자료에는 e5-small, 답변은 e5-large (숫자 5 가 자료에 있어서 통과)",
     "e5-large 를 썼습니다.", "임베딩은 e5-small 을 쓴다", "무슨 모델을 썼나요?"),
]


def main() -> int:
    wrong = 0
    print(f"{'이전':<6}{'지금':<6}{'기대':<6} 설명")
    for desc, text, source, question, expect in CASES:
        old = legacy(text, source)
        new = numbers_ok(text, source, question)
        flag = "" if new == expect else "   <-- 틀림"
        wrong += new != expect
        mark = lambda v: "통과" if v else "막음"
        print(f"{mark(old):<6}{mark(new):<6}{mark(expect):<6} {desc}{flag}")
    print(f"\n{len(CASES) - wrong}/{len(CASES)} 일치")
    for desc, text, source, question in KNOWN_LIMITS:
        old, new = legacy(text, source), numbers_ok(text, source, question)
        print(f"[알려진 한계] 이전 {'통과' if old else '막음'} / 지금 {'통과' if new else '막음'} : {desc}")
    return 1 if wrong else 0


if __name__ == "__main__":
    sys.exit(main())
