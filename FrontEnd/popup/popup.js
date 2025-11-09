document.getElementById("loginBtn").addEventListener("click", () => {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    showMessage("Please fill all fields");
    return;
  }

  // Placeholder: Replace with backend API call later
  chrome.storage.sync.get(["users"], (result) => {
    const users = result.users || [];
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
      showMessage(`Welcome back, ${username}!`);
    } else {
      showMessage("Invalid credentials");
    }
  });
});

function showMessage(msg) {
  document.getElementById("message").innerText = msg;
}
