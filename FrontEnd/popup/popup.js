const backendUrl = "http://localhost:5000/api";

document.getElementById("loginBtn").addEventListener("click", async () => {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  if (!username || !password) return showMessage("Fill all fields");

  try {
    const res = await fetch(`${backendUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (res.ok) {
      chrome.storage.sync.set({ loggedInUser: username }, () => showMessage("Login successful!"));
    } else {
      showMessage(data.error || "Invalid username/password");
    }
  } catch (err) {
    showMessage("Server error: " + err.message);
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  chrome.storage.sync.remove("loggedInUser", () => showMessage("Logged out"));
});

function showMessage(msg) {
  document.getElementById("message").innerText = msg;
}

// ─── Load and display saved boards ───
document.getElementById("myBoardsBtn").addEventListener("click", async () => {
  const user = await new Promise(r => chrome.storage.sync.get("loggedInUser", d => r(d.loggedInUser)));
  if (!user) return showMessage("Please login first");

  const listEl = document.getElementById("boardsList");
  const msgEl = document.getElementById("boardsMessage");
  listEl.innerHTML = "";
  listEl.style.display = 'none';
  msgEl.innerText = "Loading boards...";

  try {
    const res = await fetch(`${backendUrl}/get-boards/${encodeURIComponent(user)}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Failed to load boards");

    msgEl.innerText = "";
    if (data.length === 0) {
      msgEl.innerText = "No saved boards yet.";
      return;
    }

    listEl.style.display = 'block';

    data.forEach(board => {
      const item = document.createElement('div');
      item.style.padding = '8px';
      item.style.borderBottom = '1px solid #ddd';
      item.style.cursor = 'pointer';
      item.innerHTML = `
        <strong>Board ${board.boardId.slice(0, 8)}</strong><br>
        <small>${new Date(board.createdAt).toLocaleString()}</small>
      `;

      item.onclick = () => {
        const url = `https://lichess.org/analysis/${encodeURIComponent(board.fen)}`;
        chrome.tabs.create({ url }, (tab) => {
          // Wait for tab to fully load
          chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === tab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);

              // Give chessground time to initialize (increased delay + retry)
              setTimeout(() => {
                chrome.tabs.sendMessage(tab.id, {
                  type: "LOAD_BOARD",
                  boardId: board.boardId
                }, (response) => {
                  if (chrome.runtime.lastError) {
                    console.warn("Message send failed (normal on first try):", chrome.runtime.lastError.message);
                    // Retry once more after extra delay
                    setTimeout(() => {
                      chrome.tabs.sendMessage(tab.id, {
                        type: "LOAD_BOARD",
                        boardId: board.boardId
                      });
                    }, 2000);
                  } else {
                    console.log("Board load message sent successfully");
                  }
                });
              }, 3000); // 3 seconds delay – adjust if needed (Lichess can be slow)
            }
          });
        });
      };

      listEl.appendChild(item);
    });
  } catch (err) {
    msgEl.innerText = "Error loading boards: " + err.message;
    msgEl.style.color = "red";
  }
});