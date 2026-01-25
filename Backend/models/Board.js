import mongoose from "mongoose";

const boardSchema = new mongoose.Schema({
  user: { type: String, required: true },
  boardId: { type: String, required: true, unique: true },
  fen: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }             
});

export default mongoose.model("Board", boardSchema);