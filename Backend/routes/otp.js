import express from "express";
import User from "../models/User.js";
import { sendOTPEmail } from "../utils/mailer.js";
import crypto from "crypto";

const router = express.Router();
const otpStore = new Map(); 

// Send OTP
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "Email not found" });

    const otp = crypto.randomInt(100000, 999999).toString();
    otpStore.set(email, otp);

    await sendOTPEmail(email, otp);
    res.json({ message: "OTP sent to your email" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset password
router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ error: "Missing fields" });

    const storedOtp = otpStore.get(email);
    if (storedOtp !== otp) return res.status(400).json({ error: "Invalid OTP" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const bcrypt = await import("bcryptjs");
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    otpStore.delete(email);

    res.json({ message: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
