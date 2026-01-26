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
      chrome.storage.sync.set({ loggedInUser: username }, () => {
        showMessage("Login successful!");
      });
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