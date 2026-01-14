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

// ─── New: Load and display boards ───
document.getElementById("myBoardsBtn").addEventListener("click", async () => {
  const user = await new Promise(r => chrome.storage.sync.get("loggedInUser", d => r(d.loggedInUser)));
  if (!user) return showMessage("Please login first");

  const listEl = document.getElementById("boardsList");
  const msgEl = document.getElementById("boardsMessage");
  listEl.innerHTML = "";
  listEl.style.display = 'none';
  msgEl.innerText = "Loading boards...";

  try {
    const res = await fetch(`${backendUrl}/get-boards/${user}`);
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
      item.style.padding = '5px';
      item.style.borderBottom = '1px solid #ccc';
      item.style.cursor = 'pointer';
      item.innerText = `Board ${board.boardId.slice(0, 8)} - ${new Date(board.createdAt).toLocaleString()}`;
      item.onclick = () => {
        // Open Lichess analysis with FEN
        chrome.tabs.create({ url: `https://lichess.org/analysis/${encodeURIComponent(board.fen)}` }, tab => {
          // Send message to content script to load arrows (content script must listen)
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { type: "LOAD_BOARD", boardId: board.boardId });
          }, 1500);  // delay for page load
        });
      };
      listEl.appendChild(item);
    });
  } catch (err) {
    msgEl.innerText = "Error: " + err.message;
  }
});