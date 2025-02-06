import os
import sys
import json
import asyncio
import aiohttp
import subprocess
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import uvicorn
import webbrowser
import threading

# SSL関連の環境変数を削除して平文HTTPで動作させる
os.environ.pop("UVICORN_SSL_CERTFILE", None)
os.environ.pop("UVICORN_SSL_KEYFILE", None)

OLLAMA_API_URL = "http://localhost:11434"
DEFAULT_OPTIONS = {"temperature": 0.7, "num_ctx": 4096}

templates = Jinja2Templates(directory="templates")

def start_ollama_server():
    try:
        subprocess.Popen("ollama serve", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("Ollamaサーバーを起動しています...")
    except FileNotFoundError:
        print("Ollamaがインストールされていないか、パスが通っていません。")
    except Exception as e:
        print(f"Ollamaサーバーの起動に失敗しました: {e}")

async def wait_for_ollama_api(timeout=0.5, max_attempts=20):
    """
    OLLAMA_API_URL の /api/tags エンドポイントが応答可能になるまで待機します。
    """
    for attempt in range(max_attempts):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{OLLAMA_API_URL}/api/tags") as response:
                    if response.status == 200:
                        print("Ollama API is available.")
                        return True
        except Exception as e:
            print(f"Attempt {attempt+1} failed: {e}")
        await asyncio.sleep(timeout)
    return False

@asynccontextmanager
async def lifespan(app: FastAPI):
    # アプリ起動前処理
    start_ollama_server()
    print("Waiting for Ollama API to be available...")
    available = await wait_for_ollama_api()
    if not available:
        print("警告: Ollama API isまだ起動していないため、/models エンドポイントなどでエラーが発生する可能性があります。")
    yield
    # シャットダウン処理を記述する場合はここに

app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def get_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/models")
async def get_models():
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(f"{OLLAMA_API_URL}/api/tags") as response:
                data = await response.json()
                models = sorted(
                    [
                        {"name": m["name"], "installed": m.get("modified_at", "")}
                        for m in data.get("models", [])
                    ],
                    key=lambda x: x["installed"],
                    reverse=True
                )
                return JSONResponse(content=models)
        except Exception as e:
            # オフライン時やエラー時のフォールバックとしてダミーデータを返す
            dummy_models = [
                {"name": "dummy-model-1", "installed": ""},
                {"name": "dummy-model-2", "installed": ""}
            ]
            return JSONResponse(content=dummy_models)

@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data_text = await websocket.receive_text()
            try:
                data = json.loads(data_text)
                model = data.get("model")
                messages = data.get("messages", [])
                if not model or not messages:
                    await websocket.send_text(json.dumps({"error": "modelとmessagesを含む必要があります"}))
                    continue

                payload = {
                    "model": model,
                    "messages": messages,
                    "stream": True,
                    "options": DEFAULT_OPTIONS
                }

                async with aiohttp.ClientSession() as session:
                    async with session.post(f"{OLLAMA_API_URL}/api/chat", json=payload) as resp:
                        buffer = ""
                        async for chunk in resp.content.iter_chunked(1024):
                            text_chunk = chunk.decode("utf-8")
                            buffer += text_chunk
                            while "\n" in buffer:
                                line, buffer = buffer.split("\n", 1)
                                if line.strip():
                                    try:
                                        response_json = json.loads(line)
                                        content = response_json.get("message", {}).get("content", "")
                                        if content:
                                            await websocket.send_text(json.dumps({"chunk": content}))
                                    except json.JSONDecodeError:
                                        continue
                        await websocket.send_text(json.dumps({"done": True}))
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"error": "無効なJSON形式のメッセージ"}))
    except WebSocketDisconnect:
        print("WebSocket切断")
    except Exception as e:
        await websocket.send_text(json.dumps({"error": str(e)}))

def open_browser():
    webbrowser.open("http://127.0.0.1:8001/")

def main():
    threading.Timer(1.0, open_browser).start()
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=False)

if __name__ == "__main__":
    main() 