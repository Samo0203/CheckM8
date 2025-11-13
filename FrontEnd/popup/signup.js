const backendUrl = "http://localhost:5000/api";

document.getElementById("signupBtn").addEventListener("click", async () => {
  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const confirmPassword = document.getElementById("confirmPassword").value.trim();

  if (!username || !password || !confirmPassword) {
    return showMessage("Please fill all required fields.");
  }

  if (password !== confirmPassword) return showMessage("Passwords do not match.");
  if (password.length < 6) return showMessage("Password must be at least 6 characters.");

  try {
    const res = await fetch(`${backendUrl}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, email })
    });

    const data = await res.json();
    if (res.ok) {
      showMessage(data.message || "Signup successful!");
      setTimeout(() => location.href = "popup.html", 1500);
    } else {
      showMessage(data.error || "Signup failed");
    }
  } catch (err) {
    showMessage("Server error: " + err.message);
  }
});

function showMessage(msg) {
  document.getElementById("message").innerText = msg;
}
