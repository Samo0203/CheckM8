import express from "express";
import Arrow from "../models/Arrow.js";

const router = express.Router();

// ---------------- SAVE ARROW ----------------
router.post("/save-arrow", async (req, res) => {
  const { from, to, color, number, user, variationID } = req.body;

  // 🔒 Strong validation (clear errors)
  if (!from) return res.status(400).json({ error: "from is required" });
  if (!to) return res.status(400).json({ error: "to is required" });
  if (!color) return res.status(400).json({ error: "color is required" });
  if (number === undefined) return res.status(400).json({ error: "number is required" });
  if (!user) return res.status(400).json({ error: "user is required" });
  if (variationID === undefined) return res.status(400).json({ error: "variationID is required" });

  try {
    const newArrow = new Arrow({
      from,
      to,
      color,
      number,
      user,
      variationID,
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

// ---------------- GET ARROWS BY USER ----------------
router.get("/get-arrows/:user", async (req, res) => {
  const { user } = req.params;

  try {
    const arrows = await Arrow.find({ user }).sort({ createdAt: 1 });
    res.json(arrows);
  } catch (err) {
    console.error("Get arrows error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
