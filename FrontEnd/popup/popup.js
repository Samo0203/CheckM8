const backendUrl = "http://localhost:5000/api";

// Helper: Use background proxy for all API calls (avoids CORS in popup)
async function proxyApiCall(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: "PROXY_API_CALL",
      endpoint,
      method,
      body
    }, response => {
      if (response?.success) {
        resolve(response.data);
      } else {
        reject(new Error(response?.error || "Proxy request failed"));
      }
    });
  });
}

document.getElementById("loginBtn").addEventListener("click", async () => {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  if (!username || !password) return showMessage("Fill all fields");

  try {
    const data = await proxyApiCall("login", "POST", { username, password });
    chrome.storage.sync.set({ loggedInUser: username }, () => {
      showMessage("Login successful!");
    });
  } catch (err) {
    showMessage("Login failed: " + err.message);
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  chrome.storage.sync.remove("loggedInUser", () => showMessage("Logged out"));
});

function showMessage(msg, isError = false) {
  const el = document.getElementById("message");
  el.innerText = msg;
  el.style.color = isError ? "red" : "green";
}

// My Boards – improved loading + arrow fix
document.getElementById("myBoardsBtn").addEventListener("click", async () => {
  const res = await chrome.storage.sync.get("loggedInUser");
  const user = res.loggedInUser;
  if (!user) return showMessage("Please login first", true);

  const listEl = document.getElementById("boardsList");
  const msgEl = document.getElementById("boardsMessage");
  listEl.innerHTML = "";
  listEl.style.display = 'none';
  msgEl.innerText = "Loading your saved boards...";
  msgEl.style.color = "";

  try {
    // Use proxy instead of direct fetch
    const boards = await proxyApiCall(`get-boards/${encodeURIComponent(user)}`, "GET");

    msgEl.innerText = "";
    if (!boards || boards.length === 0) {
      msgEl.innerText = "No saved boards yet.";
      return;
    }

    listEl.style.display = 'block';

    boards.forEach(board => {
      const item = document.createElement('div');
      item.style.padding = '10px';
      item.style.borderBottom = '1px solid #ddd';
      item.style.cursor = 'pointer';
      item.style.background = '#f9f9f9';
      item.style.marginBottom = '4px';
      item.innerHTML = `
        <strong>Board ${board.boardId.slice(0, 8)}…</strong><br>
        <small>${new Date(board.createdAt).toLocaleString()}</small>
      `;

      item.addEventListener('click', async () => {
        msgEl.innerText = `Opening board ${board.boardId.slice(0, 8)}...`;
        msgEl.style.color = "";

        try {
          const tab = await chrome.tabs.create({
            url: `https://lichess.org/analysis?fen=${encodeURIComponent(board.fen)}&boardId=${board.boardId}`
          });

          // Wait for tab to be ready + give Lichess time to initialize chessground
          let attempts = 0;
          const MAX_ATTEMPTS = 15;

          const trySend = (attempt = 0) => {
            if (attempt >= MAX_ATTEMPTS) {
              console.error(`[MyBoards] Failed to send LOAD_BOARD after ${MAX_ATTEMPTS} attempts`);
              msgEl.innerText = "Board opened but arrows failed to load (timeout). Try refreshing the tab.";
              msgEl.style.color = "orange";
              return;
            }

            // Progressive delay: 800ms → 1.5s → 2.5s → 4s → 6s → 8s → 10s ...
            const delay = 800 + attempt * 700;

            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, {
                type: "LOAD_BOARD",
                boardId: board.boardId
              }, response => {
                if (chrome.runtime.lastError) {
                  console.log(`[MyBoards] Attempt ${attempt + 1}/${MAX_ATTEMPTS} failed: ${chrome.runtime.lastError.message}`);
                  trySend(attempt + 1);
                } else if (response?.status === "loaded") {
                  console.log(`[MyBoards] Successfully sent LOAD_BOARD for ${board.boardId}`);
                  msgEl.innerText = `Board loaded with arrows!`;
                  msgEl.style.color = "green";
                } else {
                  console.warn(`[MyBoards] Response not successful:`, response);
                  trySend(attempt + 1);
                }
              });
            }, delay);
          };

          // Start trying after a small initial delay
          setTimeout(() => trySend(0), 1500);

        } catch (err) {
          console.error("[MyBoards] Error opening tab:", err);
          msgEl.innerText = "Failed to open board: " + err.message;
          msgEl.style.color = "red";
        }
      });

      listEl.appendChild(item);
    });
  } catch (err) {
    console.error("[MyBoards] Failed to load boards list:", err);
    msgEl.innerText = "Error loading boards: " + err.message;
    msgEl.style.color = "red";
  }
});