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

// Simple board viewer (replace with React/Vue if needed)
app.get("/view/:boardId", async (req, res) => {
  const { boardId } = req.params;

  try {
    const board = await Board.findOne({ boardId });
    if (!board) return res.status(404).send("Board not found");

    const arrows = await Arrow.find({ boardId }).sort({ number: 1 });

    let html = `
      <html>
        <head><title>Board ${boardId}</title></head>
        <body>
          <h1>Board ${boardId}</h1>
          <p>FEN: ${board.fen}</p>
          <h2>Arrows (${arrows.length})</h2>
          <ul>
            ${arrows.map(a => `<li>${a.number}: ${a.from}-${a.to} (${a.color}, ${a.analysis})</li>`).join('')}
          </ul>
          <a href="https://lichess.org/analysis?fen=${encodeURIComponent(board.fen)}&boardId=${boardId}">Open in Lichess</a>
        </body>
      </html>
    `;

    res.send(html);
  } catch (err) {
    res.status(500).send("Error loading board");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));