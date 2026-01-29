const backendUrl = "http://localhost:5000/api";

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get(["loggedInUser"], (res) => {  // ← Fixed here
    if (res.loggedInUser) {
      
      document.getElementById("loginForm").style.display = "none";
      document.getElementById("loggedInView").style.display = "block";
      document.getElementById("usernameDisplay").textContent = `Logged in as ${res.loggedInUser}`;
      document.getElementById("message").textContent = ""; // Clear any old message
    } else {
      
      document.getElementById("loginForm").style.display = "block";
      document.getElementById("loggedInView").style.display = "none";
    }
  });
});

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
        
        location.reload();
      });
    } else {
      showMessage(data.error || "Invalid username/password");
    }
  } catch (err) {
    showMessage("Server error: " + err.message);
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  chrome.storage.sync.remove(["loggedInUser"], () => {
    showMessage("Logged out");
    setTimeout(() => location.reload(), 800);
  });
});

function showMessage(msg) {
  const msgEl = document.getElementById("message");
  msgEl.textContent = msg;
  setTimeout(() => msgEl.textContent = "", 4000);
}