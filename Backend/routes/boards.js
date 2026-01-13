import express from "express";
import Board from "../models/Board.js";

const router = express.Router();

router.post("/save-board", async (req, res) => {
  const { user, boardId, fen } = req.body;

  if (!user || !boardId || !fen) return res.status(400).json({ error: "Missing required fields" });

  try {
    const newBoard = new Board({
      user,
      boardId,
      fen,
      createdAt: new Date(),
    });

    await newBoard.save();

    res.status(201).json({
      message: "Board saved successfully",
      board: newBoard,
    });
  } catch (err) {
    console.error("Save board error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/get-boards/:user", async (req, res) => {
  const { user } = req.params;

  try {
    const boards = await Board.find({ user }).sort({ createdAt: -1 });
    res.json(boards);
  } catch (err) {
    console.error("Get boards error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;