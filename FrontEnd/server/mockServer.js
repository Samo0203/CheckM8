function mockSignup(username, password, email) {
  let users = JSON.parse(localStorage.getItem("users")) || [];
  if (users.find(u => u.username === username)) return false;
  users.push({ username, password, email });
  localStorage.setItem("users", JSON.stringify(users));
  return true;
}

function mockLogin(username, password) {
  let users = JSON.parse(localStorage.getItem("users")) || [];
  return users.some(u => u.username === username && u.password === password);
}

function mockSendOTP(email) {
  let users = JSON.parse(localStorage.getItem("users")) || [];
  const user = users.find(u => u.email === email);
  if (!user) return null;
  const otp = Math.floor(100000 + Math.random() * 900000);
  localStorage.setItem("otp_" + email, otp);
  return otp;
}
