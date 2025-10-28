import express from "express";
import { registerUser, loginUser, updateUser, deleteUser } from "../controllers/authController.js";

const router = express.Router();


router.post("/signup", registerUser);


router.post("/login", loginUser);


router.put("/user/:id", updateUser);


router.delete("/user/:id", deleteUser);

export default router;
