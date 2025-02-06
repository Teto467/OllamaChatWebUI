document.addEventListener("DOMContentLoaded", () => {
  const modelListElem = document.getElementById("model-list");
  const chatContainer = document.getElementById("chat-container");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");

  // モデル一覧を取得してサイドバーに表示
  fetch("/models")
    .then(response => response.json())
    .then(models => {
      modelListElem.innerHTML = "";
      models.forEach(model => {
        const li = document.createElement("li");
        li.textContent = model.name;
        li.dataset.model = model.name;
        li.addEventListener("click", () => {
          document.querySelectorAll("#model-list li").forEach(item => item.classList.remove("active"));
          li.classList.add("active");
        });
        modelListElem.appendChild(li);
      });
      // 最初のモデルを自動選択
      if (modelListElem.firstChild) {
        modelListElem.firstChild.classList.add("active");
      }
    })
    .catch(err => console.error("モデル一覧の取得エラー:", err));

  // チャットフォーム送信処理
  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const activeModelElem = document.querySelector("#model-list li.active");
    if (!activeModelElem) {
      alert("モデルを選択してください");
      return;
    }
    const selectedModel = activeModelElem.dataset.model;
    const message = chatInput.value;
    if (!message) return;

    const ws = new WebSocket(`ws://${window.location.host}/ws/chat`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ model: selectedModel, messages: [{ role: "user", content: message }] }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.chunk) {
        const messageElem = document.createElement("div");
        messageElem.textContent = data.chunk;
        chatContainer.appendChild(messageElem);
      }
      if (data.done) {
        ws.close();
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    chatInput.value = "";
  });
}); 