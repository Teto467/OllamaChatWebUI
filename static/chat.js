document.addEventListener("DOMContentLoaded", () => {
  const modelListElem = document.getElementById("model-list");
  const chatContainer = document.getElementById("chat-container");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const clearChatBtn = document.getElementById("clear-chat");
  const sidebar = document.querySelector(".sidebar");

  // サイドバー内の横スクロールを無効化
  sidebar.style.overflowX = "hidden";

  // 各モデルごとの会話履歴（メッセージの配列）
  const conversations = {};
  let currentModel = null;
  let isGenerating = false;
  let activeWebSocket = null;

  function createMessageBubble(role, content) {
    const bubble = document.createElement("div");
    bubble.classList.add("message", role);

    const labelDiv = document.createElement("div");
    labelDiv.classList.add("message-label");
    labelDiv.textContent = role === "user" ? "User" : currentModel;

    const contentDiv = document.createElement("div");
    contentDiv.classList.add("message-content");
    contentDiv.textContent = content;

    bubble.appendChild(labelDiv);
    bubble.appendChild(contentDiv);

    bubble.style.opacity = 0;
    bubble.style.transition = "opacity 0.3s ease-in";
    setTimeout(() => {
      bubble.style.opacity = "1";
    }, 50);
    return bubble;
  }

  function renderConversation(model) {
    chatContainer.innerHTML = "";
    if (!conversations[model]) return;
    conversations[model].forEach(message => {
      const bubble = createMessageBubble(message.role, message.content);
      chatContainer.appendChild(bubble);
    });
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function updateModelList() {
    const sortOrder = localStorage.getItem("sortOrder") || "date_desc";
    return fetch(`/models?sort=${sortOrder}`)
      .then(response => response.json())
      .then(data => {
        modelListElem.innerHTML = "";
        data.forEach(model => {
          const li = document.createElement("li");
          li.dataset.model = model.name;
          li.innerHTML = `<div class="model-name">${model.name}</div>`;
          let details = "";
          if (localStorage.getItem("showInstalled") === "true" && model.installed) {
            details += `<div class="model-installed">📅 ${model.installed}</div>`;
          }
          if (localStorage.getItem("showSize") === "true" && model.size) {
            details += `<div class="model-size">💾 ${model.size} MB</div>`;
          }
          if (details) {
            li.innerHTML += `<div class="model-details">${details}</div>`;
          }
          li.title = model.name;
          li.addEventListener("click", () => {
            if (isGenerating) {
              alert("AIが応答を生成中です。モデルの変更はできません。");
              return;
            }
            currentModel = li.dataset.model;
            document.querySelectorAll("#model-list li").forEach(item => item.classList.remove("active"));
            li.classList.add("active");
            if (!conversations[currentModel]) {
              conversations[currentModel] = [];
            }
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
      .catch(err => console.error("モデル取得エラー", err));
  }

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (isGenerating) {
      alert("現在、応答中です。少々お待ちください。");
      return;
    }
    const activeModelElem = document.querySelector("#model-list li.active");
    if (!activeModelElem) {
      alert("モデルを選択してください");
      return;
    }
    const selectedModel = activeModelElem.dataset.model;
    currentModel = selectedModel;
    if (!conversations[selectedModel]) {
      conversations[selectedModel] = [];
    }
    const message = chatInput.value.trim();
    if (!message) return;
    conversations[selectedModel].push({ role: "user", content: message });
    const userBubble = createMessageBubble("user", message);
    chatContainer.appendChild(userBubble);
    chatInput.value = "";
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // LLM生成開始
    isGenerating = true;
    const aiBubble = createMessageBubble("ai", "");
    chatContainer.appendChild(aiBubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    let aiResponse = "";
    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    activeWebSocket = new WebSocket(`${wsProtocol}://${window.location.host}/ws/chat`);
    activeWebSocket.onopen = () => {
      activeWebSocket.send(JSON.stringify({ model: selectedModel, messages: conversations[selectedModel] }));
    };
    activeWebSocket.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (error) {
        console.error("無効なメッセージ形式:", event.data);
        return;
      }
      if (data.chunk) {
        aiResponse += data.chunk;
        const contentElem = aiBubble.querySelector(".message-content");
        if (contentElem) {
          contentElem.textContent = aiResponse;
        }
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
      if (data.done) {
        activeWebSocket.close();
        activeWebSocket = null;
        isGenerating = false;
        conversations[selectedModel].push({ role: "assistant", content: aiResponse });
      }
    };
    activeWebSocket.onerror = (err) => {
      console.error("WebSocket error:", err);
      const contentElem = aiBubble.querySelector(".message-content");
      if (contentElem) {
        contentElem.textContent = "エラーが発生しました。";
      }
      isGenerating = false;
      activeWebSocket.close();
      activeWebSocket = null;
    };
  });

  clearChatBtn.addEventListener("click", () => {
    if (activeWebSocket) {
      activeWebSocket.close();
      activeWebSocket = null;
    }
    isGenerating = false;
    if (currentModel) {
      conversations[currentModel] = [];
    }
    chatContainer.innerHTML = "";
  });

  chatInput.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
  });

  // トースト通知を表示する関数
  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    // 少し待ってトーストを表示
    setTimeout(() => {
      toast.classList.add("show");
    }, 100);
    // 2秒後に非表示にして削除
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 500);
    }, 2000);
  }

  // 設定モーダルの表示／非表示
  const settingsBtn = document.getElementById("settings-btn");
  const settingsModal = document.getElementById("settings-modal");
  const closeSettingsBtn = document.getElementById("close-settings-btn");
  const settingsForm = document.getElementById("settings-form");

  if (settingsBtn && settingsModal) {
    settingsBtn.addEventListener("click", () => {
      settingsModal.classList.remove("hidden");
      // 現在の設定をフォームに反映
      document.getElementById("sortOrder").value = localStorage.getItem("sortOrder") || "date_desc";
      document.getElementById("showInstalled").checked = localStorage.getItem("showInstalled") === "true";
      document.getElementById("showSize").checked = localStorage.getItem("showSize") === "true";
    });
  }
  if (closeSettingsBtn && settingsModal) {
    closeSettingsBtn.addEventListener("click", () => {
      settingsModal.classList.add("hidden");
    });
  }
  if (settingsForm) {
    settingsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const newSortOrder = document.getElementById("sortOrder").value;
      const newShowInstalled = document.getElementById("showInstalled").checked;
      const newShowSize = document.getElementById("showSize").checked;
      localStorage.setItem("sortOrder", newSortOrder);
      localStorage.setItem("showInstalled", newShowInstalled);
      localStorage.setItem("showSize", newShowSize);
      showToast("設定が保存されました。");
      settingsModal.classList.add("hidden");
      updateModelList();
    });
  }

  // 更新ボタンにクリック時の処理を追加
  const refreshButton = document.getElementById("refresh-models");
  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      // アニメーション処理を削除し、直接モデルリストを更新する
      updateModelList();
    });
  }

  updateModelList();
});

