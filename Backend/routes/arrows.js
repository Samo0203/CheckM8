import express from "express";
import Arrow from "../models/Arrow.js";

const router = express.Router();

router.post("/save-arrow", async (req, res) => {
  try {
    const { from, to, color, number } = req.body;

    const arrow = new Arrow({ from, to, color, number });
    await arrow.save();

    res.json({ success: true, arrow });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
