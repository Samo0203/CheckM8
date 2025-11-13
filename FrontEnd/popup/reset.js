const backendUrl = "http://localhost:5000/api"; // replace with your backend URL

// Send OTP
document.getElementById("sendOtpBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  if (!email) return showMessage("Enter your email.");

  try {
    const res = await fetch(`${backendUrl}/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await res.json();

    if (res.ok) {
      showMessage(data.message || "OTP sent!");
      document.getElementById("otpSection").style.display = "block";
    } else {
      showMessage(data.error || "Failed to send OTP");
    }
  } catch (err) {
    showMessage("Server error: " + err.message);
  }
});

// Reset Password
document.getElementById("resetBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const otp = document.getElementById("otp").value.trim();
  const newPassword = document.getElementById("newPassword").value.trim();
  const confirmPassword = document.getElementById("confirmPassword").value.trim();

  if (!otp || !newPassword || !confirmPassword) return showMessage("Fill all fields");
  if (newPassword !== confirmPassword) return showMessage("Passwords do not match");
  if (newPassword.length < 6) return showMessage("Password must be at least 6 characters");

  try {
    const res = await fetch(`${backendUrl}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp, newPassword })
    });
    const data = await res.json();
    showMessage(data.message || "Password reset response received!");

    if (res.ok) setTimeout(() => location.href = "popup.html", 1500);
  } catch (err) {
    showMessage("Server error: " + err.message);
  }
});

function showMessage(msg) {
  document.getElementById("message").innerText = msg;
}
