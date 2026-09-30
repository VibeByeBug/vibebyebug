"""Hugging Face Spaces 진입점.

Spaces 는 이 파일을 `python app.py` 로 실행하고, 컨테이너의 7860 포트를 밖으로 연다.
Ready-Q 는 Gradio 앱이 아니라 FastAPI 서버라서, 여기서 main.py 의 app 을 그대로 띄운다.
(원래 Docker SDK 로 올리려 했는데 2026년 7월부터 무료 계정에서 Docker Space 를
 만들 수 없게 바뀌어서 Gradio SDK 를 쓴다. Dockerfile 은 나중을 위해 남겨 뒀다.)

Space 주소를 열었을 때 보이는 상태 화면만 Gradio 로 만든다.
실제 기능은 /api/* 와 /ws 로 들어오고, 화면은 Vercel 에 따로 있다.
"""

import os

import uvicorn

from main import app

PORT = int(os.environ.get("GRADIO_SERVER_PORT") or os.environ.get("PORT") or 7860)
FRONTEND = "https://vibebyebug-develop.vercel.app"


def _status_text() -> str:
    """상태 화면에 적을 글. 화면을 열 때마다 새로 읽는다."""
    from main import health  # 같은 판정을 두 군데 두지 않으려고 API 를 그대로 쓴다

    try:
        h = health()
    except Exception as e:  # 상태 화면 때문에 서버가 죽지는 않게 한다
        return f"상태를 읽지 못했습니다: {e}"

    def mark(ok: bool) -> str:
        return "준비됨" if ok else "아직"

    return "\n".join(
        [
            f"- 임베딩 모델: {mark(h.get('임베딩_모델_준비'))}",
            f"- 답변 생성 키: {h.get('이미지_인식_키') or '없음'}",
            f"- 빠진 패키지: {', '.join(h.get('빠진_패키지') or []) or '없음'}",
            f"- 준비된 발표: {len(h.get('준비된_발표') or [])}건",
        ]
    )


def _mount_status_page():
    """Space 주소를 열면 보일 화면. Gradio 가 없으면 조용히 건너뛴다."""
    import gradio as gr

    # main.py 가 개발용 데모 페이지를 "/" 에 물려 두었다. Space 에서는 상태 화면을 보여준다.
    app.router.routes = [r for r in app.router.routes if getattr(r, "path", None) != "/"]

    with gr.Blocks(title="Ready-Q 백엔드") as page:
        gr.Markdown(
            f"""# Ready-Q 백엔드

발표 질의응답 프롬프터 Ready-Q 의 API 와 WebSocket 서버다.
**발표자 화면은 여기가 아니라 [{FRONTEND}]({FRONTEND}) 에 있다.**

이 주소는 화면이 뒤에서 부르는 곳이다. 자세한 상태는 `/api/health` 에서 볼 수 있다.
"""
        )
        box = gr.Markdown(_status_text())
        gr.Button("상태 다시 읽기").click(fn=_status_text, outputs=box)

    return gr.mount_gradio_app(app, page, path="/")


try:
    app = _mount_status_page()
except Exception as e:  # Gradio 가 없거나 버전이 안 맞아도 API 는 떠야 한다
    print(f"[app] 상태 화면을 붙이지 못했습니다(API 는 정상): {e}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
