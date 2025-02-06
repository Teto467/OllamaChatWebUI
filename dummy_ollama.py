from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
import asyncio
import json

app = FastAPI()

@app.get("/api/tags")
async def get_tags():
    # ダミーのモデル一覧を返す
    data = {
        "models": [
            {"name": "dummy-model-1", "modified_at": "20230101"},
            {"name": "dummy-model-2", "modified_at": "20230102"},
        ]
    }
    return JSONResponse(content=data)

@app.post("/api/chat")
async def chat_api(request: Request):
    payload = await request.json()
    # 簡単なダミーのストリーミングレスポンス例
    async def fake_response_generator():
        messages = [
            "これは最初のチャンクです。",
            " こちらが続きのチャンクです。"
        ]
        for msg in messages:
            # 行ごとに JSON をシリアライズして改行区切りで送信
            yield json.dumps({"message": {"content": msg}}) + "\n"
            await asyncio.sleep(0.3)
    return StreamingResponse(fake_response_generator(), media_type="text/plain")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=11434, log_level="info") 