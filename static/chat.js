document.addEventListener("DOMContentLoaded", () => {
  const modelListElem = document.getElementById("model-list");
  const chatContainer = document.getElementById("chat-container");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const clearChatBtn = document.getElementById("clear-chat");
  const resizer = document.getElementById("resizer");
  const sidebar = document.querySelector(".sidebar");

  // 各モデルごとのセッション履歴（HTMLとして保存）
  const sessions = {};
  let currentModel = null;
  let isGenerating = false; // LLM生成中かどうかを管理

  // サイドバーのリサイズ処理
  let isResizing = false;
  resizer.addEventListener("mousedown", (e) => {
    // 生成中はリサイズ操作を無効にする
    if (isGenerating) return;
    isResizing = true;
  });
  document.addEventListener("mousemove", (e) => {
    if (!isResizing || isGenerating) return;
    if (e.buttons !== 1) {
      isResizing = false;
      return;
    }
    // 幅は最低200px、最大は画面の25%（25vw）まで
    let newWidth = e.clientX;
    if (newWidth < 200) newWidth = 200;
    const maxWidth = window.innerWidth * 0.25;
    if (newWidth > maxWidth) newWidth = maxWidth;
    sidebar.style.width = newWidth + "px";
  });
  document.addEventListener("mouseup", () => {
    isResizing = false;
  });

  // モデル切り替え時、セッション（チャット履歴）を再表示する関数
  function loadSession(model) {
    chatContainer.innerHTML = sessions[model] || "";
  }

  // サイドバーにモデル一覧を表示（最大文字数制限削除）
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
        li.textContent = fullName;  // ※文字数制限なし
        li.dataset.model = fullName;
        li.title = fullName;
        li.addEventListener("click", () => {
          // 現在のセッションを保存
          if (currentModel) {
            sessions[currentModel] = chatContainer.innerHTML;
          }
          document.querySelectorAll("#model-list li").forEach(item => item.classList.remove("active"));
          li.classList.add("active");
          currentModel = li.dataset.model;
          loadSession(currentModel);
        });
        modelListElem.appendChild(li);
      });
      if (modelListElem.firstChild) {
        modelListElem.firstChild.classList.add("active");
        currentModel = modelListElem.firstChild.dataset.model;
      }
    })
    .catch(err => console.error("モデル一覧の取得エラー:", err));

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
    const message = chatInput.value.trim();
    if (!message) return;

    // ユーザーの吹き出し（左側に表示）
    const userBubble = document.createElement("div");
    userBubble.classList.add("message", "user");

    const userLabel = document.createElement("div");
    userLabel.classList.add("message-label");
    userLabel.textContent = "User";
    const userContent = document.createElement("div");
    userContent.classList.add("message-content");
    userContent.textContent = message;

    userBubble.appendChild(userLabel);
    userBubble.appendChild(userContent);
    chatContainer.appendChild(userBubble);
    chatInput.value = "";
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // セッション履歴を記録
    sessions[selectedModel] = chatContainer.innerHTML;

    // AIの吹き出し（右側に表示）
    const aiBubble = document.createElement("div");
    aiBubble.classList.add("message", "ai");

    const aiLabel = document.createElement("div");
    aiLabel.classList.add("message-label");
    aiLabel.textContent = selectedModel;
    const aiContent = document.createElement("div");
    aiContent.classList.add("message-content");
    aiContent.textContent = "";

    aiBubble.appendChild(aiLabel);
    aiBubble.appendChild(aiContent);
    chatContainer.appendChild(aiBubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    sessions[selectedModel] = chatContainer.innerHTML;

    // 生成中フラグを立てる
    isGenerating = true;

    const ws = new WebSocket(`ws://${window.location.host}/ws/chat`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ model: selectedModel, messages: [{ role: "user", content: message }] }));
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.chunk) {
        const cleanChunk = data.chunk.replace(/\n+/g, ' ');
        aiContent.textContent += cleanChunk;
        chatContainer.scrollTop = chatContainer.scrollHeight;
        sessions[selectedModel] = chatContainer.innerHTML;
      }
      if (data.done) {
        ws.close();
        isGenerating = false;
      }
    };
    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      aiContent.textContent = "エラーが発生しました。";
      isGenerating = false;
    };
  });

  // チャットクリアボタンの処理
  clearChatBtn.addEventListener("click", () => {
    if (currentModel) {
      sessions[currentModel] = "";
    }
    chatContainer.innerHTML = "";
  });
}); 