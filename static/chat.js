document.addEventListener("DOMContentLoaded", () => {
  const modelListElem = document.getElementById("model-list");
  const refreshModelsBtn = document.getElementById("refresh-models");
  const chatContainer = document.getElementById("chat-container");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const clearChatBtn = document.getElementById("clear-chat");
  const resizer = document.getElementById("resizer");
  const sidebar = document.querySelector(".sidebar");

  // 各モデルごとの会話履歴（メッセージの配列として保持）
  const conversations = {};
  let currentModel = null;
  let isGenerating = false; // LLM生成中かどうかを管理

  // サイドバーのリサイズ処理
  let isResizing = false;
  resizer.addEventListener("mousedown", (e) => {
    if (isGenerating) return;
    isResizing = true;
  });
  document.addEventListener("mousemove", (e) => {
    if (!isResizing || isGenerating) return;
    if (e.buttons !== 1) {
      isResizing = false;
      return;
    }
    let newWidth = e.clientX;
    if (newWidth < 200) newWidth = 200;
    const maxWidth = window.innerWidth * 0.25;
    if (newWidth > maxWidth) newWidth = maxWidth;
    sidebar.style.width = newWidth + "px";
  });
  document.addEventListener("mouseup", () => {
    isResizing = false;
  });

  // メッセージバブル作成関数
  function createMessageBubble(role, content) {
    const bubble = document.createElement("div");
    bubble.classList.add("message", role);
    const labelDiv = document.createElement("div");
    labelDiv.classList.add("message-label");
    labelDiv.textContent = role === "user" ? "User" : currentModel;
    const contentDiv = document.createElement("div");
    contentDiv.classList.add("message-content");
    contentDiv.innerHTML = content.replace(/\n/g, "<br>");
    bubble.appendChild(labelDiv);
    bubble.appendChild(contentDiv);
    return bubble;
  }

  // 会話履歴をチャットコンテナにレンダリングする関数
  function renderConversation(model) {
    chatContainer.innerHTML = "";
    if (!conversations[model]) return;
    conversations[model].forEach(message => {
      const bubble = createMessageBubble(message.role, message.content);
      chatContainer.appendChild(bubble);
    });
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // モデル一覧を取得してリストに反映する
  function updateModelList() {
    fetch("/models")
      .then(response => response.json())
      .then(models => {
        if (!Array.isArray(models)) {
          console.error("不正なモデル一覧データ:", models);
          return;
        }
        modelListElem.innerHTML = "";
        models.forEach(model => {
          const li = document.createElement("li");
          const fullName = model.name;
          li.textContent = fullName;
          li.dataset.model = fullName;
          li.title = fullName;
          li.addEventListener("click", () => {
            currentModel = li.dataset.model;
            // 会話履歴がなければ初期化
            if (!conversations[currentModel]) {
              conversations[currentModel] = [];
            }
            document.querySelectorAll("#model-list li").forEach(item => item.classList.remove("active"));
            li.classList.add("active");
            renderConversation(currentModel);
          });
          modelListElem.appendChild(li);
        });
        if (modelListElem.firstChild && !currentModel) {
          modelListElem.firstChild.classList.add("active");
          currentModel = modelListElem.firstChild.dataset.model;
          if (!conversations[currentModel]) {
            conversations[currentModel] = [];
          }
          renderConversation(currentModel);
        }
      })
      .catch(err => console.error("モデル一覧の取得エラー:", err));
  }

  // 初回のモデル一覧読み込み
  updateModelList();

  // リストのみを更新するボタンの処理
  refreshModelsBtn.addEventListener("click", () => {
    updateModelList();
  });

  // チャットフォーム送信イベント
  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const activeModelElem = document.querySelector("#model-list li.active");
    if (!activeModelElem) {
      alert("モデルを選択してください");
      return;
    }
    const selectedModel = activeModelElem.dataset.model;
    currentModel = selectedModel;
    // 会話履歴がなければ初期化
    if (!conversations[selectedModel]) {
      conversations[selectedModel] = [];
    }
    const message = chatInput.value.trim();
    if (!message) return;

    // ユーザーのメッセージを会話履歴に追加
    conversations[selectedModel].push({ role: "user", content: message });
    // UIにユーザーの吹き出しを追加
    const userBubble = createMessageBubble("user", message);
    chatContainer.appendChild(userBubble);
    chatInput.value = "";
    chatContainer.scrollTop = chatContainer.scrollHeight;

    isGenerating = true;
    // AIの吹き出し（仮の空メッセージバブル）を作成
    const aiBubble = createMessageBubble("ai", "");
    chatContainer.appendChild(aiBubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    let aiResponse = "";
    const ws = new WebSocket(`ws://${window.location.host}/ws/chat`);
    ws.onopen = () => {
      // これまでの会話履歴を含めたメッセージを送信
      ws.send(JSON.stringify({ model: selectedModel, messages: conversations[selectedModel] }));
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.chunk) {
        aiResponse += data.chunk;
        // 更新された内容を反映
        aiBubble.querySelector(".message-content").textContent = aiResponse;
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
      if (data.done) {
        ws.close();
        isGenerating = false;
        // AIの応答を会話履歴に追加
        conversations[selectedModel].push({ role: "assistant", content: aiResponse });
      }
    };
    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      aiBubble.querySelector(".message-content").textContent = "エラーが発生しました。";
      isGenerating = false;
    };
  });

  // チャットクリアボタン
  clearChatBtn.addEventListener("click", () => {
    if (currentModel) {
      conversations[currentModel] = [];
    }
    chatContainer.innerHTML = "";
  });
}); 