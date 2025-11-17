import mongoose from "mongoose";

const arrowSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  color: { type: String, required: true },
  number: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Arrow", arrowSchema);
