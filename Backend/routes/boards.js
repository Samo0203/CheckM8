// routes/boards.js
import express from "express";
import Board from "../models/Board.js";

const router = express.Router();

router.post("/save-board", async (req, res) => {
  const { user, boardId, fen } = req.body;

  if (!user || !boardId || !fen) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    
    const board = await Board.findOneAndUpdate(
      { user, boardId },                          
      {
        fen,
        updatedAt: new Date(),                    
      },
      {
        upsert: true,                            
        new: true,                                
        setDefaultsOnInsert: true                 
      }
    );

    console.log(
      `Board ${boardId} ${board.isNew ? "created" : "updated"} for user ${user}`
    );

    res.status(200).json({
      message: "Board saved successfully",
      board,
    });
  } catch (err) {
    console.error("Save board error:", err);

    if (err.code === 11000) {
      return res.status(409).json({ error: "Duplicate boardId detected" });
    }

    res.status(500).json({ error: "Server error while saving board" });
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