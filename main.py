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

OLLAMA_API_URL = "http://localhost:11434"
DEFAULT_OPTIONS = {"temperature": 0.7, "num_ctx": 4096}

templates = Jinja2Templates(directory="templates")

def start_ollama_server():
    try:
        subprocess.Popen(["ollama", "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("Ollamaサーバーを起動しています...")
    except FileNotFoundError:
        print("Ollamaがインストールされていないか、パスが通っていません。")
    except Exception as e:
        print(f"Ollamaサーバーの起動に失敗しました: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # アプリ起動前処理
    start_ollama_server()
    await asyncio.sleep(0.5)
    yield
    # 必要ならシャットダウン処理をここに記述

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
                response.raise_for_status()
                data = await response.json()
        except Exception as e:
            print("モデル取得エラー:", e)
            # エラー時はダミーデータを返す
            dummy_models = [
                {"name": "dummy-model-1", "installed": ""},
                {"name": "dummy-model-2", "installed": ""}
            ]
            return JSONResponse(content=dummy_models)
    models = sorted(
        [
            {"name": m.get("name", "Unnamed"), "installed": m.get("modified_at", "")}
            for m in data.get("models", [])
        ],
        key=lambda x: x["installed"],
        reverse=True
    )
    # モデルが空の場合も表示できるようにダミーテキストを挿入
    if not models:
        models = [{"name": "利用可能なモデルなし", "installed": ""}]
    return JSONResponse(content=models)

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

                try:
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
                except Exception as e:
                    # チャットAPIへの接続に失敗した場合のフォールバック処理
                    dummy_responses = [
                        "ダミーのチャットレスポンスです。",
                        "これは続きのダミーメッセージです。"
                    ]
                    for msg in dummy_responses:
                        await websocket.send_text(json.dumps({"chunk": msg}))
                        await asyncio.sleep(0.3)
                    await websocket.send_text(json.dumps({"done": True}))
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"error": "無効なJSON形式のメッセージ"}))
    except WebSocketDisconnect:
        print("WebSocket切断")
    except Exception as e:
        await websocket.send_text(json.dumps({"error": str(e)})) 