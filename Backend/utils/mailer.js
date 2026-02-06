import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();


if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
  console.error("ERROR: SMTP_USER and SMTP_PASS must be set in .env file");
  process.exit(1); 
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});


transporter.verify((error, success) => {
  if (error) {
    console.error("SMTP transporter verification failed:", error);
  } else {
    console.log("SMTP transporter ready");
  }
});

export const sendOTPEmail = async (to, otp) => {
  if (!to || !otp) {
    throw new Error("Missing required parameters: to or otp");
  }

  const fromName = process.env.APP_NAME || "CheckM8";
  const fromEmail = process.env.SMTP_USER;

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject: "Your OTP for CheckM8 – Valid for 10 minutes",
    text: `Hello,

Your OTP code is: ${otp}

This code is valid for 10 minutes. Please do not share it with anyone.

If you did not request this, ignore this email.

Thanks,
CheckM8 Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">CheckM8 OTP Verification</h2>
        <p>Hello,</p>
        <p>Your one-time password (OTP) is:</p>
        <h1 style="background: #f0f0f0; padding: 15px; text-align: center; letter-spacing: 8px; font-size: 32px;">
          ${otp}
        </h1>
        <p>This code is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
        <p>If you did not request this OTP, please ignore this email or contact support.</p>
        <p style="margin-top: 30px; color: #666; font-size: 14px;">
          Thanks,<br>
          CheckM8 Team
        </p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`OTP email sent successfully to ${to} - Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`Failed to send OTP email to ${to}:`, error.message);
    throw new Error("Failed to send OTP email");
  }
};