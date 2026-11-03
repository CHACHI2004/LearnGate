import { Router } from "express";
import { getAnalytics, listUsers, setAccountStatus, setFacultyApproval } from "../controllers/admin.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";

const router = Router();
router.use(requireAuth, requireAdmin);
router.get("/analytics", asyncHandler(getAnalytics));
router.get("/users", asyncHandler(listUsers));
router.patch("/users/:userId/faculty-approval", asyncHandler(setFacultyApproval));
router.patch("/users/:userId/status", asyncHandler(setAccountStatus));
export default router;
