document.addEventListener("DOMContentLoaded", () => {
  // DOM要素のキャッシュ
  const modelListElem = document.getElementById("model-list");
  const chatContainer = document.getElementById("chat-container");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const clearChatBtn = document.getElementById("clear-chat");
  const sidebar = document.querySelector(".sidebar");
  const settingsBtn = document.getElementById("settings-btn");
  const settingsModal = document.getElementById("settings-modal");
  const closeSettingsBtn = document.getElementById("close-settings-btn");
  const settingsForm = document.getElementById("settings-form");
  const refreshButton = document.getElementById("refresh-models");

  // サイドバーの横スクロール無効化
  if (sidebar) sidebar.style.overflowX = "hidden";

  // 各モデルごとの会話履歴（メッセージ配列）
  const conversations = {};
  let currentModel = null;
  let isGenerating = false;
  let activeWebSocket = null;

  // メッセージバブル生成
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

  // 会話のレンダリング
  function renderConversation(model) {
    chatContainer.innerHTML = "";
    if (!conversations[model]) return;
    conversations[model].forEach(message => {
      const bubble = createMessageBubble(message.role, message.content);
      chatContainer.appendChild(bubble);
    });
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // モデルリストの更新
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
          if (details) li.innerHTML += `<div class="model-details">${details}</div>`;
          li.title = model.name;
          li.addEventListener("click", () => {
            if (isGenerating) {
              showToast("現在、応答中です。モデルの変更はできません。");
              return;
            }
            currentModel = li.dataset.model;
            document.querySelectorAll("#model-list li").forEach(item => item.classList.remove("active"));
            li.classList.add("active");
            if (!conversations[currentModel]) conversations[currentModel] = [];
            renderConversation(currentModel);
          });
          modelListElem.appendChild(li);
        });
        if (modelListElem.firstChild && !currentModel) {
          modelListElem.firstChild.classList.add("active");
          currentModel = modelListElem.firstChild.dataset.model;
          if (!conversations[currentModel]) conversations[currentModel] = [];
          renderConversation(currentModel);
        }
      })
      .catch(err => console.error("モデル取得エラー", err));
  }

  // 入力および送信ボタンの操作状態を管理
  function setGeneratingState(isGeneratingState) {
    const submitButton = chatForm.querySelector("button[type='submit']");
    if (!submitButton) return;
    if (isGeneratingState) {
      submitButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="stop-icon" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12"></rect>
        </svg>
      `;
      submitButton.classList.add("generating");
      submitButton.setAttribute("formnovalidate", "true");
    } else {
      submitButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="send-icon" viewBox="0 0 24 24">
          <path d="M2 21l21-9L2 3v7l15 2-15 2z"></path>
        </svg>
      `;
      submitButton.classList.remove("generating");
      submitButton.removeAttribute("formnovalidate");
    }
  }

  // トースト通知の表示
  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.add("show"); }, 100);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => { document.body.removeChild(toast); }, 500);
    }, 2000);
  }

  // チャット送信処理（送信ボタン／停止ボタンの切替）
  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();

    // もし生成中なら、「停止」ボタンとして即時生成停止
    if (isGenerating) {
      if (activeWebSocket) {
        activeWebSocket.close(); // WebSocket切断で生成停止
        activeWebSocket = null;
      }
      isGenerating = false;
      setGeneratingState(false);
      showToast("生成を停止しました。");
      return;
    }

    // 通常の送信処理
    const activeModelElem = document.querySelector("#model-list li.active");
    if (!activeModelElem) {
      alert("モデルを選択してください");
      return;
    }
    const selectedModel = activeModelElem.dataset.model;
    currentModel = selectedModel;
    if (!conversations[selectedModel]) conversations[selectedModel] = [];
    const message = chatInput.value.trim();
    if (!message) return;
    conversations[selectedModel].push({ role: "user", content: message });
    const userBubble = createMessageBubble("user", message);
    chatContainer.appendChild(userBubble);
    chatInput.value = "";
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // 送信直後、生成開始状態に移行
    isGenerating = true;
    setGeneratingState(true);

    const aiBubble = createMessageBubble("ai", "");
    chatContainer.appendChild(aiBubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    let aiResponse = "";
    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    activeWebSocket = new WebSocket(`${wsProtocol}://${window.location.host}/ws/chat`);

    activeWebSocket.onopen = () => {
      activeWebSocket.send(JSON.stringify({ model: selectedModel, messages: conversations[selectedModel] }));
    };

    // onmessage に生成停止後のチェックを追加
    activeWebSocket.onmessage = (event) => {
      if (!isGenerating) return; // 停止済なら以降のチャンクは無視
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
        if (contentElem) contentElem.innerText = aiResponse;
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
      if (data.done) {
        activeWebSocket.close();
        activeWebSocket = null;
        isGenerating = false;
        conversations[selectedModel].push({ role: "assistant", content: aiResponse });
        setGeneratingState(false);
      }
    };

    activeWebSocket.onerror = (err) => {
      console.error("WebSocket error:", err);
      const contentElem = aiBubble.querySelector(".message-content");
      if (contentElem) contentElem.innerText = "エラーが発生しました。";
      isGenerating = false;
      activeWebSocket.close();
      activeWebSocket = null;
      setGeneratingState(false);
    };
  });

  // チャットクリアボタン
  clearChatBtn.addEventListener("click", () => {
    if (activeWebSocket) {
      activeWebSocket.close();
      activeWebSocket = null;
    }
    isGenerating = false;
    if (currentModel) conversations[currentModel] = [];
    chatContainer.innerHTML = "";
    setGeneratingState(false);
  });

  // テキストエリアの高さ自動調整
  chatInput.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
  });

  // Enterキーで送信、Shift+Enterで改行
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      chatForm.requestSubmit();
    }
  });

  // 設定モーダルの表示／非表示
  if (settingsBtn && settingsModal) {
    settingsBtn.addEventListener("click", () => {
      settingsModal.classList.remove("hidden");
      document.getElementById("sortOrder").value = localStorage.getItem("sortOrder") || "date_desc";
      document.getElementById("showInstalled").checked = localStorage.getItem("showInstalled") === "true";
      document.getElementById("showSize").checked = localStorage.getItem("showSize") === "true";
    });
  }
  if (closeSettingsBtn && settingsModal) {
    closeSettingsBtn.addEventListener("click", () => { settingsModal.classList.add("hidden"); });
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
  if (refreshButton) {
    refreshButton.addEventListener("click", () => { updateModelList(); });
  }
  setGeneratingState(false);
  updateModelList();
});

