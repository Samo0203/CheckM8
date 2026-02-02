import express from "express";
import User from "../models/User.js";
import { sendOTPEmail } from "../utils/mailer.js";
import crypto from "crypto";

const router = express.Router();
const otpStore = new Map(); 


const otpAttempts = new Map(); 

router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    // Input validation
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    const cleanEmail = email.toLowerCase().trim();

    // max 3 OTPs per email per hour
    const now = Date.now();
    const attempts = otpAttempts.get(cleanEmail) || [];
    const recent = attempts.filter(time => now - time < 60 * 60 * 1000); 
    if (recent.length >= 3) {
      return res.status(429).json({ error: "Too many OTP requests. Try again in an hour." });
    }
    attempts.push(now);
    otpAttempts.set(cleanEmail, attempts);

    // Find user
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ error: "No account found with this email" });
    }

    // Generate and store OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    otpStore.set(cleanEmail, { otp, expires: now + 10 * 60 * 1000 }); // 10 min expiry

    // Send email
    await sendOTPEmail(cleanEmail, otp);
    console.log(`OTP sent to ${cleanEmail}`);

    res.json({ message: "OTP sent to your email" });
  } catch (err) {
    console.error("Send OTP error:", err);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    // Input validation
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: "Email, OTP, and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }
    const cleanEmail = email.toLowerCase().trim();

    // Check stored OTP
    const stored = otpStore.get(cleanEmail);
    if (!stored || Date.now() > stored.expires) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }
    if (stored.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // Find user
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update password
    const bcrypt = await import("bcryptjs");
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    // Clean up
    otpStore.delete(cleanEmail);
    otpAttempts.delete(cleanEmail);

    console.log(`Password reset successful for ${cleanEmail}`);
    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

export default router;
