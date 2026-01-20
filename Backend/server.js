// server.js

import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import otpRoutes from "./routes/otp.js";
import arrowRoutes from "./routes/arrows.js";
import boardRoutes from "./routes/boards.js";

dotenv.config();

const app = express();

// ──────────────────────────────
//   IMPROVED CORS CONFIGURATION
// ──────────────────────────────
app.use(cors({
    origin: '*',                    // ← allows literally everyone
    methods: ['GET','POST','OPTIONS'],
    allowedHeaders: ['Content-Type']
}));



// ... rest of your code remains the same
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("MongoDB connection error:", err));

app.use("/api", authRoutes);
app.use("/api", otpRoutes);
app.use("/api", arrowRoutes);
app.use("/api", boardRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));