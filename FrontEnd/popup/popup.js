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

// **FIXED: Improved board loading with better timing and retries**
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
        console.log("[POPUP] Creating tab for board:", board.boardId);
        
        chrome.tabs.create({ url }, (tab) => {
          let messageAttempts = 0;
          const maxAttempts = 5;
          
          // **FIX: Better tab ready detection**
          chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId !== tab.id) return;
            
            // Wait for complete load
            if (changeInfo.status === 'complete') {
              console.log("[POPUP] Tab loaded completely");
              
              // **FIX: Progressive retry with longer delays**
              const sendLoadMessage = (attempt) => {
                if (attempt >= maxAttempts) {
                  console.error("[POPUP] Failed to load board after all attempts");
                  chrome.tabs.onUpdated.removeListener(listener);
                  return;
                }
                
                // Progressive delay: 2s, 3s, 4s, 5s, 6s
                const delay = 2000 + (attempt * 1000);
                
                console.log(`[POPUP] Attempt ${attempt + 1}/${maxAttempts} - waiting ${delay}ms...`);
                
                setTimeout(() => {
                  chrome.tabs.sendMessage(tab.id, {
                    type: "LOAD_BOARD",
                    boardId: board.boardId
                  }, (response) => {
                    if (chrome.runtime.lastError) {
                      console.warn(`[POPUP] Attempt ${attempt + 1} failed:`, chrome.runtime.lastError.message);
                      sendLoadMessage(attempt + 1);
                    } else {
                      console.log("[POPUP] Board load message sent successfully:", response);
                      chrome.tabs.onUpdated.removeListener(listener);
                    }
                  });
                }, delay);
              };
              
              // Start first attempt
              sendLoadMessage(0);
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