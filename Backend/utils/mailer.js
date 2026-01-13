import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

export const sendOTPEmail = async (to, otp) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: `"CheckM8" <${process.env.SMTP_USER}>`,
    to,
    subject: "Your OTP for CheckM8",
    text: `Your OTP code is: ${otp}`
  });
};