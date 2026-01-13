import mongoose from "mongoose";

const arrowSchema = new mongoose.Schema({
<<<<<<< Updated upstream
  from: { type: String, required: true },         // e.g., "e2"
  to: { type: String, required: true },           // e.g., "e4"
  color: { type: String, required: true },        // e.g., "green", "yellow"
  number: { type: Number, required: true },       // the sequence number
  user: { type: String, required: true },         // the logged-in user
  variationID: { type: Number, default: 0 },     // variation ID, default to 0
  createdAt: { type: Date, default: Date.now }   // timestamp for sorting
});

const Arrow = mongoose.model("arrow", arrowSchema);
export default Arrow;
=======
  from: { type: String, required: true },         
  to: { type: String, required: true },           
  color: { type: String, required: true },        
  number: { type: Number, required: true },       
  user: { type: String, required: true },         
  boardId: { type: String, required: true },      
  variationID: { type: Number, default: 0 },     
  analysis: { type: String, enum: ['good', 'bad', 'best', 'unknown'], default: 'unknown' },
  createdAt: { type: Date, default: Date.now }    
});

export default mongoose.model("Arrow", arrowSchema);
>>>>>>> Stashed changes
