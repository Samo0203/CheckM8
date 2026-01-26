import express from "express";
import MoveCount from "../models/MoveCount.js";

const router = express.Router();

router.post("/increment-move-count", async (req, res) => {
  const { user, fen, from, to } = req.body;

  if (!user || !fen || !from || !to) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const updated = await MoveCount.findOneAndUpdate(
      { user, fen, from, to },
      { $inc: { count: 1 } },
      { upsert: true, new: true }
    );

    res.json({
      message: "Move count updated successfully",
      count: updated.count,
    });
  } catch (err) {
    console.error("Increment move count error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/get-all-move-counts/:user", async (req, res) => {
  const { user } = req.params;

  try {
    const counts = await MoveCount.find({ user }).sort({ createdAt: -1 });
    res.json(counts);
  } catch (err) {
    console.error("Get all move counts error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/get-move-counts/:user/:fen", async (req, res) => {
  const { user, fen } = req.params;

  try {
    const counts = await MoveCount.find({ user, fen }).sort({ count: -1 });
    res.json(counts);
  } catch (err) {
    console.error("Get move counts error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;