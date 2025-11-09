document.getElementById("sendOtpBtn").addEventListener("click", () => {
  const email = document.getElementById("email").value.trim();
  if (!email) {
    showMessage("Enter your email");
    return;
  }

  // Simulate OTP (for now)
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  chrome.storage.sync.set({ otp, resetEmail: email });
  showMessage(`OTP sent to ${email} (simulated)`);
  document.getElementById("otpSection").style.display = "block";
});

document.getElementById("resetBtn").addEventListener("click", () => {
  const otpInput = document.getElementById("otp").value.trim();
  const newPassword = document.getElementById("newPassword").value.trim();

  chrome.storage.sync.get(["otp", "resetEmail", "users"], (result) => {
    if (otpInput !== result.otp) {
      showMessage("Invalid OTP");
      return;
    }

    const users = result.users || [];
    const email = result.resetEmail;
    const user = users.find(u => u.email === email);

    if (user) {
      user.password = newPassword;
      chrome.storage.sync.set({ users }, () => {
        showMessage("Password reset successful!");
      });
    } else {
      showMessage("User not found");
    }
  });
});

function showMessage(msg) {
  document.getElementById("message").innerText = msg;
}
