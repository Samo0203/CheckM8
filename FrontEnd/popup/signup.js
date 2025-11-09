document.getElementById("signupBtn").addEventListener("click", () => {
  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !email || !password) {
    showMessage("Please fill all fields");
    return;
  }

  chrome.storage.sync.get(["users"], (result) => {
    const users = result.users || [];

    if (users.some(u => u.username === username)) {
      showMessage("Username already exists");
      return;
    }

    users.push({ username, email, password });
    chrome.storage.sync.set({ users }, () => {
      showMessage("Account created! You can login now.");
    });
  });
});

function showMessage(msg) {
  document.getElementById("message").innerText = msg;
}
