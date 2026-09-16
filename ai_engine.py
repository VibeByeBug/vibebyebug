"""AI 모듈(ai/)을 백엔드에서 쓰기 위한 연결 지점.

ai/ 안의 파일들은 서로를 'from embedders import ...' 형태로 부른다.
( 'python pipeline.py ...' 로 직접 실행하는 걸 전제로 짜여 있음)
그래서 ai/ 폴더 자체가 import 경로에 들어가 있어야 한다.

__file__ 기준 절대경로라 서버를 어디서 실행하든 동작한다.
 CLI 작업 흐름을 깨지 않기 위해 AI 코드는 수정하지 않았다
"""

import sys
from pathlib import Path

_AI_DIR = Path(__file__).resolve().parent / "ai"
if str(_AI_DIR) not in sys.path:
    sys.path.insert(0, str(_AI_DIR))

from pipeline import ReadyQ  # noqa: E402

__all__ = ["ReadyQ"]
