import { Router } from "express";
import { readSubjectReport } from "../controllers/report.controller.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { requireSubjectAccess } from "../middleware/resource-access.js";
import { asyncHandler } from "../utils/async-handler.js";

const router = Router();
router.use(requireAuth, requireRoles("faculty"));
router.get("/subjects/:subjectId", requireSubjectAccess, asyncHandler(readSubjectReport));

export default router;
