import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";
import { changePassword, forgotPassword, login, logout, register, resendVerify, session, verify } from "../controllers/auth.controller.js";
import { receiveProfileImage } from "../services/profile-image.service.js";

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
const router = Router();

router.post("/register", authRateLimit, receiveProfileImage, asyncHandler(register));
router.post("/login", authRateLimit, asyncHandler(login));
router.post("/logout", asyncHandler(logout));
router.post("/verify-email", authRateLimit, asyncHandler(verify));
router.post("/resend-verification", authRateLimit, asyncHandler(resendVerify));
router.post("/forgot-password", authRateLimit, asyncHandler(forgotPassword));
router.post("/reset-password", authRateLimit, asyncHandler(changePassword));
router.get("/session", requireAuth, asyncHandler(session));

export default router;
