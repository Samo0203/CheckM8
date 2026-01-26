import mongoose from "mongoose";

const moveCountSchema = new mongoose.Schema({
  user: { type: String, required: true },
  fen: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  count: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now }
});

moveCountSchema.index({ user: 1, fen: 1, from: 1, to: 1 }, { unique: true });

export default mongoose.model("MoveCount", moveCountSchema);