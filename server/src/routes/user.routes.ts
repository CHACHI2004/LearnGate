import { Router } from "express";
import { getProfile, updateProfile, updateProfileImage } from "../controllers/user.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";
import { receiveProfileImage } from "../services/profile-image.service.js";

const router = Router();
router.use(requireAuth);
router.get("/me", asyncHandler(getProfile));
router.patch("/me", asyncHandler(updateProfile));
router.put("/me/profile-image", receiveProfileImage, asyncHandler(updateProfileImage));
export default router;
