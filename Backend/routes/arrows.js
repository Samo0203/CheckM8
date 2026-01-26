import express from "express";
import Arrow from "../models/Arrow.js";

const router = express.Router();

router.post("/save-arrow", async (req, res) => {
  const { from, to, color, number, user, boardId, variationID, analysis } = req.body;

  // Change from strict check to log what's missing
if (!from || !to || !color || number === undefined || !user || !boardId || variationID === undefined || !analysis) {
    console.log("Missing fields in /save-arrow:", { from, to, color, number, user, boardId, variationID, analysis });
    return res.status(400).json({ error: "Missing required fields", missing: { from, to, color, number, user, boardId, variationID, analysis } });
}

  try {
    const newArrow = new Arrow({
      from,
      to,
      color,
      number,
      user,
      boardId,
      variationID,
      analysis,
      createdAt: new Date(),
    });

    await newArrow.save();

    res.status(201).json({
      message: "Arrow saved successfully",
      arrow: newArrow,
    });
  } catch (err) {
    console.error("Save arrow error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/get-arrows/:user", async (req, res) => {
  const { user } = req.params;
  const { boardId } = req.query;

  try {
    const query = { user };
    if (boardId) query.boardId = boardId;
    const arrows = await Arrow.find(query).sort({ createdAt: 1 });
    res.json(arrows);
  } catch (err) {
    console.error("Get arrows error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;